-- ============================================================================
-- Phase 44 — Multi-stop errands and recurring task series.
-- ============================================================================

alter table public.tasks
  add column if not exists stops jsonb,
  add column if not exists recurrence text not null default 'none' check (recurrence in ('none', 'daily', 'weekly', 'monthly')),
  add column if not exists recurrence_end_date date,
  add column if not exists parent_task_id uuid references public.tasks (id) on delete set null,
  add column if not exists series_number integer not null default 1;

create index if not exists tasks_parent_task_id_idx on public.tasks (parent_task_id);
create index if not exists tasks_recurrence_idx on public.tasks (recurrence, recurrence_end_date);
