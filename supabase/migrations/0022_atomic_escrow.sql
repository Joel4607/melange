-- ============================================================================
-- Phase 22 — Atomic escrow operations.
-- Moves wallet/ledger mutations into PL/pgSQL functions so balance/held updates
-- and ledger writes happen in a single transaction, eliminating read-modify-write
-- races. Adds a unique constraint so a task can only have one ledger entry of
-- each type (one hold, one release, one payout, one refund).
-- ============================================================================

-- Enforce one ledger entry of each type per task. This makes the escrow
-- functions naturally idempotent and prevents duplicate holds/releases/refunds.
-- Remove any pre-existing duplicates first so the index can be created safely.
delete from ledger_entries a
using (
  select task_id, type, min(id::text) as keep_id
  from ledger_entries
  where task_id is not null
  group by task_id, type
) b
where a.task_id is not null
  and a.task_id = b.task_id
  and a.type = b.type
  and a.id::text <> b.keep_id;

create unique index if not exists ledger_entries_task_type_unique
  on ledger_entries (task_id, type)
  where task_id is not null;

-- Credit simulated funds to a user's available balance and append a topup entry.
create or replace function public.top_up_wallet(p_user_id uuid, p_amount_cents bigint)
returns void
language plpgsql
as $$
declare
  v_amount numeric(12, 2);
begin
  if p_amount_cents <= 0 then
    raise exception 'escrow: top-up amount must be positive';
  end if;

  v_amount := p_amount_cents / 100.0;

  insert into wallets (user_id, balance)
  values (p_user_id, v_amount)
  on conflict (user_id)
  do update set balance = wallets.balance + v_amount;

  insert into ledger_entries (user_id, type, amount)
  values (p_user_id, 'topup', v_amount);
end;
$$;

-- Move a task's price from the buyer's available balance into held escrow.
-- Idempotent: returns silently if a hold already exists for the task.
create or replace function public.hold_funds(p_task_id uuid)
returns void
language plpgsql
as $$
declare
  v_buyer_id uuid;
  v_price numeric(12, 2);
  v_updated int;
begin
  -- Lock the task so concurrent hold/release/refund calls for the same task
  -- are serialized.
  select buyer_id, price
  into v_buyer_id, v_price
  from tasks
  where id = p_task_id
  for update;

  if not found then
    raise exception 'escrow: task % not found', p_task_id;
  end if;

  -- Already held? Nothing to do.
  if exists (
    select 1 from ledger_entries
    where task_id = p_task_id and type = 'hold'
  ) then
    return;
  end if;

  -- Ensure wallet exists, then lock and debit it.
  insert into wallets (user_id, balance, held)
  values (v_buyer_id, 0, 0)
  on conflict (user_id) do nothing;

  update wallets
  set balance = balance - v_price, held = held + v_price
  where user_id = v_buyer_id and balance >= v_price;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'escrow: buyer % has insufficient funds', v_buyer_id;
  end if;

  insert into ledger_entries (task_id, user_id, type, amount)
  values (p_task_id, v_buyer_id, 'hold', v_price);
end;
$$;

-- Release escrowed funds to the runner: buyer held decreases, runner balance
-- increases by (price - fee). Idempotent: returns silently if already released.
create or replace function public.release_funds(p_task_id uuid)
returns void
language plpgsql
as $$
declare
  v_buyer_id uuid;
  v_runner_id uuid;
  v_price numeric(12, 2);
  v_fee numeric(12, 2);
  v_payout numeric(12, 2);
begin
  select buyer_id, selected_runner_id, price, fee
  into v_buyer_id, v_runner_id, v_price, v_fee
  from tasks
  where id = p_task_id
  for update;

  if not found then
    raise exception 'escrow: task % not found', p_task_id;
  end if;

  if v_runner_id is null then
    raise exception 'escrow: task % has no selected runner', p_task_id;
  end if;

  if not exists (
    select 1 from ledger_entries
    where task_id = p_task_id and type = 'hold'
  ) then
    -- Nothing to release.
    return;
  end if;

  if exists (
    select 1 from ledger_entries
    where task_id = p_task_id and type in ('release', 'payout')
  ) then
    return;
  end if;

  if exists (
    select 1 from ledger_entries
    where task_id = p_task_id and type = 'refund'
  ) then
    raise exception 'escrow: task % has already been refunded', p_task_id;
  end if;

  v_payout := greatest(v_price - v_fee, 0);

  -- Ensure both wallets exist, then update them. The buyer wallet must exist
  -- because hold_funds created it, but the runner wallet may not yet.
  insert into wallets (user_id, balance, held)
  values (v_buyer_id, 0, 0), (v_runner_id, 0, 0)
  on conflict (user_id) do nothing;

  update wallets
  set held = held - v_price
  where user_id = v_buyer_id and held >= v_price;

  if not found then
    raise exception 'escrow: buyer % has insufficient held funds', v_buyer_id;
  end if;

  update wallets
  set balance = balance + v_payout
  where user_id = v_runner_id;

  insert into ledger_entries (task_id, user_id, type, amount)
  values
    (p_task_id, v_buyer_id, 'release', -v_price),
    (p_task_id, v_runner_id, 'payout', v_payout);
end;
$$;

-- Return escrowed funds to the buyer. Idempotent: returns silently if refunded.
create or replace function public.refund_funds(p_task_id uuid)
returns void
language plpgsql
as $$
declare
  v_buyer_id uuid;
  v_price numeric(12, 2);
begin
  select buyer_id, price
  into v_buyer_id, v_price
  from tasks
  where id = p_task_id
  for update;

  if not found then
    raise exception 'escrow: task % not found', p_task_id;
  end if;

  if not exists (
    select 1 from ledger_entries
    where task_id = p_task_id and type = 'hold'
  ) then
    -- Nothing to refund.
    return;
  end if;

  if exists (
    select 1 from ledger_entries
    where task_id = p_task_id and type = 'refund'
  ) then
    return;
  end if;

  if exists (
    select 1 from ledger_entries
    where task_id = p_task_id and type in ('release', 'payout')
  ) then
    raise exception 'escrow: task % has already been released', p_task_id;
  end if;

  insert into wallets (user_id, balance, held)
  values (v_buyer_id, 0, 0)
  on conflict (user_id) do nothing;

  update wallets
  set balance = balance + v_price, held = held - v_price
  where user_id = v_buyer_id and held >= v_price;

  if not found then
    raise exception 'escrow: buyer % has insufficient held funds', v_buyer_id;
  end if;

  insert into ledger_entries (task_id, user_id, type, amount)
  values (p_task_id, v_buyer_id, 'refund', v_price);
end;
$$;
