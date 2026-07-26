-- ============================================================================
-- Phase 39 — Per-user notification channel preferences.
-- ============================================================================

alter table public.profiles
  add column if not exists notify_in_app boolean not null default true,
  add column if not exists notify_push boolean not null default true,
  add column if not exists notify_email boolean not null default true,
  add column if not exists notify_telegram boolean not null default true;
