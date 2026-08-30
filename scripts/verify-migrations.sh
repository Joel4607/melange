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

echo ">>> smoke test: atomic errand sharing lifecycle"
"${PSQL[@]}" <<'SQL'
insert into auth.users (email, raw_user_meta_data)
values
  ('share-buyer-a@example.com', '{"name":"Share Buyer A"}'::jsonb),
  ('share-buyer-b@example.com', '{"name":"Share Buyer B"}'::jsonb),
  ('share-runner-a@example.com', '{"name":"Share Runner A"}'::jsonb),
  ('share-runner-b@example.com', '{"name":"Share Runner B"}'::jsonb);

do $$
declare
  v_buyer_a uuid;
  v_buyer_b uuid;
  v_runner_a uuid;
  v_runner_b uuid;
  v_task_a uuid;
  v_task_b uuid;
  v_due_task uuid;
  v_claimed_task uuid;
  v_group_id uuid;
  v_run_id uuid;
  v_status text;
  v_offered_runner_id uuid;
  v_ready boolean;
  v_group_completed boolean;
  v_decision jsonb;
  v_candidates jsonb;
begin
  select id into v_buyer_a from public.profiles where name = 'Share Buyer A';
  select id into v_buyer_b from public.profiles where name = 'Share Buyer B';
  select id into v_runner_a from public.profiles where name = 'Share Runner A';
  select id into v_runner_b from public.profiles where name = 'Share Runner B';

  if has_function_privilege(
       'authenticated', 'public.create_errand_share_group(uuid,uuid,jsonb)', 'EXECUTE'
     ) or not has_function_privilege(
       'service_role', 'public.create_errand_share_group(uuid,uuid,jsonb)', 'EXECUTE'
     ) then
    raise exception 'create_errand_share_group grants are incorrect';
  end if;
  if has_column_privilege(
       'authenticated', 'public.errand_share_groups', 'ordered_route', 'SELECT'
     ) or not has_column_privilege(
       'authenticated', 'public.errand_share_groups', 'predicted_shared_km', 'SELECT'
     ) then
    raise exception 'errand-share route column privacy grants are incorrect';
  end if;

  insert into public.tasks (
    buyer_id, title, category, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
    urgency, price, share_state, share_window_ends_at, delivery_deadline_at
  ) values (
    v_buyer_a, 'Shared A', 'pharmacy', 5.56, -0.20, 5.56, -0.18,
    'normal', 25, 'waiting', now() + interval '10 minutes', now() + interval '8 hours'
  ) returning id into v_task_a;
  insert into public.tasks (
    buyer_id, title, category, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
    urgency, price, share_state, share_window_ends_at
  ) values (
    v_buyer_b, 'Shared B', 'groceries', 5.561, -0.20, 5.561, -0.18,
    'low', 25, 'waiting', now() + interval '30 minutes'
  ) returning id into v_task_b;

  v_decision := jsonb_build_object(
    'accepted', true,
    'algorithmVersion', 'errand-share-v1',
    'configVersion', 'verify-v1',
    'config', '{}'::jsonb,
    'stricterDeadlineAt', extract(epoch from now() + interval '8 hours') * 1000,
    'route', jsonb_build_array(
      jsonb_build_object('taskId', v_task_a, 'kind', 'pickup'),
      jsonb_build_object('taskId', v_task_b, 'kind', 'pickup'),
      jsonb_build_object('taskId', v_task_a, 'kind', 'dropoff'),
      jsonb_build_object('taskId', v_task_b, 'kind', 'dropoff')
    ),
    'metrics', jsonb_build_object(
      'soloDistanceKm', 4,
      'sharedDistanceKm', 2.1,
      'savedDistanceKm', 1.9,
      'taskMetrics', jsonb_build_object(
        v_task_a::text, jsonb_build_object(
          'directDistanceKm', 2, 'carriedDistanceKm', 2.05,
          'detourKm', 0.05, 'detourRatio', 0.025,
          'predictedCompletionAt', extract(epoch from now() + interval '50 minutes') * 1000
        ),
        v_task_b::text, jsonb_build_object(
          'directDistanceKm', 2, 'carriedDistanceKm', 2.1,
          'detourKm', 0.1, 'detourRatio', 0.05,
          'predictedCompletionAt', extract(epoch from now() + interval '55 minutes') * 1000
        )
      )
    )
  );

  select status, group_id into v_status, v_group_id
  from public.create_errand_share_group(v_task_a, v_task_b, v_decision);
  if v_status <> 'created'
     or (select count(*) from public.errand_share_members where group_id = v_group_id) <> 2
     or exists (
       select 1 from public.tasks
       where id = any(array[v_task_a, v_task_b])
         and (share_state <> 'paired' or share_group_id <> v_group_id)
     ) then
    raise exception 'pair creation did not atomically create two members';
  end if;

  v_candidates := jsonb_build_array(
    jsonb_build_object(
      'runnerId', v_runner_a, 'rank', 1, 'matchScore', 0.9,
      'components', jsonb_build_object(
        'proximity', 0.9, 'trust', 0.8, 'capacity', 0.5,
        'urgencyFit', 0.9, 'distanceKm', 0.5
      )
    ),
    jsonb_build_object(
      'runnerId', v_runner_b, 'rank', 2, 'matchScore', 0.8,
      'components', jsonb_build_object(
        'proximity', 0.8, 'trust', 0.8, 'capacity', 0.5,
        'urgencyFit', 0.8, 'distanceKm', 0.8
      )
    )
  );

  select status, run_id into v_status, v_run_id
  from public.finalize_share_match_run(
    v_group_id, 'automatic', 'matching-v2', 'verify-v1', '{}'::jsonb, v_candidates
  );
  if v_status <> 'matched'
     or (select status from public.errand_share_groups where id = v_group_id) <> 'awaiting_funding'
     or exists (
       select 1 from public.tasks
       where id = any(array[v_task_a, v_task_b]) and status <> 'matched'
     ) then
    raise exception 'group match finalization was not atomic';
  end if;

  select status, ready into v_status, v_ready
  from public.confirm_share_funding(v_group_id, v_task_a, v_buyer_a);
  if v_status <> 'funded' or v_ready then
    raise exception 'first member funding readiness is incorrect';
  end if;
  select status, ready into v_status, v_ready
  from public.confirm_share_funding(v_group_id, v_task_b, v_buyer_b);
  if v_status <> 'funded' or not v_ready then
    raise exception 'second member funding readiness is incorrect';
  end if;

  select status, offered_runner_id into v_status, v_offered_runner_id
  from public.offer_next_share_candidate(v_group_id, false);
  if v_status <> 'offered' or v_offered_runner_id <> v_runner_a then
    raise exception 'first shared candidate was not offered';
  end if;
  select status, offered_runner_id into v_status, v_offered_runner_id
  from public.decline_and_offer_next_share_candidate(v_group_id, v_runner_a);
  if v_status <> 'offered' or v_offered_runner_id <> v_runner_b then
    raise exception 'shared decline did not rotate atomically';
  end if;

  select status into v_status from public.accept_share_offer(v_group_id, v_runner_b);
  if v_status <> 'accepted' or exists (
    select 1 from public.tasks
    where id = any(array[v_task_a, v_task_b])
      and (status <> 'accepted' or selected_runner_id <> v_runner_b)
  ) then
    raise exception 'shared acceptance did not update both tasks';
  end if;
  select status into v_status from public.start_share_group(v_group_id, v_runner_b);
  if v_status <> 'started' then
    raise exception 'shared group did not start';
  end if;

  update public.tasks set status = 'completed', completed_at = now() where id = v_task_a;
  select status, group_completed into v_status, v_group_completed
  from public.complete_share_member(v_group_id, v_task_a, now());
  if v_status <> 'member_completed' or v_group_completed then
    raise exception 'first member completion closed the group early';
  end if;
  update public.tasks set status = 'completed', completed_at = now() where id = v_task_b;
  select status, group_completed into v_status, v_group_completed
  from public.complete_share_member(v_group_id, v_task_b, now());
  if v_status <> 'completed' or not v_group_completed
     or (select status from public.errand_share_groups where id = v_group_id) <> 'completed' then
    raise exception 'second member completion did not close the group';
  end if;

  insert into public.tasks (
    buyer_id, title, pickup_lat, pickup_lng, share_state, share_window_ends_at
  ) values (
    v_buyer_a, 'Due share window', 5.56, -0.20, 'waiting', now() - interval '1 minute'
  ) returning id into v_due_task;
  select due.task_id into v_claimed_task
  from public.claim_due_errand_share_tasks(1) due;
  if v_claimed_task is distinct from v_due_task
     or (select share_state from public.tasks where id = v_due_task) <> 'released' then
    raise exception 'due waiting task was not atomically released';
  end if;
