#!/usr/bin/env bash
# Apply the auth shim + every migration, in order, against a throwaway Postgres.
# Catches SQL errors, ordering / dependency mistakes and broken policies before
# they ever reach Supabase. Used in CI and runnable locally.
#
#   DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres \
#     ./scripts/verify-migrations.sh
set -euo pipefail

DB_URL="${DATABASE_URL:?set DATABASE_URL to a Postgres connection string}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PSQL=(psql -v ON_ERROR_STOP=1 -q -d "$DB_URL")

echo ">>> auth shim"
"${PSQL[@]}" -f "$ROOT/scripts/auth-shim.sql"

for f in "$ROOT"/supabase/migrations/*.sql; do
  echo ">>> applying $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done

echo ">>> smoke test: signup trigger + RLS coverage"
"${PSQL[@]}" <<'SQL'
insert into auth.users (email, raw_user_meta_data)
values ('verify@example.com', '{"name":"Verify"}'::jsonb);

do $$
declare
  n_profiles int;
  n_rls      int;
begin
  select count(*) into n_profiles from public.profiles where name = 'Verify';
  if n_profiles <> 1 then
    raise exception 'signup trigger did not create profile (got %)', n_profiles;
  end if;

  select count(*) into n_rls
  from pg_tables where schemaname = 'public' and rowsecurity;
  if n_rls < 13 then
    raise exception 'expected RLS on >=13 tables, got %', n_rls;
  end if;
end $$;
SQL

echo ">>> smoke test: atomic matching finalization"
"${PSQL[@]}" <<'SQL'
insert into auth.users (email, raw_user_meta_data)
values ('runner-verify@example.com', '{"name":"Runner Verify"}'::jsonb);

do $$
declare
  v_buyer_id uuid;
  v_runner_id uuid;
  v_empty_task_id uuid;
  v_match_task_id uuid;
  v_claim_task_id uuid;
  v_status text;
  v_run_id uuid;
  v_offered_runner_id uuid;
  v_candidates jsonb;
begin
  select id into v_buyer_id from public.profiles where name = 'Verify';
  select id into v_runner_id from public.profiles where name = 'Runner Verify';

  if to_regprocedure(
    'public.finalize_match_run(uuid,text,text,text,jsonb,jsonb,uuid)'
  ) is null then
    raise exception 'finalize_match_run function is missing';
  end if;
  if has_function_privilege('anon', 'public.finalize_match_run(uuid,text,text,text,jsonb,jsonb,uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.finalize_match_run(uuid,text,text,text,jsonb,jsonb,uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.finalize_match_run(uuid,text,text,text,jsonb,jsonb,uuid)', 'EXECUTE') then
    raise exception 'finalize_match_run grants are incorrect';
  end if;
  if has_function_privilege('authenticated', 'public.decline_and_offer_next_candidate(uuid,uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.decline_and_offer_next_candidate(uuid,uuid)', 'EXECUTE') then
    raise exception 'decline_and_offer_next_candidate grants are incorrect';
  end if;

  insert into public.tasks (buyer_id, title, pickup_lat, pickup_lng)
  values (v_buyer_id, 'No candidates', 5.56, -0.20)
  returning id into v_empty_task_id;

  select status, run_id into v_status, v_run_id
  from public.finalize_match_run(
    v_empty_task_id, 'automatic', 'verify', 'verify', '{}'::jsonb, '[]'::jsonb
  );
  if v_status <> 'no_candidates'
     or (select status from public.tasks where id = v_empty_task_id) <> 'posted'
     or (select active_match_run_id from public.tasks where id = v_empty_task_id) is not null then
    raise exception 'empty finalization did not preserve posted state';
  end if;

  v_candidates := jsonb_build_array(jsonb_build_object(
    'runnerId', v_runner_id,
    'rank', 1,
    'matchScore', 0.8,
    'components', jsonb_build_object(
      'proximity', 0.8,
      'trust', 0.7,
      'capacity', 1,
      'urgencyFit', 0.9,
      'distanceKm', 1.2
    )
  ));

  insert into public.tasks (buyer_id, title, pickup_lat, pickup_lng, price)
  values (v_buyer_id, 'Matched task', 5.56, -0.20, 50)
  returning id into v_match_task_id;

  select status, run_id into v_status, v_run_id
  from public.finalize_match_run(
    v_match_task_id, 'automatic', 'verify', 'verify', '{}'::jsonb, v_candidates
  );
  if v_status <> 'matched'
     or (select status from public.tasks where id = v_match_task_id) <> 'matched'
     or (select active_match_run_id from public.tasks where id = v_match_task_id) <> v_run_id then
    raise exception 'successful finalization did not activate its exact run';
  end if;

  select status, run_id into v_status, v_run_id
  from public.finalize_match_run(
    v_match_task_id, 'manual', 'verify', 'verify', '{}'::jsonb, v_candidates
  );
  if v_status <> 'not_posted' or v_run_id is not null then
    raise exception 'stale finalization was not rejected';
  end if;

  select status, offered_runner_id, run_id
  into v_status, v_offered_runner_id, v_run_id
  from public.offer_next_match_candidate(v_match_task_id, true);
  if v_status <> 'offered'
     or v_offered_runner_id <> v_runner_id
     or (select selected_runner_id from public.tasks where id = v_match_task_id) <> v_runner_id
     or not exists (
       select 1 from public.match_outcomes
       where match_run_id = v_run_id and runner_id = v_runner_id
     )
     or (select balance from public.wallets where user_id = v_buyer_id) <> 0
     or (select held from public.wallets where user_id = v_buyer_id) <> 50
     or not exists (
       select 1 from public.ledger_entries
       where task_id = v_match_task_id and type = 'topup' and amount = 50
     )
     or not exists (
       select 1 from public.ledger_entries
       where task_id = v_match_task_id and type = 'hold' and amount = 50
     ) then
    raise exception 'offer, funding, hold, and outcome were not atomic';
  end if;

  select status, offered_runner_id, run_id
  into v_status, v_offered_runner_id, v_run_id
  from public.decline_and_offer_next_candidate(v_match_task_id, v_runner_id);
  if v_status <> 'reopened'
     or v_offered_runner_id is not null
     or (select status from public.tasks where id = v_match_task_id) <> 'posted'
     or (select selected_runner_id from public.tasks where id = v_match_task_id) is not null
     or (select active_match_run_id from public.tasks where id = v_match_task_id) is not null then
    raise exception 'last decline did not atomically reopen the task';
  end if;

  insert into public.tasks (buyer_id, title, pickup_lat, pickup_lng, price)
  values (v_buyer_id, 'Self claim task', 5.56, -0.20, 50)
  returning id into v_claim_task_id;

  select status, run_id into v_status, v_run_id
  from public.finalize_match_run(
    v_claim_task_id,
    'self_claim',
    'self-claim',
    'self-claim-v1',
    '{}'::jsonb,
    v_candidates,
    v_runner_id
  );
  if v_status <> 'matched'
     or (select selected_runner_id from public.tasks where id = v_claim_task_id) <> v_runner_id
     or not exists (
       select 1 from public.match_outcomes
       where match_run_id = v_run_id and runner_id = v_runner_id
     )
     or (select balance from public.wallets where user_id = v_buyer_id) <> 0
     or (select held from public.wallets where user_id = v_buyer_id) <> 100
     or not exists (
       select 1 from public.ledger_entries
       where task_id = v_claim_task_id and type = 'topup' and amount = 50
     )
     or not exists (
       select 1 from public.ledger_entries
       where task_id = v_claim_task_id and type = 'hold' and amount = 50
     ) then
    raise exception 'self claim did not atomically fund, hold, select, and record';
  end if;

  select status into v_status
  from public.cancel_task_with_refund(v_claim_task_id, v_buyer_id, 'buyer');
  if v_status <> 'cancelled'
     or (select status from public.tasks where id = v_claim_task_id) <> 'cancelled'
     or (select balance from public.wallets where user_id = v_buyer_id) <> 50
     or (select held from public.wallets where user_id = v_buyer_id) <> 50
     or not exists (
       select 1 from public.ledger_entries
       where task_id = v_claim_task_id and type = 'refund' and amount = 50
     ) then
    raise exception 'buyer cancellation was not finalized atomically';
  end if;
end $$;
SQL

echo ">>> migrations OK"
