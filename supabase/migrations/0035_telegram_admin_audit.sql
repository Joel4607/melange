create table if not exists telegram_admin_actions (
  id uuid default gen_random_uuid() primary key,
  admin_id uuid not null references profiles(id) on delete cascade,
  action text not null,
  target_id text not null,
  metadata jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists telegram_admin_actions_admin_id_idx on telegram_admin_actions(admin_id);
create index if not exists telegram_admin_actions_action_idx on telegram_admin_actions(action);
create index if not exists telegram_admin_actions_target_id_idx on telegram_admin_actions(target_id);
create index if not exists telegram_admin_actions_created_at_idx on telegram_admin_actions(created_at);
