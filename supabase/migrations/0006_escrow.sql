-- ============================================================================
-- Phase 4 — Simulated escrow (no real money).
-- Balance invariants matter, so every write goes through privileged server
-- (service-role) code; RLS later grants clients read-only access.
-- ============================================================================

create table wallets (
  user_id   uuid primary key references profiles (id) on delete cascade,
  balance   numeric(12, 2) not null default 0 check (balance >= 0),
  held      numeric(12, 2) not null default 0 check (held >= 0)
);

-- Append-only ledger: the audit trail behind every wallet balance change.
create table ledger_entries (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid references tasks (id) on delete set null,
  user_id    uuid not null references profiles (id) on delete cascade,
  type       ledger_entry_type not null,
  amount     numeric(12, 2) not null,
  created_at timestamptz not null default now()
);
create index ledger_entries_user_idx on ledger_entries (user_id);
