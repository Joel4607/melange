-- ============================================================================
-- Phase 29 — Marketplace runner delivery escrow.
-- Runner-delivery orders hold only the item price in the marketplace escrow;
-- the runner's delivery fee is held and released by the existing task escrow.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.market_hold_funds(p_listing_order_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_buyer_id uuid;
  v_price numeric(12, 2);
  v_delivery_fee numeric(12, 2);
  v_hold_amount numeric(12, 2);
  v_delivery_option delivery_option;
BEGIN
  SELECT buyer_id, price, delivery_fee, delivery_option
  INTO v_buyer_id, v_price, v_delivery_fee, v_delivery_option
  FROM listing_orders
  WHERE id = p_listing_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'marketplace: order % not found', p_listing_order_id;
  END IF;

  -- Runner delivery uses the existing task escrow for the delivery fee.
  IF v_delivery_option = 'runner_delivery' THEN
    v_hold_amount := v_price;
  ELSE
    v_hold_amount := v_price + v_delivery_fee;
  END IF;

  IF v_hold_amount = 0 THEN
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
  SET balance = balance - v_hold_amount, held = held + v_hold_amount
  WHERE user_id = v_buyer_id AND balance >= v_hold_amount;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'marketplace: buyer % has insufficient funds', v_buyer_id;
  END IF;

  INSERT INTO ledger_entries (listing_order_id, user_id, type, amount)
  VALUES (p_listing_order_id, v_buyer_id, 'market_hold', v_hold_amount);
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
  v_release_amount numeric(12, 2);
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

  v_release_amount := v_price;
  IF v_delivery_option <> 'runner_delivery' THEN
    v_release_amount := v_release_amount + v_delivery_fee;
  END IF;

  IF v_release_amount > 0 AND NOT EXISTS (
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
  v_seller_payout := GREATEST(v_seller_payout, 0);

  INSERT INTO wallets (user_id, balance, held)
  VALUES (v_buyer_id, 0, 0), (v_seller_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  IF v_release_amount > 0 THEN
    UPDATE wallets
    SET held = held - v_release_amount
    WHERE user_id = v_buyer_id AND held >= v_release_amount;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'marketplace: buyer % has insufficient held funds', v_buyer_id;
    END IF;

    INSERT INTO ledger_entries (listing_order_id, user_id, type, amount)
    VALUES (p_listing_order_id, v_buyer_id, 'market_release', -v_release_amount);
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
  v_price numeric(12, 2);
  v_delivery_fee numeric(12, 2);
  v_refund_amount numeric(12, 2);
  v_delivery_option delivery_option;
BEGIN
  SELECT buyer_id, price, delivery_fee, delivery_option
  INTO v_buyer_id, v_price, v_delivery_fee, v_delivery_option
  FROM listing_orders
  WHERE id = p_listing_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'marketplace: order % not found', p_listing_order_id;
  END IF;

  IF v_delivery_option = 'runner_delivery' THEN
    v_refund_amount := v_price;
  ELSE
    v_refund_amount := v_price + v_delivery_fee;
  END IF;

  IF v_refund_amount = 0 THEN
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

  INSERT INTO wallets (user_id, balance, held)
  VALUES (v_buyer_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE wallets
  SET balance = balance + v_refund_amount, held = held - v_refund_amount
  WHERE user_id = v_buyer_id AND held >= v_refund_amount;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'marketplace: buyer % has insufficient held funds', v_buyer_id;
  END IF;

  INSERT INTO ledger_entries (listing_order_id, user_id, type, amount)
  VALUES (p_listing_order_id, v_buyer_id, 'market_refund', v_refund_amount);
END;
$$;
