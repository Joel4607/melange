-- ============================================================================
-- Phase 37 — Optional vehicle/bike license upload for runner verification.
-- ============================================================================

alter table verification_requests
  add column if not exists vehicle_license_photo_path text;
