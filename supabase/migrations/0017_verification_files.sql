-- ============================================================================
-- Phase 17 — Verification file uploads.
-- Lets users upload front and back photos of their Ghana card, plus a phone
-- number and optional email, for admin identity review.
-- ============================================================================

-- Expand verification_requests to store both sides of the card and contact info.
-- The rename is conditional so the migration stays idempotent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'verification_requests' AND column_name = 'id_photo_url'
  ) THEN
    ALTER TABLE verification_requests RENAME COLUMN id_photo_url TO front_photo_path;
  END IF;
END $$;

alter table verification_requests
  add column if not exists back_photo_path text,
  add column if not exists phone text,
  add column if not exists email text;

-- The front photo was historically non-nullable; keep it that way.
alter table verification_requests
  alter column front_photo_path set not null;

-- Set up a private Supabase Storage bucket for ID card images only when the
-- storage schema is available (it is absent in plain Postgres CI runs).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'buckets'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'verification') THEN
      insert into storage.buckets (id, name, public)
      values ('verification', 'verification', false);
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'objects'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'verification_select_own_or_admin'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR SELECT USING (bucket_id = %L AND (auth.uid()::text = path_tokens[1] OR public.is_admin()))',
        'verification_select_own_or_admin',
        'verification'
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'verification_insert_own'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR INSERT WITH CHECK (bucket_id = %L AND auth.uid()::text = path_tokens[1])',
        'verification_insert_own',
        'verification'
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'verification_delete_own'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR DELETE USING (bucket_id = %L AND auth.uid()::text = path_tokens[1])',
        'verification_delete_own',
        'verification'
      );
    END IF;
  END IF;
END $$;
