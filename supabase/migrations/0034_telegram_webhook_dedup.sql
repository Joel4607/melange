create table if not exists telegram_webhook_updates (
  update_id bigint primary key,
  processed_at timestamptz not null default now()
);

create index if not exists telegram_webhook_updates_processed_at_idx on telegram_webhook_updates(processed_at);
