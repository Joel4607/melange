-- ============================================================================
-- Phase 49 — SEC-011 demo-wallet safety boundary.
-- Mélange currently demonstrates money movement without a payment provider.
-- Give each profile one non-redeemable demo allocation, remove every arbitrary
-- credit path, and keep holds/releases/refunds/tips database-transactional.
-- ============================================================================

-- Preserve only financial state that still backs an unsettled errand. Settled
-- prototype history is intentionally reset; profiles, tasks and ratings stay.
create temporary table sec011_unsettled_holds on commit drop as
select h.task_id, h.user_id, h.amount
from public.ledger_entries h
where h.type = 'hold'
  and h.task_id is not null
  and not exists (
    select 1
    from public.ledger_entries settled
    where settled.task_id = h.task_id
      and settled.type in ('release', 'payout', 'refund')
  );

delete from public.ledger_entries;
delete from public.wallets;

insert into public.wallets (user_id, balance, held)
select p.id, 1000.00, coalesce(sum(h.amount), 0)
from public.profiles p
left join sec011_unsettled_holds h on h.user_id = p.id
group by p.id;

insert into public.ledger_entries (user_id, type, amount)
select p.id, 'topup', 1000.00
from public.profiles p;

insert into public.ledger_entries (task_id, user_id, type, amount)
select h.task_id, h.user_id, 'hold', h.amount
from sec011_unsettled_holds h;

update public.tasks t
set payment_reference =
  'DEMO-' || upper(substr(replace(t.id::text, '-', ''), 1, 12))
where exists (
  select 1 from sec011_unsettled_holds h where h.task_id = t.id
);

create unique index if not exists ledger_demo_initial_credit_unique
  on public.ledger_entries (user_id)
  where task_id is null and type = 'topup';

-- New profiles receive one fixed allocation. The partial unique index is the
-- database backstop against duplicate trigger execution.
create or replace function public.provision_demo_wallet_for_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wallets (user_id, balance, held)
  values (new.id, 1000.00, 0)
  on conflict (user_id) do nothing;

  insert into public.ledger_entries (user_id, type, amount)
  values (new.id, 'topup', 1000.00)
  on conflict (user_id) where task_id is null and type = 'topup'
  do nothing;

  return new;
end;
$$;

drop trigger if exists profiles_provision_demo_wallet on public.profiles;
create trigger profiles_provision_demo_wallet
  after insert on public.profiles
  for each row execute function public.provision_demo_wallet_for_profile();

