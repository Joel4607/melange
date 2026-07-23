-- ============================================================================
-- Phase 33 — Shorter Telegram Mini App link tokens.
-- Telegram's start_param is limited to 64 characters, so we store a short
-- random token in Postgres and map it to the admin profile on first open.
-- ============================================================================

create table public.telegram_link_tokens (
  token text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz default now()
);

comment on table public.telegram_link_tokens is 'Short-lived tokens used to link a Telegram user to a web admin profile via a t.me deep link.';
