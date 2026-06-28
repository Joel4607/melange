-- ============================================================================
-- Phase 2 — Core domain: runner operational state + tasks.
-- ============================================================================

-- Runner-specific state, separate from profiles so the common account stays
-- lean. Created lazily by server code the first time a user goes "available".
create table runner_profile (
  user_id       uuid primary key references profiles (id) on delete cascade,
  current_lat   double precision,
  current_lng   double precision,
  is_available  boolean not null default false,
  active_load   integer not null default 0,
  trust_score   double precision not null default 0.5,  -- cached; recomputed by the trust job
  status        runner_status not null default 'active',
  updated_at    timestamptz not null default now()
);

-- The central marketplace object.
create table tasks (
  id                 uuid primary key default gen_random_uuid(),
  buyer_id           uuid not null references profiles (id) on delete cascade,
  title              text not null,
  description        text,
  category           text,
  pickup_lat         double precision not null,
  pickup_lng         double precision not null,
  dropoff_lat        double precision,
  dropoff_lng        double precision,
  urgency            urgency not null default 'normal',
  price              numeric(12, 2) not null default 0 check (price >= 0),
  status             task_status not null default 'posted',
  selected_runner_id uuid references profiles (id),
  accepted_at        timestamptz,
  completed_at       timestamptz,
  created_at         timestamptz not null default now()
);

-- Indexes on the only queries that are actually hot: open-task feed, a buyer's
-- own tasks, and a runner's assigned tasks.
create index tasks_status_idx on tasks (status);
create index tasks_buyer_idx  on tasks (buyer_id);
create index tasks_runner_idx on tasks (selected_runner_id);
