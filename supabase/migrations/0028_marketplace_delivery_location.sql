-- ============================================================================
-- Phase 28 — Capture delivery location for seller/runner delivery on marketplace
-- orders, plus optional delivery notes.
-- ============================================================================

ALTER TABLE listing_orders
  ADD COLUMN IF NOT EXISTS delivery_lat double precision,
  ADD COLUMN IF NOT EXISTS delivery_lng double precision,
  ADD COLUMN IF NOT EXISTS delivery_notes text;
