-- Local/CI-only shim emulating the parts of Supabase's managed `auth` schema
-- our migrations touch, so migrations can be applied (and tested) against a
-- vanilla Postgres. This is NEVER applied to Supabase, which already provides a
-- richer auth schema. Used by scripts/verify-migrations.sh.
create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end $$;

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

-- Minimal Realtime authorization surface for the local/CI policy tests.
-- This shim is never applied to a managed Supabase database.
create schema if not exists realtime;
create table if not exists realtime.messages (
  topic text not null,
  extension text not null,
  event text,
  payload jsonb,
  private boolean default true
);
alter table realtime.messages enable row level security;
grant usage on schema realtime to anon, authenticated;
grant select, insert on realtime.messages to anon, authenticated;
create or replace function realtime.topic()
returns text language sql stable as $$
  select nullif(current_setting('realtime.topic', true), '');
$$;
