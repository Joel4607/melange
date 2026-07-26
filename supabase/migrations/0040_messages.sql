-- ============================================================================
-- Phase 40 — In-app chat between buyer and runner on a task.
--
-- Messages are append-only and scoped to a single errand. Only the buyer and
-- the selected runner for that task can read or post messages.
-- ============================================================================

-- Stores task-scoped chat messages.
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  sender_id  uuid not null references public.profiles (id) on delete cascade,
  content    text not null check (length(content) > 0 and length(content) <= 1000),
  created_at timestamptz not null default now()
);

create index messages_task_created_idx on public.messages (task_id, created_at desc);
create index messages_sender_idx on public.messages (sender_id);

alter table public.messages enable row level security;
alter table public.messages replica identity full;

-- Select: the current user must be the task's buyer or selected runner.
create policy messages_select on public.messages
  for select using (
    exists (
      select 1 from public.tasks t
      where t.id = messages.task_id
        and (t.buyer_id = auth.uid() or t.selected_runner_id = auth.uid())
    )
    or is_admin()
  );

-- Insert: the sender must be a participant of the referenced task.
create policy messages_insert on public.messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.tasks t
      where t.id = messages.task_id
        and (t.buyer_id = auth.uid() or t.selected_runner_id = auth.uid())
    )
  );

-- Include messages in the default realtime publication.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime FOR TABLE public.messages;
  ELSE
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END
$$;
