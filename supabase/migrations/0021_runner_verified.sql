-- Verification gating: mirror the runner's identity-verified status on runner_profile
-- so the matcher and runner UI can use it without an extra join.
alter table runner_profile add column if not exists verified boolean default false;

-- Backfill existing verified runners from profiles.verified.
update runner_profile
set verified = true
where user_id in (select id from profiles where verified = true);
