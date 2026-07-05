-- ============================================================================
-- Phase 8 - Task decline history.
-- Keep declined runners on the task so offer re-runs skip them.
-- ============================================================================

alter table tasks add column declined_runner_ids uuid[] not null default '{}';
