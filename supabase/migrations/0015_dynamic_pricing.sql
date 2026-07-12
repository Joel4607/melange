-- ============================================================================
-- Phase 15 — Dynamic pricing / fee breakdown.
-- Adds a platform fee column to tasks so the buyer, runner, and escrow can
-- distinguish the total charge from the runner's net payout.
-- ============================================================================

alter table tasks add column fee numeric(12, 2) not null default 0 check (fee >= 0);
