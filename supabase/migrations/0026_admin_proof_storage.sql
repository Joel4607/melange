-- ============================================================================
-- Phase 26 — Admin access to proof-of-delivery photos.
-- Note: the main participant policy in 0025 already includes public.is_admin(),
-- but this explicit admin policy keeps the intent clear and defends against
-- future policy rewrites.
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
