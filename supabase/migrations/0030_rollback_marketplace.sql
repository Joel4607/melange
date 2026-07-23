-- ============================================================================
-- Phase 30 — Rollback the peer-to-peer marketplace.
-- Drops all marketplace tables, functions, storage, policies, enum values and
-- columns added for Phase 1/2 and restores the original ratings/disputes shape.
-- Safe to run on a fresh database (objects won't exist) and on the production
-- database that has the marketplace schema applied.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Remove marketplace objects from storage.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM storage.delete_bucket('marketplace');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'objects'
  ) THEN
    DROP POLICY IF EXISTS marketplace_select_auth ON storage.objects;
    DROP POLICY IF EXISTS marketplace_select_admin ON storage.objects;
    DROP POLICY IF EXISTS marketplace_insert_own ON storage.objects;
    DROP POLICY IF EXISTS marketplace_delete_own_or_admin ON storage.objects;
    DROP POLICY IF EXISTS proofs_select_admin ON storage.objects;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Drop marketplace functions before the types they reference.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.market_hold_funds(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.market_release_funds(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.market_refund_funds(uuid) CASCADE;

-- ----------------------------------------------------------------------------
-- Remove rows that depend on the marketplace tables.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ratings' AND column_name = 'listing_order_id'
  ) THEN
    EXECUTE 'DELETE FROM public.ratings WHERE listing_order_id IS NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'disputes' AND column_name = 'listing_order_id'
  ) THEN
    EXECUTE 'DELETE FROM public.disputes WHERE listing_order_id IS NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'listing_order_id'
  ) THEN
    EXECUTE $q$ DELETE FROM public.tasks WHERE listing_order_id IS NOT NULL OR category = 'Marketplace delivery' $q$;
  ELSE
    DELETE FROM public.tasks WHERE category = 'Marketplace delivery';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Drop marketplace tables.
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.listing_order_events CASCADE;
DROP TABLE IF EXISTS public.listing_orders CASCADE;
DROP TABLE IF EXISTS public.listings CASCADE;

-- ----------------------------------------------------------------------------
-- Restore the original columns and constraints on shared tables.
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_seller;

ALTER TABLE public.tasks DROP COLUMN IF EXISTS listing_order_id;

ALTER TABLE public.ledger_entries DROP COLUMN IF EXISTS listing_order_id;
DROP INDEX IF EXISTS ledger_entries_listing_order_type_unique;

-- Restore ratings to its original task-only shape.
ALTER TABLE public.ratings DROP COLUMN IF EXISTS listing_order_id;
ALTER TABLE public.ratings ALTER COLUMN task_id SET NOT NULL;
ALTER TABLE public.ratings DROP CONSTRAINT IF EXISTS ratings_subject_check;
DROP INDEX IF EXISTS ratings_task_rater_unique_idx;
DROP INDEX IF EXISTS ratings_order_rater_unique_idx;
ALTER TABLE public.ratings DROP CONSTRAINT IF EXISTS ratings_task_rater_unique;
ALTER TABLE public.ratings ADD CONSTRAINT ratings_task_rater_unique UNIQUE (task_id, rater_id);

-- Restore disputes to its original task-only shape.
ALTER TABLE public.disputes DROP COLUMN IF EXISTS listing_order_id;
ALTER TABLE public.disputes ALTER COLUMN task_id SET NOT NULL;
ALTER TABLE public.disputes DROP CONSTRAINT IF EXISTS disputes_subject_check;
DROP INDEX IF EXISTS disputes_subject_unique_idx;
ALTER TABLE public.disputes DROP CONSTRAINT IF EXISTS disputes_task_unique;
ALTER TABLE public.disputes ADD CONSTRAINT disputes_task_unique UNIQUE (task_id);

-- ----------------------------------------------------------------------------
-- Drop the custom marketplace enum types.
-- ----------------------------------------------------------------------------
DROP TYPE IF EXISTS public.listing_order_status CASCADE;
DROP TYPE IF EXISTS public.delivery_option CASCADE;
DROP TYPE IF EXISTS public.listing_condition CASCADE;
DROP TYPE IF EXISTS public.listing_status CASCADE;
