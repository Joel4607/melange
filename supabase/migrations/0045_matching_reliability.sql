-- Complete, auditable matching attempts and finalize them atomically with the
-- task state they activate.

alter table public.match_runs
  add column outcome text not null default 'matched'
    check (outcome in ('matched', 'no_candidates')),
  add column source text not null default 'automatic'
    check (source in ('automatic', 'manual', 'self_claim')),
  add column algorithm_version text not null default 'legacy',
  add column config_version text not null default 'legacy',
  add column config jsonb not null default '{}'::jsonb,
  add column candidate_count integer not null default 0
    check (candidate_count >= 0);

update public.match_runs mr
set candidate_count = (
      select count(*)::integer
      from public.match_candidates mc
      where mc.match_run_id = mr.id
    ),
    outcome = case
      when exists (
        select 1 from public.match_candidates mc where mc.match_run_id = mr.id
      ) then 'matched'
      else 'no_candidates'
    end;

alter table public.match_candidates
  rename column availability to capacity;

alter table public.tasks
  add column active_match_run_id uuid
    references public.match_runs (id) on delete set null;

update public.tasks t
set active_match_run_id = (
  select mr.id
  from public.match_runs mr
  where mr.task_id = t.id
    and mr.outcome = 'matched'
  order by mr.generated_at desc, mr.id desc
  limit 1
)
where t.status <> 'posted'
  and t.active_match_run_id is null;

update public.tasks
set status = 'posted'
where status = 'matched'
  and selected_runner_id is null
  and active_match_run_id is null;

create index tasks_active_match_run_idx
  on public.tasks (active_match_run_id)
  where active_match_run_id is not null;
create index match_runs_outcome_source_idx
  on public.match_runs (outcome, source, generated_at desc);
create unique index match_candidates_run_rank_unique
  on public.match_candidates (match_run_id, rank);
create unique index match_candidates_run_runner_unique
  on public.match_candidates (match_run_id, runner_id);

create table match_outcomes (
  id                 uuid primary key default gen_random_uuid(),
  match_run_id       uuid not null references public.match_runs (id) on delete cascade,
  task_id            uuid not null references public.tasks (id) on delete cascade,
  runner_id          uuid not null references public.profiles (id) on delete cascade,
  offered_at         timestamptz not null default now(),
  responded_at       timestamptz,
  accepted           boolean not null default false,
  declined           boolean not null default false,
  picked_up_at       timestamptz,
  pickup_minutes     double precision check (pickup_minutes >= 0),
  completed_at       timestamptz,
  cancelled_at       timestamptz,
  completion_minutes double precision check (completion_minutes >= 0),
  disputed           boolean not null default false,
  disputed_at        timestamptz,
  resolved_at        timestamptz,
  resolution         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (match_run_id, runner_id),
  check (not (accepted and declined))
);

create index match_outcomes_task_idx on public.match_outcomes (task_id);
create index match_outcomes_runner_offer_idx
  on public.match_outcomes (runner_id, offered_at desc);

alter table match_outcomes enable row level security;

create policy match_outcomes_select on match_outcomes
  for select using (
    public.is_admin()
    or runner_id = auth.uid()
    or exists (
      select 1
      from public.tasks t
      where t.id = match_outcomes.task_id
        and t.buyer_id = auth.uid()
    )
  );

-- Simulated task funding and the initial hold share the task lock. A task-scoped
-- top-up ledger row makes retry/concurrent requests idempotent.
create or replace function public.fund_and_hold_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer_id uuid;
  v_price numeric(12, 2);
  v_task_status public.task_status;
  v_balance numeric(12, 2);
  v_shortfall numeric(12, 2);
  v_funded boolean;
begin
  select t.buyer_id, t.price, t.status
  into v_buyer_id, v_price, v_task_status
  from public.tasks t
  where t.id = p_task_id
  for update;

  if not found then
    raise exception 'escrow: task % not found', p_task_id;
  end if;
  if v_task_status <> 'matched' then
    raise exception 'escrow: task % is not awaiting a runner', p_task_id;
  end if;

  if exists (
    select 1 from public.ledger_entries
    where task_id = p_task_id and type = 'hold'
  ) then
    return;
  end if;

  insert into public.wallets (user_id, balance, held)
  values (v_buyer_id, 0, 0)
  on conflict (user_id) do nothing;

  select w.balance into v_balance
  from public.wallets w
  where w.user_id = v_buyer_id
  for update;
  v_shortfall := greatest(v_price - v_balance, 0);

  if v_shortfall > 0 then
    insert into public.ledger_entries (task_id, user_id, type, amount)
    values (p_task_id, v_buyer_id, 'topup', v_shortfall)
    on conflict (task_id, type) where task_id is not null do nothing
    returning true into v_funded;

    if coalesce(v_funded, false) then
      update public.wallets
      set balance = balance + v_shortfall
      where user_id = v_buyer_id;
    end if;
  end if;

  perform public.hold_funds(p_task_id);
end;
$$;

