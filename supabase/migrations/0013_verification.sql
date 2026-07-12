-- ============================================================================
-- Phase 13 — Verification workflow.
-- Lets users submit ID verification requests and admins approve or reject them.
-- ============================================================================

create type verification_status as enum ('pending', 'approved', 'rejected');

create table verification_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles (id) on delete cascade,
  id_photo_url  text not null,
  status        verification_status not null default 'pending',
  reviewed_at   timestamptz,
  reviewed_by   uuid references profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);

alter table verification_requests enable row level security;

create policy verification_requests_select
  on verification_requests
  for select
  using (user_id = auth.uid() or is_admin());

create policy verification_requests_insert
  on verification_requests
  for insert
  with check (user_id = auth.uid());

create policy verification_requests_admin_update
  on verification_requests
  for update
  using (is_admin());

create index verification_requests_status_idx on verification_requests (status);
create index verification_requests_user_id_idx on verification_requests (user_id);
