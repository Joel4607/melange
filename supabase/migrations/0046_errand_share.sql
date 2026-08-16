-- Errand-Share: pair two flexible errands first, then match the pair as one
-- auditable runner opportunity. All lifecycle mutations are service-role RPCs
-- so each group and both child tasks move atomically.

alter table public.tasks
  add column share_state text not null default 'ineligible'
    check (share_state in ('ineligible','waiting','paired','released')),
  add column share_window_ends_at timestamptz,
  add column share_released_at timestamptz,
  add column share_group_id uuid,
  add column delivery_deadline_at timestamptz;

create table public.errand_share_groups (
  id                       uuid primary key default gen_random_uuid(),
  status                   text not null default 'posted'
    check (status in (
      'posted', 'awaiting_funding', 'offered', 'accepted',
      'in_progress', 'completed', 'dissolved'
    )),
  ordered_route            jsonb not null check (
    jsonb_typeof(ordered_route) = 'array'
    and not jsonb_path_exists(ordered_route, '$[*].point')
  ),
  algorithm_version        text not null,
  config_version           text not null,
  config                   jsonb not null default '{}'::jsonb,
  predicted_solo_km        double precision not null check (predicted_solo_km >= 0),
  predicted_shared_km      double precision not null check (predicted_shared_km >= 0),
  predicted_saved_km       double precision not null check (predicted_saved_km > 0),
  stricter_deadline_at     timestamptz,
  confirmation_deadline_at timestamptz not null,
  selected_runner_id       uuid references public.profiles (id),
  active_match_run_id      uuid,
  offered_at               timestamptz,
  accepted_at              timestamptz,
  started_at               timestamptz,
  completed_at             timestamptz,
  dissolved_at             timestamptz,
  dissolution_reason       text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

alter table public.tasks
  add constraint tasks_share_group_fk
  foreign key (share_group_id)
  references public.errand_share_groups (id)
  on delete set null;

create table public.errand_share_members (
  group_id                uuid not null references public.errand_share_groups (id) on delete cascade,
  task_id                 uuid not null references public.tasks (id) on delete restrict,
  pickup_position         integer not null check (pickup_position between 1 and 4),
  dropoff_position        integer not null check (dropoff_position between 1 and 4),
  direct_distance_km      double precision not null check (direct_distance_km >= 0),
  carried_distance_km     double precision not null check (carried_distance_km >= 0),
  detour_km               double precision not null check (detour_km >= 0),
  detour_ratio            double precision check (detour_ratio >= 0),
  predicted_completion_at timestamptz not null,
  escrow_confirmed_at     timestamptz,
  completed_at            timestamptz,
  created_at              timestamptz not null default now(),
  primary key (group_id, task_id),
  unique (group_id, pickup_position),
  unique (group_id, dropoff_position),
  check (pickup_position < dropoff_position)
);

create table public.errand_share_decisions (
  id                uuid primary key default gen_random_uuid(),
  task_a_id         uuid not null references public.tasks (id) on delete cascade,
  task_b_id         uuid not null references public.tasks (id) on delete cascade,
  accepted          boolean not null,
  reason            text,
  algorithm_version text not null,
  config_version    text not null,
  config            jsonb not null default '{}'::jsonb,
  metrics           jsonb not null default '{}'::jsonb,
  deadline_met      boolean,
  evaluated_at      timestamptz not null default now(),
  check (task_a_id <> task_b_id),
  check ((accepted and reason is null) or (not accepted and reason is not null))
);

create table public.errand_share_match_runs (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references public.errand_share_groups (id) on delete cascade,
  outcome           text not null check (outcome in ('matched', 'no_candidates')),
  source            text not null check (source in ('automatic', 'manual', 'self_claim')),
  algorithm_version text not null,
  config_version    text not null,
  config            jsonb not null default '{}'::jsonb,
  candidate_count   integer not null check (candidate_count >= 0),
  generated_at      timestamptz not null default now()
);

alter table public.errand_share_groups
  add constraint errand_share_groups_active_run_fk
  foreign key (active_match_run_id)
  references public.errand_share_match_runs (id)
  on delete set null;

create table public.errand_share_match_candidates (
  match_run_id uuid not null references public.errand_share_match_runs (id) on delete cascade,
  runner_id    uuid not null references public.profiles (id) on delete cascade,
  rank         integer not null check (rank > 0),
  match_score  double precision not null,
  proximity    double precision not null,
  trust        double precision not null,
  capacity     double precision not null,
  urgency_fit  double precision not null,
  distance_km  double precision not null check (distance_km >= 0),
  created_at   timestamptz not null default now(),
  primary key (match_run_id, runner_id),
  unique (match_run_id, rank)
);

create table public.errand_share_match_outcomes (
  id                 uuid primary key default gen_random_uuid(),
  match_run_id       uuid not null references public.errand_share_match_runs (id) on delete cascade,
  group_id           uuid not null references public.errand_share_groups (id) on delete cascade,
  runner_id          uuid not null references public.profiles (id) on delete cascade,
  offered_at         timestamptz not null default now(),
  responded_at       timestamptz,
  accepted           boolean not null default false,
  declined           boolean not null default false,
  started_at         timestamptz,
  completed_at       timestamptz,
  cancelled_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (match_run_id, runner_id),
  check (not (accepted and declined))
);

create index tasks_share_waiting_idx
  on public.tasks (share_state, share_window_ends_at, created_at)
  where status = 'posted' and share_state = 'waiting';
create index tasks_share_group_idx
  on public.tasks (share_group_id)
  where share_group_id is not null;
create index errand_share_groups_status_deadline_idx
  on public.errand_share_groups (status, confirmation_deadline_at);
create index errand_share_members_task_idx
  on public.errand_share_members (task_id);
create index errand_share_members_group_idx
  on public.errand_share_members (group_id);
create index errand_share_decisions_pair_time_idx
  on public.errand_share_decisions (task_a_id, task_b_id, evaluated_at desc);
create index errand_share_match_candidates_rank_idx
  on public.errand_share_match_candidates (match_run_id, rank);
create index errand_share_match_outcomes_runner_time_idx
  on public.errand_share_match_outcomes (runner_id, offered_at desc);

-- A non-dissolved group is valid only when it has exactly two child tasks.
create or replace function public.check_errand_share_has_two_members()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_group_id uuid;
  v_status text;
begin
  if tg_table_name = 'errand_share_groups' then
    if tg_op = 'DELETE' then v_group_id := old.id; else v_group_id := new.id; end if;
  else
    if tg_op = 'DELETE' then v_group_id := old.group_id; else v_group_id := new.group_id; end if;
  end if;

  select status into v_status
  from public.errand_share_groups
  where id = v_group_id;

  if found and v_status <> 'dissolved' and (
    select count(*) from public.errand_share_members where group_id = v_group_id
  ) <> 2 then
    raise exception 'errand-share: non-dissolved group % must have exactly two members', v_group_id;
  end if;
  return coalesce(new, old);
end;
$$;

create constraint trigger errand_share_exactly_two_members
after insert or update or delete on public.errand_share_members
deferrable initially deferred
for each row execute function public.check_errand_share_has_two_members();

create constraint trigger errand_share_group_exactly_two_members
after insert or update of status on public.errand_share_groups
deferrable initially deferred
for each row execute function public.check_errand_share_has_two_members();

-- SECURITY DEFINER avoids recursive RLS checks between groups and members.
create or replace function public.can_view_errand_share_group(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.errand_share_members m
      join public.tasks t on t.id = m.task_id
      where m.group_id = p_group_id and t.buyer_id = auth.uid()
    )
    or exists (
      select 1
      from public.errand_share_groups g
      where g.id = p_group_id and g.selected_runner_id = auth.uid()
    );
$$;

revoke all on function public.can_view_errand_share_group(uuid) from public, anon;
grant execute on function public.can_view_errand_share_group(uuid) to authenticated;

alter table public.errand_share_groups enable row level security;
alter table public.errand_share_members enable row level security;
alter table public.errand_share_decisions enable row level security;
alter table public.errand_share_match_runs enable row level security;
alter table public.errand_share_match_candidates enable row level security;
alter table public.errand_share_match_outcomes enable row level security;

create policy errand_share_groups_select on public.errand_share_groups
  for select using (public.can_view_errand_share_group(id));
create policy errand_share_members_select on public.errand_share_members
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.tasks t
      where t.id = errand_share_members.task_id and t.buyer_id = auth.uid()
    )
    or exists (
      select 1 from public.errand_share_groups g
      where g.id = errand_share_members.group_id
        and g.selected_runner_id = auth.uid()
    )
  );
