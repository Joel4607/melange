-- ============================================================================
-- Phase 26 — Let admins read proof-of-delivery photos for dispute/verification
-- handling in admin tools and the Telegram mini app.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'objects'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'proofs_select_admin'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR SELECT USING (bucket_id = %L AND public.is_admin())',
        'proofs_select_admin',
        'proofs'
      );
    END IF;
  END IF;
END $$;
