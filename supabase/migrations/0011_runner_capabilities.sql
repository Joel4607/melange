-- ============================================================================
-- Phase 11 — Runner capabilities.
-- Lets runners opt into task categories and lets the matcher filter them.
-- ============================================================================

alter table runner_profile add column capabilities text[] not null default '{}';

-- GIN index is useful once the catalog grows and we query by capability.
create index runner_profile_capabilities_idx on runner_profile using gin (capabilities);
