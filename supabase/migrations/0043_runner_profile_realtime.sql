-- ============================================================================
-- Phase 43 — Enable Realtime for runner_profile.
-- This lets the runner dashboard and errand map react to location/availability
-- changes without waiting for the next page load or poll cycle.
-- ============================================================================

alter table if exists public.runner_profile replica identity full;

DO $$
DECLARE
  v_in_publication boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'runner_profile'
  ) INTO v_in_publication;

  IF NOT v_in_publication THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
      CREATE PUBLICATION supabase_realtime FOR TABLE public.runner_profile;
    ELSE
      ALTER PUBLICATION supabase_realtime ADD TABLE public.runner_profile;
    END IF;
  END IF;
END
$$;