create or replace function public.finalize_match_run(
  p_task_id uuid,
  p_source text,
  p_algorithm_version text,
  p_config_version text,
  p_config jsonb,
  p_candidates jsonb,
  p_self_claim_runner_id uuid default null
)
returns table (status text, run_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task_status public.task_status;
  v_selected_runner_id uuid;
  v_run_id uuid;
  v_candidate jsonb;
  v_candidate_count integer;
begin
  if p_source not in ('automatic', 'manual', 'self_claim') then
    raise exception 'matching: invalid source %', p_source;
  end if;
  if p_algorithm_version is null or p_config_version is null then
    raise exception 'matching: algorithm and configuration versions are required';
  end if;
  if p_candidates is null or jsonb_typeof(p_candidates) <> 'array' then
    raise exception 'matching: candidates must be a JSON array';
  end if;

  select t.status, t.selected_runner_id
  into v_task_status, v_selected_runner_id
  from public.tasks t
  where t.id = p_task_id
  for update;

  if not found
     or v_task_status <> 'posted'
     or v_selected_runner_id is not null then
    return query select 'not_posted'::text, null::uuid;
    return;
  end if;

  v_candidate_count := jsonb_array_length(p_candidates);

  if (p_source = 'self_claim') <> (p_self_claim_runner_id is not null)
     or (p_self_claim_runner_id is not null and (
    v_candidate_count <> 1
    or (p_candidates -> 0 ->> 'runnerId')::uuid <> p_self_claim_runner_id
  )) then
    raise exception 'matching: self claim must contain exactly the claiming runner';
  end if;

  insert into public.match_runs (
    task_id,
    outcome,
    source,
    algorithm_version,
    config_version,
    config,
    candidate_count
  ) values (
    p_task_id,
    case when v_candidate_count = 0 then 'no_candidates' else 'matched' end,
    p_source,
    p_algorithm_version,
    p_config_version,
    coalesce(p_config, '{}'::jsonb),
    v_candidate_count
  ) returning id into v_run_id;

  for v_candidate in select value from jsonb_array_elements(p_candidates)
  loop
    insert into public.match_candidates (
      match_run_id,
      runner_id,
      rank,
      match_score,
      proximity,
      trust,
      capacity,
      urgency_fit,
      distance_km
    ) values (
      v_run_id,
      (v_candidate ->> 'runnerId')::uuid,
      (v_candidate ->> 'rank')::integer,
      (v_candidate ->> 'matchScore')::double precision,
      (v_candidate -> 'components' ->> 'proximity')::double precision,
      (v_candidate -> 'components' ->> 'trust')::double precision,
      (v_candidate -> 'components' ->> 'capacity')::double precision,
      (v_candidate -> 'components' ->> 'urgencyFit')::double precision,
      (v_candidate -> 'components' ->> 'distanceKm')::double precision
    );
  end loop;

  if jsonb_array_length(p_candidates) = 0 then
    update public.match_runs
    set outcome = 'no_candidates'
    where id = v_run_id;
    return query select 'no_candidates'::text, v_run_id;
    return;
  end if;

  update public.tasks
  set status = 'matched',
      active_match_run_id = v_run_id,
      selected_runner_id = p_self_claim_runner_id
  where id = p_task_id;

  if p_self_claim_runner_id is not null then
    perform public.fund_and_hold_task(p_task_id);
    insert into public.match_outcomes (
      match_run_id, task_id, runner_id, offered_at, updated_at
    ) values (
      v_run_id, p_task_id, p_self_claim_runner_id, now(), now()
    );
  end if;

  return query select 'matched'::text, v_run_id;
end;
$$;

create or replace function public.offer_next_match_candidate(
  p_task_id uuid,
  p_ensure_hold boolean default false
)
returns table (status text, offered_runner_id uuid, run_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.task_status;
  v_selected_runner_id uuid;
  v_active_run_id uuid;
  v_declined_runner_ids uuid[];
  v_runner_id uuid;
begin
  select t.status, t.selected_runner_id, t.active_match_run_id, t.declined_runner_ids
  into v_status, v_selected_runner_id, v_active_run_id, v_declined_runner_ids
  from public.tasks t
  where t.id = p_task_id
  for update;

  if not found
     or v_status <> 'matched'
     or v_selected_runner_id is not null
     or v_active_run_id is null then
    return query select 'not_matchable'::text, null::uuid, v_active_run_id;
    return;
  end if;

  select mc.runner_id
  into v_runner_id
  from public.match_candidates mc
  where mc.match_run_id = v_active_run_id
    and not (mc.runner_id = any(coalesce(v_declined_runner_ids, '{}'::uuid[])))
  order by mc.rank
  limit 1;

  if v_runner_id is null then
    update public.tasks
    set status = 'posted', active_match_run_id = null
    where id = p_task_id;
    return query select 'reopened'::text, null::uuid, v_active_run_id;
    return;
  end if;

  if p_ensure_hold then
    perform public.fund_and_hold_task(p_task_id);
  end if;

  update public.tasks
  set selected_runner_id = v_runner_id
  where id = p_task_id;

  insert into public.match_outcomes (
    match_run_id, task_id, runner_id, offered_at, updated_at
  ) values (
    v_active_run_id, p_task_id, v_runner_id, now(), now()
  )
  on conflict (match_run_id, runner_id)
  do update set offered_at = excluded.offered_at, updated_at = excluded.updated_at;

  return query select 'offered'::text, v_runner_id, v_active_run_id;
end;
$$;

create or replace function public.decline_and_offer_next_candidate(
  p_task_id uuid,
  p_runner_id uuid
)
returns table (status text, offered_runner_id uuid, run_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.task_status;
  v_selected_runner_id uuid;
  v_active_run_id uuid;
  v_declined_runner_ids uuid[];
  v_next_runner_id uuid;
begin
  select t.status, t.selected_runner_id, t.active_match_run_id, t.declined_runner_ids
  into v_status, v_selected_runner_id, v_active_run_id, v_declined_runner_ids
  from public.tasks t
  where t.id = p_task_id
  for update;

  if not found
     or v_status <> 'matched'
     or v_selected_runner_id is distinct from p_runner_id
     or v_active_run_id is null then
    return query select 'not_matchable'::text, null::uuid, v_active_run_id;
    return;
  end if;

  if not (p_runner_id = any(coalesce(v_declined_runner_ids, '{}'::uuid[]))) then
    v_declined_runner_ids := array_append(
      coalesce(v_declined_runner_ids, '{}'::uuid[]),
      p_runner_id
    );
  end if;

  insert into public.match_outcomes (
    match_run_id, task_id, runner_id, offered_at, responded_at,
    accepted, declined, updated_at
  ) values (
    v_active_run_id, p_task_id, p_runner_id, now(), now(), false, true, now()
  )
  on conflict (match_run_id, runner_id)
  do update set
    responded_at = excluded.responded_at,
    accepted = false,
    declined = true,
    updated_at = excluded.updated_at;

  select mc.runner_id
  into v_next_runner_id
  from public.match_candidates mc
  where mc.match_run_id = v_active_run_id
    and not (mc.runner_id = any(v_declined_runner_ids))
  order by mc.rank
  limit 1;

  if v_next_runner_id is null then
    update public.tasks
    set status = 'posted',
        selected_runner_id = null,
        active_match_run_id = null,
        declined_runner_ids = v_declined_runner_ids
    where id = p_task_id;
    return query select 'reopened'::text, null::uuid, v_active_run_id;
    return;
  end if;

  update public.tasks
  set selected_runner_id = v_next_runner_id,
      declined_runner_ids = v_declined_runner_ids
  where id = p_task_id;

  insert into public.match_outcomes (
    match_run_id, task_id, runner_id, offered_at, updated_at
  ) values (
    v_active_run_id, p_task_id, v_next_runner_id, now(), now()
  )
  on conflict (match_run_id, runner_id)
  do update set offered_at = excluded.offered_at, updated_at = excluded.updated_at;

  return query select 'offered'::text, v_next_runner_id, v_active_run_id;
end;
$$;

create or replace function public.cancel_task_with_refund(
  p_task_id uuid,
  p_actor_id uuid,
  p_actor_kind text
)
returns table (
  status text,
  selected_runner_id uuid,
  buyer_id uuid,
  task_title text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks%rowtype;
begin
  select t.* into v_task
  from public.tasks t
  where t.id = p_task_id
  for update;

  if not found then
    return query select 'not_cancellable'::text, null::uuid, null::uuid, null::text;
    return;
  end if;

  if p_actor_kind = 'buyer' then
    if v_task.buyer_id <> p_actor_id or v_task.status not in ('posted', 'matched') then
      return query select 'not_cancellable'::text, null::uuid, null::uuid, null::text;
      return;
    end if;
  elsif p_actor_kind = 'runner' then
    if v_task.selected_runner_id <> p_actor_id
       or v_task.status not in ('accepted', 'in_progress') then
      return query select 'not_cancellable'::text, null::uuid, null::uuid, null::text;
      return;
    end if;
  else
    raise exception 'matching: invalid cancellation actor kind %', p_actor_kind;
  end if;

  perform public.refund_funds(p_task_id);
  update public.tasks set status = 'cancelled' where id = p_task_id;

  return query select
    'cancelled'::text,
    v_task.selected_runner_id,
    v_task.buyer_id,
    v_task.title;
end;
$$;

revoke all on function public.finalize_match_run(
  uuid, text, text, text, jsonb, jsonb, uuid
) from public, anon, authenticated;
grant execute on function public.finalize_match_run(
  uuid, text, text, text, jsonb, jsonb, uuid
) to service_role;

revoke all on function public.fund_and_hold_task(uuid)
  from public, anon, authenticated;
grant execute on function public.fund_and_hold_task(uuid)
  to service_role;

revoke all on function public.offer_next_match_candidate(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.offer_next_match_candidate(uuid, boolean)
  to service_role;

revoke all on function public.decline_and_offer_next_candidate(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.decline_and_offer_next_candidate(uuid, uuid)
  to service_role;

revoke all on function public.cancel_task_with_refund(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_task_with_refund(uuid, uuid, text)
  to service_role;
