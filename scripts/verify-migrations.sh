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

echo ">>> migrations OK"
