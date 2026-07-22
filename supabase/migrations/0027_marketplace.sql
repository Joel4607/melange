-- ============================================================================
-- Phase 27 — Peer-to-peer marketplace.
-- Lets verified users list items (including free giveaways), buyers purchase
-- through escrow, and sellers fulfil via pickup or seller delivery. Runner
-- delivery is reserved for Phase 2.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'listing_status') THEN
    CREATE TYPE listing_status AS ENUM ('active', 'sold', 'paused', 'suspended');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'listing_condition') THEN
    CREATE TYPE listing_condition AS ENUM ('new', 'used_like_new', 'used_good', 'used_fair');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_option') THEN
    CREATE TYPE delivery_option AS ENUM ('pickup', 'runner_delivery', 'seller_delivery');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'listing_order_status') THEN
    CREATE TYPE listing_order_status AS ENUM (
      'pending_payment',
      'paid',
      'ready_for_pickup',
      'in_delivery',
      'delivered',
      'completed',
      'disputed',
      'cancelled',
      'refunded'
    );
  END IF;
END $$;

-- Extend ledger entry types for marketplace movements.
DO $$
DECLARE
  v_type text;
  v_types text[] := ARRAY['market_hold', 'market_release', 'market_payout', 'market_delivery_payout', 'market_refund'];
BEGIN
  FOREACH v_type IN ARRAY v_types LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ledger_entry_type')
        AND enumlabel = v_type
    ) THEN
      EXECUTE format('ALTER TYPE ledger_entry_type ADD VALUE %L', v_type);
    END IF;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- Existing table changes (columns only; FKs added after new tables are created)
-- ----------------------------------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_seller boolean NOT NULL DEFAULT false;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS listing_order_id uuid;

ALTER TABLE ledger_entries
  ADD COLUMN IF NOT EXISTS listing_order_id uuid;

ALTER TABLE ratings
  ADD COLUMN IF NOT EXISTS listing_order_id uuid;

ALTER TABLE disputes
  ADD COLUMN IF NOT EXISTS listing_order_id uuid;

ALTER TABLE ratings
  ALTER COLUMN task_id DROP NOT NULL;

ALTER TABLE disputes
  ALTER COLUMN task_id DROP NOT NULL;

