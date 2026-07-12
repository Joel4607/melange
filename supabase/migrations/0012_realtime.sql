-- ============================================================================
-- Phase 12 — Realtime status updates.
-- Enable Supabase Realtime on the tables that drive the in-app UI.
-- ============================================================================

alter table tasks         replica identity full;
alter table notifications replica identity full;

-- Ensure the supabase_realtime publication exists and includes the tables.
-- This is the publication the Realtime extension listens to by default.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime FOR TABLE tasks, notifications;
  ELSE
    ALTER PUBLICATION supabase_realtime ADD TABLE tasks, notifications;
  END IF;
END
$$;