-- A hold may only spend an already-provisioned balance. It never creates a
-- wallet or credits a shortfall.
create or replace function public.hold_funds(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer_id uuid;
  v_price numeric(12, 2);
  v_balance numeric(12, 2);
begin
  select t.buyer_id, t.price
  into v_buyer_id, v_price
  from public.tasks t
  where t.id = p_task_id
  for update;

  if not found then
    raise exception 'escrow: task % not found', p_task_id;
  end if;

  if exists (
    select 1 from public.ledger_entries
    where task_id = p_task_id and type = 'hold'
  ) then
    return;
  end if;

  select w.balance
  into v_balance
  from public.wallets w
  where w.user_id = v_buyer_id
  for update;

  if not found then
    raise exception 'demo_wallet_not_provisioned';
  end if;
  if v_balance < v_price then
    raise exception 'demo_wallet_insufficient_credits';
  end if;

  update public.wallets
  set balance = balance - v_price,
      held = held + v_price
  where user_id = v_buyer_id;

  insert into public.ledger_entries (task_id, user_id, type, amount)
  values (p_task_id, v_buyer_id, 'hold', v_price);

  update public.tasks
  set payment_reference =
    'DEMO-' || upper(substr(replace(p_task_id::text, '-', ''), 1, 12))
  where id = p_task_id;
end;
$$;

-- Funding retains the task/status lock used by matching, but a shortfall now
-- fails the enclosing match/offer transaction instead of minting credits.
create or replace function public.fund_and_hold_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task_status public.task_status;
  v_buyer_id uuid;
  v_price numeric(12, 2);
  v_balance numeric(12, 2);
begin
  select t.status, t.buyer_id, t.price
  into v_task_status, v_buyer_id, v_price
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

  select w.balance
  into v_balance
  from public.wallets w
  where w.user_id = v_buyer_id
  for update;

  if not found then
    raise exception 'demo_wallet_not_provisioned';
  end if;
  if v_balance < v_price then
    raise exception 'demo_wallet_insufficient_credits';
  end if;

  perform public.hold_funds(p_task_id);
end;
$$;

-- A direct request and its initial hold must either both exist or both roll
-- back. All values passed here have already been validated by the server action;
-- table constraints remain the final database validation layer.
create or replace function public.create_and_hold_direct_demo_errand(
  p_buyer_id uuid,
  p_runner_id uuid,
  p_title text,
  p_description text,
  p_category text,
  p_urgency public.urgency,
  p_price numeric,
  p_fee numeric,
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_dropoff_lat double precision,
  p_dropoff_lng double precision,
  p_stops jsonb,
  p_recurrence text,
  p_recurrence_end_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task_id uuid;
begin
  insert into public.tasks (
    buyer_id,
    title,
    description,
    category,
    urgency,
    price,
    fee,
    pickup_lat,
    pickup_lng,
    dropoff_lat,
    dropoff_lng,
    stops,
    recurrence,
    recurrence_end_date,
    series_number,
    status,
    selected_runner_id
  ) values (
    p_buyer_id,
    p_title,
    nullif(trim(p_description), ''),
    nullif(trim(p_category), ''),
    p_urgency,
    p_price,
    p_fee,
    p_pickup_lat,
    p_pickup_lng,
    p_dropoff_lat,
    p_dropoff_lng,
    coalesce(p_stops, '[]'::jsonb),
    p_recurrence,
    p_recurrence_end_date,
    1,
    'matched',
    p_runner_id
  )
  returning id into v_task_id;

  perform public.hold_funds(v_task_id);
  return v_task_id;
end;
$$;

-- Rating, release and optional tip now share one transaction. An unaffordable
-- tip rolls back the release and rating as well as the tip itself.
create or replace function public.rate_and_tip(
  p_task_id uuid,
  p_rater_id uuid,
  p_stars smallint,
  p_comment text,
  p_tip_cents bigint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer_id uuid;
  v_runner_id uuid;
  v_task_status public.task_status;
  v_tip_amount numeric(12, 2);
  v_rating_id uuid;
  v_updated integer;
begin
  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'stars must be between 1 and 5';
  end if;
  if p_tip_cents is null or p_tip_cents < 0 then
    raise exception 'tip cannot be negative';
  end if;
  if p_tip_cents > 100000 then
    raise exception 'demo tip exceeds limit';
  end if;

  select t.buyer_id, t.selected_runner_id, t.status
  into v_buyer_id, v_runner_id, v_task_status
  from public.tasks t
  where t.id = p_task_id
  for update;

  if not found then
    raise exception 'task % not found', p_task_id;
  end if;
  if v_buyer_id <> p_rater_id then
    raise exception 'only the buyer can rate this task';
  end if;
  if v_runner_id is null then
    raise exception 'task % has no selected runner', p_task_id;
  end if;
  if v_task_status not in ('completed', 'resolved') then
    raise exception 'task is not ready for rating';
  end if;
  if exists (
    select 1 from public.ratings
    where task_id = p_task_id
      and rater_id = p_rater_id
      and ratee_id = v_runner_id
  ) then
    raise exception 'task % has already been rated', p_task_id;
  end if;

  v_tip_amount := (p_tip_cents / 100.0)::numeric(12, 2);

  perform public.release_funds(p_task_id);

  if v_tip_amount > 0 then
    update public.wallets
    set balance = balance - v_tip_amount
    where user_id = v_buyer_id and balance >= v_tip_amount;

    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise exception 'demo_wallet_insufficient_credits';
    end if;

    update public.wallets
    set balance = balance + v_tip_amount
    where user_id = v_runner_id;

    if not found then
      raise exception 'demo_wallet_not_provisioned';
    end if;

    insert into public.ledger_entries (task_id, user_id, type, amount)
    values
      (p_task_id, v_buyer_id, 'tip_charge', -v_tip_amount),
      (p_task_id, v_runner_id, 'tip', v_tip_amount);
  end if;

  insert into public.ratings (
    task_id,
    rater_id,
    ratee_id,
    stars,
    comment,
    tip_amount
  ) values (
    p_task_id,
    p_rater_id,
    v_runner_id,
    p_stars,
    nullif(trim(p_comment), ''),
    v_tip_amount
  )
  returning id into v_rating_id;

  return v_rating_id;
end;
$$;

-- The old endpoint could add any amount and must not remain callable.
drop function if exists public.top_up_wallet(uuid, bigint);

-- PostgreSQL grants EXECUTE to PUBLIC by default. Revoke every wallet mutation
-- explicitly, then expose only the service entry points required by the app.
revoke all on function public.provision_demo_wallet_for_profile()
  from public, anon, authenticated;
revoke all on function public.hold_funds(uuid)
  from public, anon, authenticated;
revoke all on function public.release_funds(uuid)
  from public, anon, authenticated;
revoke all on function public.refund_funds(uuid)
  from public, anon, authenticated;
revoke all on function public.fund_and_hold_task(uuid)
  from public, anon, authenticated;
revoke all on function public.create_and_hold_direct_demo_errand(
  uuid, uuid, text, text, text, public.urgency, numeric, numeric,
  double precision, double precision, double precision, double precision,
  jsonb, text, date
) from public, anon, authenticated;
revoke all on function public.rate_and_tip(uuid, uuid, smallint, text, bigint)
  from public, anon, authenticated;

grant execute on function public.provision_demo_wallet_for_profile()
  to service_role;
grant execute on function public.hold_funds(uuid)
  to service_role;
grant execute on function public.release_funds(uuid)
  to service_role;
grant execute on function public.refund_funds(uuid)
  to service_role;
grant execute on function public.fund_and_hold_task(uuid)
  to service_role;
grant execute on function public.create_and_hold_direct_demo_errand(
  uuid, uuid, text, text, text, public.urgency, numeric, numeric,
  double precision, double precision, double precision, double precision,
  jsonb, text, date
) to service_role;
grant execute on function public.rate_and_tip(uuid, uuid, smallint, text, bigint)
  to service_role;
