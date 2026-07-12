-- ============================================================================
-- Phase 14 — Enable Realtime for verification_requests.
-- ============================================================================

alter table verification_requests replica identity full;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime FOR TABLE verification_requests;
  ELSE
    ALTER PUBLICATION supabase_realtime ADD TABLE verification_requests;
  END IF;
END
$$;
