-- Restore prototype-only top-ups and automatic errand funding.
-- No real deposits, withdrawals, or redeemable balances are enabled.
-- Preserve existing wallets, held escrow, and ledger history. Never rerun 0049
-- to perform this change: that older migration resets settled prototype data.

-- Keep wallets provisioned for buyers/runners, but grant no signup allocation.
create or replace function public.provision_demo_wallet_for_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wallets (user_id, balance, held)
  values (new.id, 0, 0)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop index if exists public.ledger_demo_initial_credit_unique;

-- The authenticated server action supplies its own session's user ID. Browsers
-- cannot call this privileged RPC directly or write wallet/ledger rows via RLS.
create or replace function public.top_up_wallet(p_user_id uuid, p_amount_cents bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric(12, 2);
begin
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 999999999999 then
    raise exception 'Invalid demo top-up amount' using errcode = '22023';
  end if;
  v_amount := p_amount_cents / 100.0;
  insert into public.wallets (user_id, balance, held)
  values (p_user_id, v_amount, 0)
  on conflict (user_id) do update set balance = wallets.balance + v_amount;

  insert into public.ledger_entries (user_id, type, amount)
  values (p_user_id, 'topup', v_amount);
end;
$$;

-- One shared transaction covers the shortfall and hold for direct requests,
-- matching, self-claims, and shared errands. Lock task first, then wallet.
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
  v_shortfall numeric(12, 2);
begin
  select t.buyer_id, t.price into v_buyer_id, v_price
  from public.tasks t where t.id = p_task_id for update;
  if not found then
    raise exception 'escrow: task % not found', p_task_id;
  end if;
  if exists (select 1 from public.ledger_entries where task_id = p_task_id and type = 'hold') then
    return;
  end if;

  insert into public.wallets (user_id, balance, held)
  values (v_buyer_id, 0, 0) on conflict (user_id) do nothing;
  select w.balance into v_balance
  from public.wallets w where w.user_id = v_buyer_id for update;
  v_shortfall := greatest(v_price - v_balance, 0);
  if v_shortfall > 0 then
    insert into public.ledger_entries (task_id, user_id, type, amount)
    values (p_task_id, v_buyer_id, 'topup', v_shortfall);
    update public.wallets set balance = balance + v_shortfall where user_id = v_buyer_id;
  end if;

  update public.wallets
  set balance = balance - v_price, held = held + v_price
  where user_id = v_buyer_id;
  insert into public.ledger_entries (task_id, user_id, type, amount)
  values (p_task_id, v_buyer_id, 'hold', v_price);
  update public.tasks
  set payment_reference = 'DEMO-' || upper(substr(replace(p_task_id::text, '-', ''), 1, 12))
  where id = p_task_id;
end;
$$;

create or replace function public.fund_and_hold_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task_status public.task_status;
begin
  select t.status into v_task_status
  from public.tasks t where t.id = p_task_id for update;
  if not found then
    raise exception 'escrow: task % not found', p_task_id;
  end if;
  if v_task_status <> 'matched' then
    raise exception 'escrow: task % is not awaiting a runner', p_task_id;
  end if;
  perform public.hold_funds(p_task_id);
end;
$$;

-- Preserve service-role-only mutation and existing read-only wallet RLS.
revoke all on function public.provision_demo_wallet_for_profile() from public, anon, authenticated;
revoke all on function public.top_up_wallet(uuid, bigint) from public, anon, authenticated;
revoke all on function public.hold_funds(uuid) from public, anon, authenticated;
revoke all on function public.fund_and_hold_task(uuid) from public, anon, authenticated;
grant execute on function public.provision_demo_wallet_for_profile() to service_role;
grant execute on function public.top_up_wallet(uuid, bigint) to service_role;
grant execute on function public.hold_funds(uuid) to service_role;
grant execute on function public.fund_and_hold_task(uuid) to service_role;