end $$;
SQL

echo ">>> smoke test: atomic Telegram link-token consumption"
"${PSQL[@]}" <<'SQL'
insert into auth.users (email, raw_user_meta_data)
values
  ('telegram-admin-verify@example.com', '{"name":"Telegram Admin Verify"}'::jsonb),
  ('telegram-user-verify@example.com', '{"name":"Telegram User Verify"}'::jsonb);

do $$
declare
  v_admin_id uuid;
  v_user_id uuid;
  v_linked_profile_id uuid;
  v_linked_profile_name text;
  v_was_already_linked boolean;
  v_result_count integer;
begin
  select id into v_admin_id
  from public.profiles
  where name = 'Telegram Admin Verify';

  select id into v_user_id
  from public.profiles
  where name = 'Telegram User Verify';

  update public.profiles set is_admin = true where id = v_admin_id;

  if not (select relrowsecurity from pg_class where oid = 'public.telegram_link_tokens'::regclass) then
    raise exception 'telegram_link_tokens RLS is disabled';
  end if;

  if has_table_privilege('anon', 'public.telegram_link_tokens', 'SELECT')
     or has_table_privilege('anon', 'public.telegram_link_tokens', 'INSERT')
     or has_table_privilege('anon', 'public.telegram_link_tokens', 'UPDATE')
     or has_table_privilege('anon', 'public.telegram_link_tokens', 'DELETE')
     or has_table_privilege('authenticated', 'public.telegram_link_tokens', 'SELECT')
     or has_table_privilege('authenticated', 'public.telegram_link_tokens', 'INSERT')
     or has_table_privilege('authenticated', 'public.telegram_link_tokens', 'UPDATE')
     or has_table_privilege('authenticated', 'public.telegram_link_tokens', 'DELETE')
     or not has_table_privilege('service_role', 'public.telegram_link_tokens', 'SELECT')
     or not has_table_privilege('service_role', 'public.telegram_link_tokens', 'INSERT')
     or not has_table_privilege('service_role', 'public.telegram_link_tokens', 'UPDATE')
     or not has_table_privilege('service_role', 'public.telegram_link_tokens', 'DELETE') then
    raise exception 'telegram_link_tokens grants are incorrect';
  end if;

  if has_function_privilege(
       'anon', 'public.link_telegram_from_token(text,text)', 'EXECUTE'
     ) or has_function_privilege(
       'authenticated', 'public.link_telegram_from_token(text,text)', 'EXECUTE'
     ) or not has_function_privilege(
       'service_role', 'public.link_telegram_from_token(text,text)', 'EXECUTE'
     ) then
    raise exception 'link_telegram_from_token grants are incorrect';
  end if;

  insert into public.telegram_link_tokens (token, profile_id, expires_at)
  values ('verify-valid-token', v_admin_id, now() + interval '10 minutes');

  select linked_profile_id, linked_profile_name, was_already_linked
    into v_linked_profile_id, v_linked_profile_name, v_was_already_linked
  from public.link_telegram_from_token('verify-valid-token', 'telegram-verify-42');

  if v_linked_profile_id is distinct from v_admin_id
     or v_linked_profile_name is distinct from 'Telegram Admin Verify'
     or v_was_already_linked
     or (select telegram_user_id from public.profiles where id = v_admin_id)
        is distinct from 'telegram-verify-42'
     or (select used_at from public.telegram_link_tokens where token = 'verify-valid-token') is null then
    raise exception 'valid Telegram token was not linked and consumed atomically';
  end if;

  select count(*) into v_result_count
  from public.link_telegram_from_token('verify-valid-token', 'telegram-verify-42');
  if v_result_count <> 0 then
    raise exception 'used Telegram token was accepted twice';
  end if;

  insert into public.telegram_link_tokens (token, profile_id, expires_at)
  values ('verify-already-linked-token', v_admin_id, now() + interval '10 minutes');

  select linked_profile_id, linked_profile_name, was_already_linked
    into v_linked_profile_id, v_linked_profile_name, v_was_already_linked
  from public.link_telegram_from_token('verify-already-linked-token', 'telegram-verify-42');

  if v_linked_profile_id is distinct from v_admin_id
     or not v_was_already_linked
     or (select used_at from public.telegram_link_tokens where token = 'verify-already-linked-token') is null then
    raise exception 'already-linked Telegram token behavior is incorrect';
  end if;

  insert into public.telegram_link_tokens (token, profile_id, expires_at)
  values
    ('verify-expired-token', v_admin_id, now() - interval '1 minute'),
    ('verify-used-token', v_admin_id, now() + interval '10 minutes'),
    ('verify-non-admin-token', v_user_id, now() + interval '10 minutes');
  update public.telegram_link_tokens set used_at = now() where token = 'verify-used-token';

  select count(*) into v_result_count
  from (
    select * from public.link_telegram_from_token('verify-expired-token', 'telegram-other')
    union all
    select * from public.link_telegram_from_token('verify-used-token', 'telegram-other')
    union all
    select * from public.link_telegram_from_token('verify-non-admin-token', 'telegram-other')
  ) rejected;

  if v_result_count <> 0
     or (select used_at from public.telegram_link_tokens where token = 'verify-expired-token') is not null
     or (select used_at from public.telegram_link_tokens where token = 'verify-non-admin-token') is not null
     or (select telegram_user_id from public.profiles where id = v_user_id) is not null then
    raise exception 'invalid Telegram token was accepted or mutated';
  end if;

  update public.profiles
  set telegram_user_id = 'telegram-conflict'
  where id = v_user_id;
  insert into public.telegram_link_tokens (token, profile_id, expires_at)
  values ('verify-conflict-token', v_admin_id, now() + interval '10 minutes');

  begin
    perform *
    from public.link_telegram_from_token('verify-conflict-token', 'telegram-conflict');
    raise exception 'duplicate Telegram ID did not reject the link';
  exception
    when unique_violation then null;
  end;

  if (select used_at from public.telegram_link_tokens where token = 'verify-conflict-token') is not null
     or (select telegram_user_id from public.profiles where id = v_admin_id)
        is distinct from 'telegram-verify-42' then
    raise exception 'failed Telegram link did not roll back token and profile changes';
  end if;

  insert into public.telegram_link_tokens (token, profile_id, expires_at)
  values ('verify-race-token', v_admin_id, now() + interval '10 minutes');

  create table public.telegram_link_race_results (
    slot integer primary key,
    result_count integer not null
  );
end $$;
SQL

"${PSQL[@]}" -c "begin; insert into public.telegram_link_race_results select 1, count(*) from public.link_telegram_from_token('verify-race-token', 'telegram-race'); select pg_sleep(1); commit;" &
race_pid_one=$!
sleep 0.2
"${PSQL[@]}" -c "insert into public.telegram_link_race_results select 2, count(*) from public.link_telegram_from_token('verify-race-token', 'telegram-race');" &
race_pid_two=$!
wait "$race_pid_one"
wait "$race_pid_two"

"${PSQL[@]}" <<'SQL'
do $$
begin
  if (select count(*) from public.telegram_link_race_results) <> 2
     or (select sum(result_count) from public.telegram_link_race_results) <> 1
     or (select used_at from public.telegram_link_tokens where token = 'verify-race-token') is null
     or not exists (
       select 1 from public.profiles
       where name = 'Telegram Admin Verify' and telegram_user_id = 'telegram-race'
     ) then
    raise exception 'concurrent Telegram token consumption did not produce exactly one winner';
  end if;
end $$;

drop table public.telegram_link_race_results;
SQL

echo ">>> migrations OK"
