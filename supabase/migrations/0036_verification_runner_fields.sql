-- ============================================================================
-- Phase 36 — Runner-only verification with richer identity data.
-- Adds the fields needed for a more thorough runner identity review and makes
-- the verification form/UI runner-only at the data layer (the app layer
-- enforces the buyer/runner check).
-- ============================================================================

alter table verification_requests
  add column if not exists legal_name text,
  add column if not exists date_of_birth date,
  add column if not exists ghana_card_number text,
  add column if not exists residential_address text,
  add column if not exists selfie_photo_path text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists next_of_kin_name text,
  add column if not exists next_of_kin_phone text;
