-- ============================================================================
-- Errand marketplace — core schema
-- Postgres / Supabase. Run after enabling the pgcrypto extension (Supabase
-- enables gen_random_uuid via pgcrypto by default).
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type task_status as enum (
  'posted', 'matched', 'accepted', 'in_progress',
  'completed', 'disputed', 'resolved', 'cancelled'
);
create type urgency as enum ('low', 'normal', 'express');
create type runner_status as enum ('active', 'suspended', 'quarantined');
create type fraud_rule as enum (
  'gps_mismatch', 'impossible_speed', 'rapid_cancellations', 'repeated_pair_disputes'
);
create type fraud_status as enum ('active', 'cleared', 'confirmed');
create type dispute_status as enum ('open', 'auto_resolved', 'escalated', 'resolved');
create type dispute_resolution as enum ('refund', 'release', 'partial');
create type ledger_entry_type as enum ('hold', 'release', 'refund', 'topup', 'payout');

-- ----------------------------------------------------------------------------
-- Profiles (1:1 with auth.users). Dual-capability: every user can buy and run.
-- ----------------------------------------------------------------------------
create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null,
  phone       text,
  is_admin    boolean not null default false,
  verified    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Runner-specific operational state.
create table runner_profile (
  user_id       uuid primary key references profiles (id) on delete cascade,
  current_lat   double precision,
  current_lng   double precision,
  is_available  boolean not null default false,
  active_load   integer not null default 0,
  trust_score   double precision not null default 0.5,  -- cached; recomputed by job
  status        runner_status not null default 'active',
  updated_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Tasks
-- ----------------------------------------------------------------------------
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
  price              numeric(12, 2) not null default 0,
  status             task_status not null default 'posted',
  selected_runner_id uuid references profiles (id),
  accepted_at        timestamptz,
  completed_at       timestamptz,
  created_at         timestamptz not null default now()
);
create index tasks_status_idx on tasks (status);
create index tasks_buyer_idx on tasks (buyer_id);
create index tasks_runner_idx on tasks (selected_runner_id);

-- ----------------------------------------------------------------------------
-- Ranking snapshots (audit trail + evaluation dataset + "why this rank" demo)
-- ----------------------------------------------------------------------------
create table match_runs (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references tasks (id) on delete cascade,
  generated_at timestamptz not null default now()
);

create table match_candidates (
  id           uuid primary key default gen_random_uuid(),
  match_run_id uuid not null references match_runs (id) on delete cascade,
  runner_id    uuid not null references profiles (id) on delete cascade,
  rank         integer not null,
  match_score  double precision not null,
  proximity    double precision not null,
  trust        double precision not null,
  availability double precision not null,
  urgency_fit  double precision not null,
  distance_km  double precision not null
);
create index match_candidates_run_idx on match_candidates (match_run_id);

-- ----------------------------------------------------------------------------
-- Proof of completion (in-app photo + live geolocation + server timestamp)
-- ----------------------------------------------------------------------------
create table proofs (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks (id) on delete cascade,
  runner_id   uuid not null references profiles (id) on delete cascade,
  photo_url   text not null,
  gps_lat     double precision,
  gps_lng     double precision,
  captured_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Ratings
-- ----------------------------------------------------------------------------
create table ratings (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks (id) on delete cascade,
  rater_id   uuid not null references profiles (id) on delete cascade,
  ratee_id   uuid not null references profiles (id) on delete cascade,
  stars      smallint not null check (stars between 1 and 5),
  comment    text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Trust events (feed the decay calculation)
-- ----------------------------------------------------------------------------
create table trust_events (
  id         uuid primary key default gen_random_uuid(),
  runner_id  uuid not null references profiles (id) on delete cascade,
  type       text not null,   -- completed | cancelled | rating | responsiveness | dispute_lost
  value      double precision not null default 1,
  created_at timestamptz not null default now()
);
create index trust_events_runner_idx on trust_events (runner_id);

-- ----------------------------------------------------------------------------
-- Fraud flags
-- ----------------------------------------------------------------------------
create table fraud_flags (
  id         uuid primary key default gen_random_uuid(),
  runner_id  uuid not null references profiles (id) on delete cascade,
  task_id    uuid references tasks (id) on delete set null,
  rule_type  fraud_rule not null,
  severity   double precision not null,
  status     fraud_status not null default 'active',
  detail     text,
  created_at timestamptz not null default now()
);
create index fraud_flags_runner_idx on fraud_flags (runner_id);

-- ----------------------------------------------------------------------------
-- Disputes
-- ----------------------------------------------------------------------------
create table disputes (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references tasks (id) on delete cascade,
  raised_by    uuid not null references profiles (id) on delete cascade,
  reason       text not null,
  status       dispute_status not null default 'open',
  resolution   dispute_resolution,
  decided_by   text,            -- 'system' | 'admin'
  rule_matched text,
  confidence   double precision,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);
create index disputes_status_idx on disputes (status);

-- ----------------------------------------------------------------------------
-- Simulated escrow ledger (no real money)
-- ----------------------------------------------------------------------------
create table wallets (
  user_id   uuid primary key references profiles (id) on delete cascade,
  balance   numeric(12, 2) not null default 0,
  held      numeric(12, 2) not null default 0
);

create table ledger_entries (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid references tasks (id) on delete set null,
  user_id    uuid not null references profiles (id) on delete cascade,
  type       ledger_entry_type not null,
  amount     numeric(12, 2) not null,
  created_at timestamptz not null default now()
);
create index ledger_entries_user_idx on ledger_entries (user_id);

-- ----------------------------------------------------------------------------
-- Notifications (drives in-app center + email/Telegram dispatch)
-- ----------------------------------------------------------------------------
create table notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles (id) on delete cascade,
  type         text not null,
  payload      jsonb not null default '{}'::jsonb,
  channel      text not null default 'in_app',
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);
create index notifications_recipient_idx on notifications (recipient_id, read);
