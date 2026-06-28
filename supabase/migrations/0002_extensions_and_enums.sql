-- ============================================================================
-- Foundation: extensions + enums.
-- These have no table dependencies and must run before any table that uses
-- them. Defined once, up front, so later migrations only ever add tables.
-- ============================================================================

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- Lifecycle of a task, from posting through completion / dispute / resolution.
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
