-- ============================================================================
-- Runner availability: manual override + scheduled working hours.
--
-- `available_manual` lets the runner explicitly override the schedule (true/false).
-- When null, `is_available` follows `scheduled_hours`.
-- The application recomputes current availability at match/feed time.
-- ============================================================================

alter table runner_profile
  add column if not exists available_manual boolean,
  add column if not exists scheduled_hours jsonb;
