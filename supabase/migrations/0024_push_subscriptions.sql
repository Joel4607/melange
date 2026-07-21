-- ============================================================================
-- Phase 24 — Web Push subscriptions (VAPID).
-- Stores per-device push subscriptions so server actions can send push
-- notifications alongside in-app notifications.
-- ============================================================================

create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles (id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

create policy push_subscriptions_self_select on push_subscriptions
  for select using (user_id = auth.uid());

create policy push_subscriptions_self_insert on push_subscriptions
  for insert with check (user_id = auth.uid());

create policy push_subscriptions_self_update on push_subscriptions
  for update using (user_id = auth.uid());

create policy push_subscriptions_self_delete on push_subscriptions
  for delete using (user_id = auth.uid());

-- Keep the updated_at timestamp fresh when a subscription is re-registered.
create or replace function update_push_subscription_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger push_subscriptions_updated_at
  before update on push_subscriptions
  for each row
  execute function update_push_subscription_timestamp();
