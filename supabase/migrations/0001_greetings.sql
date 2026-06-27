-- Walking-skeleton demo table: proves the full path Next.js -> Supabase -> UI.
create table if not exists greetings (
  id         uuid primary key default gen_random_uuid(),
  message    text not null,
  created_at timestamptz not null default now()
);

-- Allow the anon key to read greetings (public, read-only).
alter table greetings enable row level security;

drop policy if exists greetings_anon_select on greetings;
create policy greetings_anon_select on greetings
  for select using (true);

insert into greetings (message) values ('Hello from Supabase 👋');
