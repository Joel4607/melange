-- ============================================================================
-- Phase 5 — Trust & safety: disputes + fraud flags.
-- ============================================================================

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
