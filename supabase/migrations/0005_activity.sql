-- ============================================================================
-- Phase 3 — Activity & history. All depend on tasks + profiles.
-- ============================================================================

-- Ranking snapshot: one row per time the matcher ran for a task. Doubles as an
-- audit trail, an evaluation dataset, and the "why this rank" explanation.
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

-- Proof of completion: in-app photo + live geolocation + server timestamp.
create table proofs (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks (id) on delete cascade,
  runner_id   uuid not null references profiles (id) on delete cascade,
  photo_url   text not null,
  gps_lat     double precision,
  gps_lng     double precision,
  captured_at timestamptz not null default now()
);

create table ratings (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks (id) on delete cascade,
  rater_id   uuid not null references profiles (id) on delete cascade,
  ratee_id   uuid not null references profiles (id) on delete cascade,
  stars      smallint not null check (stars between 1 and 5),
  comment    text,
  created_at timestamptz not null default now()
);

-- Append-only events that feed the trust-score decay calculation.
create table trust_events (
  id         uuid primary key default gen_random_uuid(),
  runner_id  uuid not null references profiles (id) on delete cascade,
  type       text not null,   -- completed | cancelled | rating | responsiveness | dispute_lost
  value      double precision not null default 1,
  created_at timestamptz not null default now()
);
create index trust_events_runner_idx on trust_events (runner_id);