-- ----------------------------------------------------------------------------
-- New tables
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title             text NOT NULL,
  description       text,
  category          text NOT NULL,
  condition         listing_condition NOT NULL DEFAULT 'used_good',
  price             numeric(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  stock             integer NOT NULL DEFAULT 1 CHECK (stock >= 0),
  photos            text[] NOT NULL DEFAULT '{}',
  contact_info      text,
  location_lat      double precision NOT NULL,
  location_lng      double precision NOT NULL,
  delivery_options  delivery_option[] NOT NULL DEFAULT '{pickup}',
  seller_delivery_fee numeric(12, 2) NOT NULL DEFAULT 0 CHECK (seller_delivery_fee >= 0),
  status            listing_status NOT NULL DEFAULT 'active',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listings_status_category_idx ON listings (status, category, created_at DESC);
CREATE INDEX IF NOT EXISTS listings_seller_idx ON listings (seller_id, status);

CREATE TABLE IF NOT EXISTS listing_orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id        uuid NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  seller_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  buyer_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  price             numeric(12, 2) NOT NULL CHECK (price >= 0),
  delivery_fee      numeric(12, 2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  platform_fee      numeric(12, 2) NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),
  delivery_option   delivery_option NOT NULL,
  status            listing_order_status NOT NULL DEFAULT 'pending_payment',
  pickup_code       text,
  delivery_task_id  uuid REFERENCES tasks(id) ON DELETE SET NULL,
  buyer_confirmed_at timestamptz,
  seller_rated      boolean NOT NULL DEFAULT false,
  buyer_rated       boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listing_orders_buyer_idx ON listing_orders (buyer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS listing_orders_seller_idx ON listing_orders (seller_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS listing_orders_listing_idx ON listing_orders (listing_id, status);
CREATE INDEX IF NOT EXISTS listing_orders_task_idx ON listing_orders (delivery_task_id);

CREATE TABLE IF NOT EXISTS listing_order_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_order_id  uuid NOT NULL REFERENCES listing_orders(id) ON DELETE CASCADE,
  actor_id          uuid REFERENCES profiles(id) ON DELETE SET NULL,
  event_type        text NOT NULL,
  payload           jsonb NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listing_order_events_order_idx ON listing_order_events (listing_order_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- Add foreign keys now that listing_orders exists
-- ----------------------------------------------------------------------------
ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_listing_order_id_fkey,
  ADD CONSTRAINT tasks_listing_order_id_fkey
    FOREIGN KEY (listing_order_id) REFERENCES listing_orders(id) ON DELETE SET NULL;

ALTER TABLE ledger_entries
  DROP CONSTRAINT IF EXISTS ledger_entries_listing_order_id_fkey,
  ADD CONSTRAINT ledger_entries_listing_order_id_fkey
    FOREIGN KEY (listing_order_id) REFERENCES listing_orders(id) ON DELETE SET NULL;

ALTER TABLE ratings
  DROP CONSTRAINT IF EXISTS ratings_listing_order_id_fkey,
  ADD CONSTRAINT ratings_listing_order_id_fkey
    FOREIGN KEY (listing_order_id) REFERENCES listing_orders(id) ON DELETE CASCADE;

ALTER TABLE disputes
  DROP CONSTRAINT IF EXISTS disputes_listing_order_id_fkey,
  ADD CONSTRAINT disputes_listing_order_id_fkey
    FOREIGN KEY (listing_order_id) REFERENCES listing_orders(id) ON DELETE CASCADE;

-- ----------------------------------------------------------------------------
-- Check + uniqueness constraints
-- ----------------------------------------------------------------------------
ALTER TABLE ratings
  DROP CONSTRAINT IF EXISTS ratings_subject_check,
  ADD CONSTRAINT ratings_subject_check
    CHECK (task_id IS NOT NULL OR listing_order_id IS NOT NULL);

ALTER TABLE disputes
  DROP CONSTRAINT IF EXISTS disputes_subject_check,
  ADD CONSTRAINT disputes_subject_check
    CHECK (task_id IS NOT NULL OR listing_order_id IS NOT NULL);

ALTER TABLE ratings
  DROP CONSTRAINT IF EXISTS ratings_task_rater_unique;
CREATE UNIQUE INDEX IF NOT EXISTS ratings_task_rater_unique_idx
  ON ratings (task_id, rater_id) WHERE task_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ratings_order_rater_unique_idx
  ON ratings (listing_order_id, rater_id) WHERE listing_order_id IS NOT NULL;

ALTER TABLE disputes
  DROP CONSTRAINT IF EXISTS disputes_task_unique;
CREATE UNIQUE INDEX IF NOT EXISTS disputes_subject_unique_idx
  ON disputes (COALESCE(task_id, listing_order_id))
  WHERE task_id IS NOT NULL OR listing_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ledger_entries_listing_order_type_unique
  ON ledger_entries (listing_order_id, type)
  WHERE listing_order_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Escrow functions for marketplace orders
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.market_hold_funds(p_listing_order_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_buyer_id uuid;
  v_total numeric(12, 2);
BEGIN
  SELECT buyer_id, price + delivery_fee
  INTO v_buyer_id, v_total
  FROM listing_orders
  WHERE id = p_listing_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'marketplace: order % not found', p_listing_order_id;
  END IF;

  IF v_total = 0 THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM ledger_entries
    WHERE listing_order_id = p_listing_order_id AND type = 'market_hold'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO wallets (user_id, balance, held)
  VALUES (v_buyer_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE wallets
  SET balance = balance - v_total, held = held + v_total
  WHERE user_id = v_buyer_id AND balance >= v_total;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'marketplace: buyer % has insufficient funds', v_buyer_id;
  END IF;

  INSERT INTO ledger_entries (listing_order_id, user_id, type, amount)
  VALUES (p_listing_order_id, v_buyer_id, 'market_hold', v_total);
END;
$$;

CREATE OR REPLACE FUNCTION public.market_release_funds(p_listing_order_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_buyer_id uuid;
  v_seller_id uuid;
  v_price numeric(12, 2);
  v_delivery_fee numeric(12, 2);
  v_platform_fee numeric(12, 2);
  v_total numeric(12, 2);
  v_seller_payout numeric(12, 2);
  v_delivery_option delivery_option;
BEGIN
  SELECT buyer_id, seller_id, price, delivery_fee, platform_fee, delivery_option
  INTO v_buyer_id, v_seller_id, v_price, v_delivery_fee, v_platform_fee, v_delivery_option
  FROM listing_orders
  WHERE id = p_listing_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'marketplace: order % not found', p_listing_order_id;
  END IF;

  v_total := v_price + v_delivery_fee;

  IF v_total > 0 AND NOT EXISTS (
    SELECT 1 FROM ledger_entries
    WHERE listing_order_id = p_listing_order_id AND type = 'market_hold'
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM ledger_entries
    WHERE listing_order_id = p_listing_order_id
      AND type IN ('market_release', 'market_payout', 'market_refund')
  ) THEN
    RETURN;
  END IF;

  v_seller_payout := v_price - v_platform_fee;
  IF v_delivery_option = 'seller_delivery' THEN
    v_seller_payout := v_seller_payout + v_delivery_fee;
  END IF;

  INSERT INTO wallets (user_id, balance, held)
  VALUES (v_buyer_id, 0, 0), (v_seller_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  IF v_total > 0 THEN
    UPDATE wallets
    SET held = held - v_total
    WHERE user_id = v_buyer_id AND held >= v_total;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'marketplace: buyer % has insufficient held funds', v_buyer_id;
    END IF;

    INSERT INTO ledger_entries (listing_order_id, user_id, type, amount)
    VALUES (p_listing_order_id, v_buyer_id, 'market_release', -v_total);
  END IF;

  IF v_seller_payout > 0 THEN
    UPDATE wallets
    SET balance = balance + v_seller_payout
    WHERE user_id = v_seller_id;

    INSERT INTO ledger_entries (listing_order_id, user_id, type, amount)
    VALUES (p_listing_order_id, v_seller_id, 'market_payout', v_seller_payout);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.market_refund_funds(p_listing_order_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_buyer_id uuid;
  v_total numeric(12, 2);
BEGIN
  SELECT buyer_id, price + delivery_fee
  INTO v_buyer_id, v_total
  FROM listing_orders
  WHERE id = p_listing_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'marketplace: order % not found', p_listing_order_id;
  END IF;

  IF v_total = 0 THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM ledger_entries
    WHERE listing_order_id = p_listing_order_id AND type = 'market_hold'
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM ledger_entries
    WHERE listing_order_id = p_listing_order_id AND type = 'market_refund'
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM ledger_entries
    WHERE listing_order_id = p_listing_order_id
      AND type IN ('market_release', 'market_payout')
  ) THEN
    RAISE EXCEPTION 'marketplace: order % has already been released', p_listing_order_id;
  END IF;

  INSERT INTO wallets (user_id, balance, held)
  VALUES (v_buyer_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE wallets
  SET balance = balance + v_total, held = held - v_total
  WHERE user_id = v_buyer_id AND held >= v_total;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'marketplace: buyer % has insufficient held funds', v_buyer_id;
  END IF;

  INSERT INTO ledger_entries (listing_order_id, user_id, type, amount)
  VALUES (p_listing_order_id, v_buyer_id, 'market_refund', v_total);
END;
$$;

-- ----------------------------------------------------------------------------
-- Storage bucket + policies
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'buckets'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'marketplace') THEN
      INSERT INTO storage.buckets (id, name, public)
      VALUES ('marketplace', 'marketplace', false);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'objects'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'marketplace_select_auth'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR SELECT USING (bucket_id = %L AND auth.uid() IS NOT NULL)',
        'marketplace_select_auth',
        'marketplace'
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'marketplace_select_admin'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR SELECT USING (bucket_id = %L AND public.is_admin())',
        'marketplace_select_admin',
        'marketplace'
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'marketplace_insert_own'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR INSERT WITH CHECK (bucket_id = %L AND auth.uid()::text = path_tokens[1])',
        'marketplace_insert_own',
        'marketplace'
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'marketplace_delete_own_or_admin'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR DELETE USING (bucket_id = %L AND (auth.uid()::text = path_tokens[1] OR public.is_admin()))',
        'marketplace_delete_own_or_admin',
        'marketplace'
      );
    END IF;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- RLS for new tables
-- ----------------------------------------------------------------------------
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_order_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS listings_select_active ON listings;
CREATE POLICY listings_select_active ON listings
  FOR SELECT USING (status = 'active' OR seller_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS listings_insert_own ON listings;
CREATE POLICY listings_insert_own ON listings
  FOR INSERT WITH CHECK (seller_id = auth.uid());

DROP POLICY IF EXISTS listings_update_own_or_admin ON listings;
CREATE POLICY listings_update_own_or_admin ON listings
  FOR UPDATE USING (seller_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS listings_delete_own_or_admin ON listings;
CREATE POLICY listings_delete_own_or_admin ON listings
  FOR DELETE USING (seller_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS listing_orders_select_participants ON listing_orders;
CREATE POLICY listing_orders_select_participants ON listing_orders
  FOR SELECT USING (buyer_id = auth.uid() OR seller_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS listing_orders_insert_buyer ON listing_orders;
CREATE POLICY listing_orders_insert_buyer ON listing_orders
  FOR INSERT WITH CHECK (buyer_id = auth.uid());

DROP POLICY IF EXISTS listing_orders_update_participants ON listing_orders;
CREATE POLICY listing_orders_update_participants ON listing_orders
  FOR UPDATE USING (buyer_id = auth.uid() OR seller_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS listing_order_events_select_participants ON listing_order_events;
CREATE POLICY listing_order_events_select_participants ON listing_order_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM listing_orders o
      WHERE o.id = listing_order_events.listing_order_id
        AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS listing_order_events_insert_participants ON listing_order_events;
CREATE POLICY listing_order_events_insert_participants ON listing_order_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM listing_orders o
      WHERE o.id = listing_order_events.listing_order_id
        AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid() OR public.is_admin())
    )
  );

-- ----------------------------------------------------------------------------
-- Realtime
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime FOR TABLE listings, listing_orders, listing_order_events;
  ELSE
    ALTER PUBLICATION supabase_realtime ADD TABLE listings, listing_orders, listing_order_events;
  END IF;
END $$;

ALTER TABLE listings REPLICA IDENTITY FULL;
ALTER TABLE listing_orders REPLICA IDENTITY FULL;
ALTER TABLE listing_order_events REPLICA IDENTITY FULL;
