-- ============================================================================
-- Phase 42 — Buyer review + optional tip after delivery.
-- Adds an optional tip to the ratings table, a unique guard so a task can only
-- be rated once by the buyer, ledger entry types for tips, and an atomic
-- rate_and_tip function that transfers the tip from buyer to runner.
-- ============================================================================

alter table ratings
  add column if not exists tip_amount numeric(12, 2) not null default 0 check (tip_amount >= 0);

create unique index if not exists ratings_task_rater_ratee_unique
  on ratings (task_id, rater_id, ratee_id);

-- Allow ledger entries to record tips moving from buyer to runner.
alter type ledger_entry_type add value if not exists 'tip_charge';
alter type ledger_entry_type add value if not exists 'tip';

-- Atomically rate a runner and transfer an optional tip from the buyer.
-- Safe to retry: raises on duplicate rating and skips duplicate tip ledger rows.
create or replace function public.rate_and_tip(
  p_task_id uuid,
  p_rater_id uuid,
  p_stars smallint,
  p_comment text,
  p_tip_cents bigint
) returns uuid
language plpgsql
as $$
declare
  v_buyer_id uuid;
  v_runner_id uuid;
  v_tip_amount numeric(12, 2);
  v_rating_id uuid;
  v_updated int;
begin
  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'stars must be between 1 and 5';
  end if;

  if p_tip_cents is null or p_tip_cents < 0 then
    raise exception 'tip cannot be negative';
  end if;

  select buyer_id, selected_runner_id
  into v_buyer_id, v_runner_id
  from tasks
  where id = p_task_id
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

  if exists (
    select 1 from ratings
    where task_id = p_task_id
      and rater_id = p_rater_id
      and ratee_id = v_runner_id
  ) then
    raise exception 'task % has already been rated', p_task_id;
  end if;

  v_tip_amount := (p_tip_cents / 100.0)::numeric(12, 2);

  if v_tip_amount > 0 then
    insert into wallets (user_id, balance, held)
    values (v_buyer_id, 0, 0), (v_runner_id, 0, 0)
    on conflict (user_id) do nothing;

    update wallets
    set balance = balance - v_tip_amount
    where user_id = v_buyer_id and balance >= v_tip_amount;

    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise exception 'buyer % has insufficient balance for tip', v_buyer_id;
    end if;

    update wallets
    set balance = balance + v_tip_amount
    where user_id = v_runner_id;

    insert into ledger_entries (task_id, user_id, type, amount)
    values
      (p_task_id, v_buyer_id, 'tip_charge', -v_tip_amount),
      (p_task_id, v_runner_id, 'tip', v_tip_amount);
  end if;

  insert into ratings (task_id, rater_id, ratee_id, stars, comment, tip_amount)
  values (p_task_id, p_rater_id, v_runner_id, p_stars, nullif(trim(p_comment), ''), v_tip_amount)
  returning id into v_rating_id;

  return v_rating_id;
end;
$$;
