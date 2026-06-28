-- ============================================================================
-- Phase 1 — Identity foundation.
-- profiles is 1:1 with auth.users and is the parent every other domain table
-- references, so it must exist before anything else.
-- ============================================================================

-- Dual-capability account: every user can both post tasks (buyer) and run them.
create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null,
  phone       text,
  is_admin    boolean not null default false,
  verified    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up. Using a
-- security-definer trigger (rather than a client insert) means the row always
-- exists and the client can never spoof someone else's id.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