create policy errand_share_decisions_select on public.errand_share_decisions
  for select using (public.is_admin());
create policy errand_share_match_runs_select on public.errand_share_match_runs
  for select using (public.can_view_errand_share_group(group_id));
create policy errand_share_match_candidates_select on public.errand_share_match_candidates
  for select using (
    public.can_view_errand_share_group((
      select r.group_id from public.errand_share_match_runs r where r.id = match_run_id
    ))
  );
create policy errand_share_match_outcomes_select on public.errand_share_match_outcomes
  for select using (public.can_view_errand_share_group(group_id));

-- Buyers may read aggregate group state but never the route, which contains
-- both member task IDs. The assigned runner receives the route through an
-- explicitly authorized server projection after assignment.
revoke select on public.errand_share_groups from anon, authenticated;
grant select (
  id, status, algorithm_version, config_version, config,
  predicted_solo_km, predicted_shared_km, predicted_saved_km,
  stricter_deadline_at, confirmation_deadline_at, selected_runner_id,
  active_match_run_id, offered_at, accepted_at, started_at, completed_at,
  dissolved_at, dissolution_reason, created_at, updated_at
) on public.errand_share_groups to authenticated;

create or replace function public.create_errand_share_group(
  p_task_a_id uuid,
  p_task_b_id uuid,
  p_decision jsonb
)
returns table (status text, group_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_task_count integer;
  v_stricter_deadline timestamptz;
  v_latest_predicted_completion timestamptz;
begin
  if p_task_a_id = p_task_b_id
     or p_decision is null
     or coalesce((p_decision ->> 'accepted')::boolean, false) is not true
     or jsonb_typeof(p_decision -> 'route') <> 'array'
     or nullif(p_decision ->> 'algorithmVersion', '') is null
     or nullif(p_decision ->> 'configVersion', '') is null then
    return query select 'conflict'::text, null::uuid;
    return;
  end if;

  perform 1
  from public.tasks t
  where t.id = any(array[p_task_a_id, p_task_b_id])
  order by t.id
  for update;

  select count(*) into v_task_count
  from public.tasks t
  where t.id = any(array[p_task_a_id, p_task_b_id]);

  if v_task_count <> 2
     or (select count(distinct t.buyer_id) from public.tasks t
         where t.id = any(array[p_task_a_id, p_task_b_id])) <> 2
     or exists (
       select 1 from public.tasks t
       where t.id = any(array[p_task_a_id, p_task_b_id])
         and (
           t.status <> 'posted'
           or t.selected_runner_id is not null
           or t.share_state <> 'waiting'
           or t.share_group_id is not null
           or t.share_window_ends_at is null
           or t.share_window_ends_at <= now()
         )
     ) then
    return query select 'conflict'::text, null::uuid;
    return;
  end if;

  if p_decision ->> 'stricterDeadlineAt' is not null then
    v_stricter_deadline := to_timestamp(
      (p_decision ->> 'stricterDeadlineAt')::double precision / 1000
    );
  end if;

  select max(to_timestamp((metric.value ->> 'predictedCompletionAt')::double precision / 1000))
  into v_latest_predicted_completion
  from jsonb_each(p_decision -> 'metrics' -> 'taskMetrics') as metric;

  insert into public.errand_share_groups (
    ordered_route, algorithm_version, config_version, config,
    predicted_solo_km, predicted_shared_km, predicted_saved_km,
    stricter_deadline_at, confirmation_deadline_at
  ) values (
    p_decision -> 'route',
    p_decision ->> 'algorithmVersion',
    p_decision ->> 'configVersion',
    coalesce(p_decision -> 'config', '{}'::jsonb),
    (p_decision -> 'metrics' ->> 'soloDistanceKm')::double precision,
    (p_decision -> 'metrics' ->> 'sharedDistanceKm')::double precision,
    (p_decision -> 'metrics' ->> 'savedDistanceKm')::double precision,
    v_stricter_deadline,
    least(
      now() + interval '10 minutes',
      coalesce(
        now() + greatest(
          v_stricter_deadline - v_latest_predicted_completion,
          interval '0 seconds'
        ),
        'infinity'::timestamptz
      )
    )
  ) returning id into v_group_id;

  insert into public.errand_share_members (
    group_id, task_id, pickup_position, dropoff_position,
    direct_distance_km, carried_distance_km, detour_km, detour_ratio,
    predicted_completion_at
  )
  select
    v_group_id,
    t.id,
    (select ordinality::integer from jsonb_array_elements(p_decision -> 'route')
       with ordinality as route(stop, ordinality)
       where route.stop ->> 'taskId' = t.id::text
         and route.stop ->> 'kind' = 'pickup'),
    (select ordinality::integer from jsonb_array_elements(p_decision -> 'route')
       with ordinality as route(stop, ordinality)
       where route.stop ->> 'taskId' = t.id::text
         and route.stop ->> 'kind' = 'dropoff'),
    (p_decision -> 'metrics' -> 'taskMetrics' -> t.id::text ->> 'directDistanceKm')::double precision,
    (p_decision -> 'metrics' -> 'taskMetrics' -> t.id::text ->> 'carriedDistanceKm')::double precision,
    (p_decision -> 'metrics' -> 'taskMetrics' -> t.id::text ->> 'detourKm')::double precision,
    nullif(p_decision -> 'metrics' -> 'taskMetrics' -> t.id::text ->> 'detourRatio', '')::double precision,
    to_timestamp(
      (p_decision -> 'metrics' -> 'taskMetrics' -> t.id::text ->> 'predictedCompletionAt')::double precision / 1000
    )
  from public.tasks t
  where t.id = any(array[p_task_a_id, p_task_b_id]);

  update public.tasks
  set share_state = 'paired', share_group_id = v_group_id
  where id = any(array[p_task_a_id, p_task_b_id]);

  return query select 'created'::text, v_group_id;
end;
$$;

create or replace function public.finalize_share_match_run(
  p_group_id uuid,
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
  v_group_status text;
  v_run_id uuid;
  v_candidate jsonb;
  v_candidate_count integer;
  v_task_count integer;
begin
  if p_source not in ('automatic', 'manual', 'self_claim')
     or p_algorithm_version is null or p_config_version is null
     or p_candidates is null or jsonb_typeof(p_candidates) <> 'array' then
    raise exception 'errand-share: invalid match finalization input';
  end if;

  select g.status into v_group_status
  from public.errand_share_groups g
  where g.id = p_group_id
  for update;

  perform 1 from public.tasks t
  where t.share_group_id = p_group_id
  order by t.id for update;

  select count(*) into v_task_count from public.tasks t
  where t.share_group_id = p_group_id
    and t.status = 'posted'
    and t.share_state = 'paired'
    and t.selected_runner_id is null;

  if v_group_status is null or v_group_status <> 'posted' or v_task_count <> 2 then
    return query select 'not_posted'::text, null::uuid;
    return;
  end if;

  v_candidate_count := jsonb_array_length(p_candidates);
  if (p_source = 'self_claim') <> (p_self_claim_runner_id is not null)
     or (p_self_claim_runner_id is not null and (
       v_candidate_count <> 1
       or (p_candidates -> 0 ->> 'runnerId')::uuid <> p_self_claim_runner_id
     )) then
    raise exception 'errand-share: self claim must contain exactly the claiming runner';
  end if;

  insert into public.errand_share_match_runs (
    group_id, outcome, source, algorithm_version, config_version, config, candidate_count
  ) values (
    p_group_id,
    case when v_candidate_count = 0 then 'no_candidates' else 'matched' end,
    p_source, p_algorithm_version, p_config_version,
    coalesce(p_config, '{}'::jsonb), v_candidate_count
  ) returning id into v_run_id;

  for v_candidate in select value from jsonb_array_elements(p_candidates)
  loop
    insert into public.errand_share_match_candidates (
      match_run_id, runner_id, rank, match_score, proximity,
      trust, capacity, urgency_fit, distance_km
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

  if v_candidate_count = 0 then
    return query select 'no_candidates'::text, v_run_id;
    return;
  end if;

  update public.errand_share_groups
  set status = 'awaiting_funding', active_match_run_id = v_run_id, updated_at = now()
  where id = p_group_id;
  update public.tasks
  set status = 'matched', active_match_run_id = null
  where share_group_id = p_group_id;

  if p_self_claim_runner_id is not null then
    perform public.fund_and_hold_task(t.id)
    from public.tasks t where t.share_group_id = p_group_id;

    update public.errand_share_members
    set escrow_confirmed_at = coalesce(escrow_confirmed_at, now())
    where group_id = p_group_id;
    update public.errand_share_groups
    set status = 'offered', selected_runner_id = p_self_claim_runner_id,
        offered_at = now(), updated_at = now()
    where id = p_group_id;
    update public.tasks
    set selected_runner_id = p_self_claim_runner_id
    where share_group_id = p_group_id;
    insert into public.errand_share_match_outcomes (
      match_run_id, group_id, runner_id, offered_at, updated_at
    ) values (v_run_id, p_group_id, p_self_claim_runner_id, now(), now());
  end if;

  return query select 'matched'::text, v_run_id;
end;
$$;

create or replace function public.confirm_share_funding(
  p_group_id uuid,
  p_task_id uuid,
  p_buyer_id uuid
)
returns table (status text, ready boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_status text;
  v_owner_id uuid;
  v_ready boolean;
begin
  select g.status into v_group_status
  from public.errand_share_groups g where g.id = p_group_id for update;

  select t.buyer_id into v_owner_id
  from public.errand_share_members m
  join public.tasks t on t.id = m.task_id
  where m.group_id = p_group_id and m.task_id = p_task_id
  for update of t;

  if v_group_status <> 'awaiting_funding' or v_owner_id is distinct from p_buyer_id then
    return query select 'not_fundable'::text, false;
    return;
  end if;

  perform public.fund_and_hold_task(p_task_id);
  update public.errand_share_members
  set escrow_confirmed_at = coalesce(escrow_confirmed_at, now())
  where group_id = p_group_id and task_id = p_task_id;

  select count(*) = 2 into v_ready
  from public.errand_share_members
  where group_id = p_group_id and escrow_confirmed_at is not null;
  return query select 'funded'::text, v_ready;
end;
$$;

create or replace function public.offer_next_share_candidate(
  p_group_id uuid,
  p_ensure_hold boolean default false
)
returns table (status text, offered_runner_id uuid, run_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.errand_share_groups%rowtype;
  v_runner_id uuid;
  v_funded_count integer;
begin
  select g.* into v_group from public.errand_share_groups g
  where g.id = p_group_id for update;
  perform 1 from public.tasks t where t.share_group_id = p_group_id order by t.id for update;

  if not found or v_group.status not in ('awaiting_funding', 'posted')
     or v_group.selected_runner_id is not null
     or v_group.active_match_run_id is null then
    return query select 'not_matchable'::text, null::uuid, v_group.active_match_run_id;
    return;
  end if;

  if p_ensure_hold then
    perform public.fund_and_hold_task(t.id)
    from public.tasks t where t.share_group_id = p_group_id;
    update public.errand_share_members
    set escrow_confirmed_at = coalesce(escrow_confirmed_at, now())
    where group_id = p_group_id;
  end if;

  select count(*) into v_funded_count from public.errand_share_members
  where group_id = p_group_id and escrow_confirmed_at is not null;
  if v_funded_count <> 2 then
    return query select 'awaiting_funding'::text, null::uuid, v_group.active_match_run_id;
    return;
  end if;

  select c.runner_id into v_runner_id
  from public.errand_share_match_candidates c
  where c.match_run_id = v_group.active_match_run_id
    and not exists (
      select 1 from public.errand_share_match_outcomes o
      where o.match_run_id = c.match_run_id and o.runner_id = c.runner_id and o.declined
    )
  order by c.rank limit 1;

  if v_runner_id is null then
    update public.errand_share_groups
    set status = 'posted', selected_runner_id = null, updated_at = now()
    where id = p_group_id;
    update public.tasks
    set status = 'posted', selected_runner_id = null
    where share_group_id = p_group_id;
    return query select 'reopened'::text, null::uuid, v_group.active_match_run_id;
    return;
  end if;

  update public.errand_share_groups
  set status = 'offered', selected_runner_id = v_runner_id,
      offered_at = now(), updated_at = now()
  where id = p_group_id;
  update public.tasks set selected_runner_id = v_runner_id, status = 'matched'
  where share_group_id = p_group_id;
  insert into public.errand_share_match_outcomes (
    match_run_id, group_id, runner_id, offered_at, updated_at
  ) values (v_group.active_match_run_id, p_group_id, v_runner_id, now(), now())
  on conflict (match_run_id, runner_id)
  do update set offered_at = excluded.offered_at, updated_at = excluded.updated_at;

  return query select 'offered'::text, v_runner_id, v_group.active_match_run_id;
end;
$$;

create or replace function public.decline_and_offer_next_share_candidate(
  p_group_id uuid,
  p_runner_id uuid
)
returns table (status text, offered_runner_id uuid, run_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.errand_share_groups%rowtype;
  v_next_runner_id uuid;
begin
  select g.* into v_group from public.errand_share_groups g
  where g.id = p_group_id for update;
  perform 1 from public.tasks t where t.share_group_id = p_group_id order by t.id for update;

  if not found or v_group.status <> 'offered'
     or v_group.selected_runner_id is distinct from p_runner_id
     or v_group.active_match_run_id is null then
    return query select 'not_matchable'::text, null::uuid, v_group.active_match_run_id;
    return;
  end if;

  update public.errand_share_match_outcomes
  set responded_at = now(), accepted = false, declined = true, updated_at = now()
  where match_run_id = v_group.active_match_run_id and runner_id = p_runner_id;

  select c.runner_id into v_next_runner_id
  from public.errand_share_match_candidates c
  where c.match_run_id = v_group.active_match_run_id
    and not exists (
      select 1 from public.errand_share_match_outcomes o
      where o.match_run_id = c.match_run_id and o.runner_id = c.runner_id and o.declined
    )
  order by c.rank limit 1;

  if v_next_runner_id is null then
    update public.errand_share_groups
    set status = 'posted', selected_runner_id = null, updated_at = now()
    where id = p_group_id;
    update public.tasks set status = 'posted', selected_runner_id = null
    where share_group_id = p_group_id;
    return query select 'reopened'::text, null::uuid, v_group.active_match_run_id;
    return;
  end if;

  update public.errand_share_groups
  set selected_runner_id = v_next_runner_id, offered_at = now(), updated_at = now()
  where id = p_group_id;
  update public.tasks set selected_runner_id = v_next_runner_id
  where share_group_id = p_group_id;
  insert into public.errand_share_match_outcomes (
    match_run_id, group_id, runner_id, offered_at, updated_at
  ) values (v_group.active_match_run_id, p_group_id, v_next_runner_id, now(), now())
  on conflict (match_run_id, runner_id)
  do update set offered_at = excluded.offered_at, updated_at = excluded.updated_at;

  return query select 'offered'::text, v_next_runner_id, v_group.active_match_run_id;
end;
$$;

create or replace function public.accept_share_offer(p_group_id uuid, p_runner_id uuid)
returns table (status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.errand_share_groups%rowtype;
begin
  select g.* into v_group from public.errand_share_groups g
  where g.id = p_group_id for update;
  perform 1 from public.tasks t where t.share_group_id = p_group_id order by t.id for update;

  if not found or v_group.status <> 'offered'
     or v_group.selected_runner_id is distinct from p_runner_id then
    return query select 'not_offered'::text;
    return;
  end if;

  update public.errand_share_groups
  set status = 'accepted', accepted_at = now(), updated_at = now()
  where id = p_group_id;
  update public.tasks t
  set status = 'accepted', accepted_at = now(), selected_runner_id = p_runner_id
  where t.share_group_id = p_group_id and t.status = 'matched';
  update public.errand_share_match_outcomes
  set responded_at = now(), accepted = true, declined = false, updated_at = now()
  where match_run_id = v_group.active_match_run_id and runner_id = p_runner_id;
  return query select 'accepted'::text;
end;
$$;

create or replace function public.start_share_group(p_group_id uuid, p_runner_id uuid)
returns table (status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_status text;
  v_runner_id uuid;
begin
  select g.status, g.selected_runner_id into v_group_status, v_runner_id
  from public.errand_share_groups g where g.id = p_group_id for update;
  perform 1 from public.tasks t where t.share_group_id = p_group_id order by t.id for update;
  if not found or v_group_status <> 'accepted' or v_runner_id is distinct from p_runner_id then
    return query select 'not_startable'::text;
    return;
  end if;
  update public.errand_share_groups
  set status = 'in_progress', started_at = now(), updated_at = now()
  where id = p_group_id;
  update public.tasks t set status = 'in_progress'
  where t.share_group_id = p_group_id and t.status = 'accepted';
  update public.errand_share_match_outcomes
  set started_at = now(), updated_at = now()
  where group_id = p_group_id and runner_id = p_runner_id and accepted;
  return query select 'started'::text;
end;
$$;

create or replace function public.complete_share_member(
  p_group_id uuid,
  p_task_id uuid,
  p_completed_at timestamptz
)
returns table (status text, group_completed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_status text;
  v_task_status public.task_status;
  v_completed_count integer;
begin
  select g.status into v_group_status from public.errand_share_groups g
  where g.id = p_group_id for update;
  select t.status into v_task_status
  from public.errand_share_members m join public.tasks t on t.id = m.task_id
  where m.group_id = p_group_id and m.task_id = p_task_id for update of t;
  if not found or v_group_status not in ('in_progress', 'completed')
     or v_task_status <> 'completed' then
    return query select 'not_completable'::text, false;
    return;
  end if;
  update public.errand_share_members
  set completed_at = coalesce(completed_at, p_completed_at, now())
  where group_id = p_group_id and task_id = p_task_id;
  select count(*) into v_completed_count from public.errand_share_members
  where group_id = p_group_id and completed_at is not null;
  if v_completed_count = 2 then
    update public.errand_share_groups
    set status = 'completed', completed_at = coalesce(completed_at, p_completed_at, now()),
        updated_at = now()
    where id = p_group_id;
    update public.errand_share_match_outcomes
    set completed_at = coalesce(completed_at, p_completed_at, now()), updated_at = now()
    where group_id = p_group_id and accepted;
    return query select 'completed'::text, true;
    return;
  end if;
  return query select 'member_completed'::text, false;
end;
$$;

create or replace function public.dissolve_share_group_for_cancellation(
  p_group_id uuid,
  p_task_id uuid
)
returns table (status text, surviving_task_id uuid, surviving_share_state text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_status text;
  v_survivor_id uuid;
  v_survivor_state text;
begin
  select g.status into v_group_status from public.errand_share_groups g
  where g.id = p_group_id for update;
  perform 1 from public.tasks t where t.share_group_id = p_group_id order by t.id for update;
  if not found or v_group_status not in ('posted', 'awaiting_funding', 'offered')
     or not exists (
       select 1 from public.errand_share_members m
       where m.group_id = p_group_id and m.task_id = p_task_id
     ) then
    return query select 'not_dissolvable'::text, null::uuid, null::text;
    return;
  end if;

  select m.task_id into v_survivor_id from public.errand_share_members m
  where m.group_id = p_group_id and m.task_id <> p_task_id;
  perform public.refund_funds(p_task_id);
  update public.tasks
  set status = 'cancelled', share_state = 'released', share_released_at = now(),
      share_group_id = null, selected_runner_id = null, active_match_run_id = null
  where id = p_task_id;
  update public.tasks
  set status = 'posted',
      share_state = case when share_window_ends_at > now() then 'waiting' else 'released' end,
      share_released_at = case when share_window_ends_at > now() then null else now() end,
      share_group_id = null, selected_runner_id = null, active_match_run_id = null
  where id = v_survivor_id
  returning share_state into v_survivor_state;
  update public.errand_share_groups
  set status = 'dissolved', dissolved_at = now(), dissolution_reason = 'buyer_cancelled',
      selected_runner_id = null, updated_at = now()
  where id = p_group_id;
  return query select 'dissolved'::text, v_survivor_id, v_survivor_state;
end;
$$;

create or replace function public.cancel_share_group_by_runner(
  p_group_id uuid,
  p_runner_id uuid
)
returns table (status text, buyer_ids uuid[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_status text;
  v_selected_runner_id uuid;
  v_buyer_ids uuid[];
begin
  select g.status, g.selected_runner_id into v_group_status, v_selected_runner_id
  from public.errand_share_groups g where g.id = p_group_id for update;
  perform 1 from public.tasks t where t.share_group_id = p_group_id order by t.id for update;
  if not found or v_group_status not in ('accepted', 'in_progress')
     or v_selected_runner_id is distinct from p_runner_id then
    return query select 'not_cancellable'::text, '{}'::uuid[];
    return;
  end if;
  select array_agg(t.buyer_id order by t.id) into v_buyer_ids
  from public.tasks t where t.share_group_id = p_group_id;
  perform public.refund_funds(t.id)
  from public.tasks t where t.share_group_id = p_group_id;
  update public.tasks
  set status = 'cancelled', share_state = 'released', share_released_at = now(),
      share_group_id = null
  where share_group_id = p_group_id;
  update public.errand_share_groups
  set status = 'dissolved', dissolved_at = now(), dissolution_reason = 'runner_cancelled',
      updated_at = now()
  where id = p_group_id;
  update public.errand_share_match_outcomes
  set cancelled_at = now(), updated_at = now()
  where group_id = p_group_id and runner_id = p_runner_id and accepted;
  return query select 'cancelled'::text, coalesce(v_buyer_ids, '{}'::uuid[]);
end;
$$;

create or replace function public.expire_due_errand_share_groups(p_limit integer default 25)
returns table (group_id uuid, task_ids uuid[], task_share_states text[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
begin
  if p_limit <= 0 then return; end if;
  for v_group_id in
    select g.id from public.errand_share_groups g
    where g.status in ('awaiting_funding', 'offered')
      and g.confirmation_deadline_at <= now()
    order by g.confirmation_deadline_at, g.id
    for update skip locked limit p_limit
  loop
    perform 1 from public.tasks t where t.share_group_id = v_group_id order by t.id for update;
    perform public.refund_funds(t.id)
    from public.tasks t where t.share_group_id = v_group_id;
    update public.tasks
    set status = 'posted', selected_runner_id = null, active_match_run_id = null,
        share_state = case when share_window_ends_at > now() then 'waiting' else 'released' end,
        share_released_at = case when share_window_ends_at > now() then null else now() end,
        share_group_id = null
    where share_group_id = v_group_id;
    update public.errand_share_groups
    set status = 'dissolved', dissolved_at = now(), dissolution_reason = 'funding_expired',
        selected_runner_id = null, updated_at = now()
    where id = v_group_id;
    return query
      select v_group_id,
             array_agg(m.task_id order by m.task_id),
             array_agg(t.share_state order by m.task_id)
      from public.errand_share_members m
      join public.tasks t on t.id = m.task_id
      where m.group_id = v_group_id;
  end loop;
end;
$$;

create or replace function public.claim_due_errand_share_tasks(p_limit integer default 25)
returns table (task_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_limit <= 0 then return; end if;
  return query
  with due as (
    select t.id from public.tasks t
    where t.status = 'posted'
      and t.selected_runner_id is null
      and t.share_state = 'waiting'
      and t.share_group_id is null
      and t.share_window_ends_at <= now()
    order by t.share_window_ends_at, t.created_at, t.id
    for update skip locked limit p_limit
  ), released as (
    update public.tasks t
    set share_state = 'released', share_released_at = now()
    from due where t.id = due.id
    returning t.id
  )
  select released.id from released;
end;
$$;

revoke all on function public.create_errand_share_group(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_errand_share_group(uuid, uuid, jsonb)
  to service_role;
revoke all on function public.finalize_share_match_run(uuid, text, text, text, jsonb, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_share_match_run(uuid, text, text, text, jsonb, jsonb, uuid)
  to service_role;
revoke all on function public.confirm_share_funding(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_share_funding(uuid, uuid, uuid)
  to service_role;
revoke all on function public.offer_next_share_candidate(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.offer_next_share_candidate(uuid, boolean)
  to service_role;
revoke all on function public.decline_and_offer_next_share_candidate(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.decline_and_offer_next_share_candidate(uuid, uuid)
  to service_role;
revoke all on function public.accept_share_offer(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.accept_share_offer(uuid, uuid)
  to service_role;
revoke all on function public.start_share_group(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.start_share_group(uuid, uuid)
  to service_role;
revoke all on function public.complete_share_member(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.complete_share_member(uuid, uuid, timestamptz)
  to service_role;
revoke all on function public.dissolve_share_group_for_cancellation(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.dissolve_share_group_for_cancellation(uuid, uuid)
  to service_role;
revoke all on function public.cancel_share_group_by_runner(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.cancel_share_group_by_runner(uuid, uuid)
  to service_role;
revoke all on function public.expire_due_errand_share_groups(integer)
  from public, anon, authenticated;
grant execute on function public.expire_due_errand_share_groups(integer)
  to service_role;
revoke all on function public.claim_due_errand_share_tasks(integer)
  from public, anon, authenticated;
grant execute on function public.claim_due_errand_share_tasks(integer)
  to service_role;
