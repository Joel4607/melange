-- ============================================================================
-- Phase 32 — Telegram Mini App admin support.
-- Adds a way for an admin profile to be linked to a Telegram user id so the
-- Telegram Mini App can authenticate via Telegram's initData and approve
-- verifications / resolve disputes.
-- ============================================================================

alter table public.profiles
  add column telegram_user_id text;

create unique index profiles_telegram_user_id_idx
  on public.profiles (telegram_user_id)
  where telegram_user_id is not null;
