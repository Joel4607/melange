-- ============================================================================
-- Phase 6 — Notifications. Drives the in-app center + email/Telegram dispatch.
-- ============================================================================

create table notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles (id) on delete cascade,
  type         text not null,
  payload      jsonb not null default '{}'::jsonb,
  channel      text not null default 'in_app',
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);
-- Partial-friendly composite index: the unread-for-a-user lookup is the hot one.
create index notifications_recipient_idx on notifications (recipient_id, read);
