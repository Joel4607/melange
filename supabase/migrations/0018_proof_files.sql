-- ============================================================================
-- Phase 18 — Proof-of-delivery photo uploads.
-- Runners upload the delivery photo in-app instead of pasting a URL; the
-- proofs row stores the private Storage object path.
-- ============================================================================

-- The rename is conditional so the migration stays idempotent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proofs' AND column_name = 'photo_url'
  ) THEN
    ALTER TABLE proofs RENAME COLUMN photo_url TO photo_path;
  END IF;
END $$;

-- Set up a private Supabase Storage bucket for proof photos only when the
-- storage schema is available (it is absent in plain Postgres CI runs).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'buckets'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'proofs') THEN
      insert into storage.buckets (id, name, public)
      values ('proofs', 'proofs', false);
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'objects'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'proofs_select_own_or_admin'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR SELECT USING (bucket_id = %L AND (auth.uid()::text = path_tokens[1] OR public.is_admin()))',
        'proofs_select_own_or_admin',
        'proofs'
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'proofs_insert_own'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR INSERT WITH CHECK (bucket_id = %L AND auth.uid()::text = path_tokens[1])',
        'proofs_insert_own',
        'proofs'
      );
    END IF;
  END IF;
END $$;
