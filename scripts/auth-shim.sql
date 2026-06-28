-- Local/CI-only shim emulating the parts of Supabase's managed `auth` schema
-- our migrations touch, so migrations can be applied (and tested) against a
-- vanilla Postgres. This is NEVER applied to Supabase, which already provides a
-- richer auth schema. Used by scripts/verify-migrations.sh.
create extension if not exists pgcrypto;

create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

-- auth.uid() returns the current request's user id. Real Supabase reads a JWT
-- claim; here it reads a GUC tests can set via set_config('request.jwt.claim.sub', ...).
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
