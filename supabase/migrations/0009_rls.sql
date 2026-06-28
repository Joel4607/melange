-- ============================================================================
-- Phase 7 — Row-Level Security.
-- Authorization lives at the database layer, not just the UI. Runs last, once
-- every table exists, so a single policy file can reference them all.
--
-- The service_role key bypasses RLS, so privileged server code (escrow writes,
-- match snapshots, fraud flags) works without needing explicit write policies.
-- ============================================================================

-- Helper: is the current user an admin? security definer so it can read the
-- is_admin column without the caller needing select rights on every row.
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

alter table profiles          enable row level security;
alter table runner_profile    enable row level security;
alter table tasks             enable row level security;
alter table match_runs        enable row level security;
alter table match_candidates  enable row level security;
alter table proofs            enable row level security;
alter table ratings           enable row level security;
alter table trust_events      enable row level security;
alter table fraud_flags       enable row level security;
alter table disputes          enable row level security;
alter table wallets           enable row level security;
alter table ledger_entries    enable row level security;
alter table notifications     enable row level security;

-- ----------------------------------------------------------------------------
-- profiles: a user reads/updates their own; admins read all.
-- ----------------------------------------------------------------------------
create policy profiles_self_select on profiles
  for select using (id = auth.uid() or is_admin());
create policy profiles_self_update on profiles
  for update using (id = auth.uid());
create policy profiles_self_insert on profiles
  for insert with check (id = auth.uid());

-- ----------------------------------------------------------------------------
-- runner_profile: availability is public-readable (needed to be matched); a
-- user manages only their own row; admins manage all.
-- ----------------------------------------------------------------------------
create policy runner_profile_select on runner_profile
  for select using (true);
create policy runner_profile_self_insert on runner_profile
  for insert with check (user_id = auth.uid());
create policy runner_profile_self_update on runner_profile
  for update using (user_id = auth.uid() or is_admin());

-- ----------------------------------------------------------------------------
-- tasks: buyer sees own; runner sees open (posted) tasks + ones assigned to
-- them; admins see all.
-- ----------------------------------------------------------------------------
create policy tasks_select on tasks
  for select using (
    buyer_id = auth.uid()
    or selected_runner_id = auth.uid()
    or status = 'posted'
    or is_admin()
  );
create policy tasks_buyer_insert on tasks
  for insert with check (buyer_id = auth.uid());
create policy tasks_participant_update on tasks
  for update using (
    buyer_id = auth.uid() or selected_runner_id = auth.uid() or is_admin()
  );

-- ----------------------------------------------------------------------------
-- match snapshots: visible to the task's buyer + admins.
-- ----------------------------------------------------------------------------
create policy match_runs_select on match_runs
  for select using (
    is_admin()
    or exists (
      select 1 from tasks t
      where t.id = match_runs.task_id and t.buyer_id = auth.uid()
    )
  );
create policy match_candidates_select on match_candidates
  for select using (
    is_admin()
    or exists (
      select 1 from match_runs mr
      join tasks t on t.id = mr.task_id
      where mr.id = match_candidates.match_run_id and t.buyer_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- proofs / ratings: task participants + admins.
-- ----------------------------------------------------------------------------
create policy proofs_select on proofs
  for select using (
    runner_id = auth.uid()
    or is_admin()
    or exists (select 1 from tasks t where t.id = proofs.task_id and t.buyer_id = auth.uid())
  );
create policy proofs_runner_insert on proofs
  for insert with check (runner_id = auth.uid());

create policy ratings_select on ratings
  for select using (true);
create policy ratings_insert on ratings
  for insert with check (rater_id = auth.uid());

-- ----------------------------------------------------------------------------
-- trust_events / fraud_flags: a runner may read their own; admins read+write.
-- (Writes otherwise go through service-role server code.)
-- ----------------------------------------------------------------------------
create policy trust_events_select on trust_events
  for select using (runner_id = auth.uid() or is_admin());

create policy fraud_flags_select on fraud_flags
  for select using (runner_id = auth.uid() or is_admin());
create policy fraud_flags_admin_update on fraud_flags
  for update using (is_admin());

-- ----------------------------------------------------------------------------
-- disputes: participants + raiser read; raiser inserts; admins resolve.
-- ----------------------------------------------------------------------------
create policy disputes_select on disputes
  for select using (
    raised_by = auth.uid()
    or is_admin()
    or exists (
      select 1 from tasks t
      where t.id = disputes.task_id
        and (t.buyer_id = auth.uid() or t.selected_runner_id = auth.uid())
    )
  );
create policy disputes_insert on disputes
  for insert with check (raised_by = auth.uid());
create policy disputes_admin_update on disputes
  for update using (is_admin());

-- ----------------------------------------------------------------------------
-- wallets / ledger: a user reads their own; admins read all.
-- Writes are service-role only (no insert/update policy = clients cannot write).
-- ----------------------------------------------------------------------------
create policy wallets_select on wallets
  for select using (user_id = auth.uid() or is_admin());
create policy ledger_select on ledger_entries
  for select using (user_id = auth.uid() or is_admin());

-- ----------------------------------------------------------------------------
-- notifications: a user reads/updates their own.
-- ----------------------------------------------------------------------------
create policy notifications_select on notifications
  for select using (recipient_id = auth.uid());
create policy notifications_update on notifications
  for update using (recipient_id = auth.uid());
