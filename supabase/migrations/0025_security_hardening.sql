-- ============================================================================
-- Phase 25 — Security hardening: RLS, storage, and column-level protections.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Column-level guards on profiles / runner_profile so non-admins cannot
-- self-promote or tamper with computed/trusted columns.
-- ----------------------------------------------------------------------------

create or replace function profiles_protect_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;
  if new.id is distinct from old.id then
    raise exception 'Cannot change profile id';
  end if;
  if new.is_admin is distinct from old.is_admin then
    raise exception 'Only admins can change is_admin';
  end if;
  if new.verified is distinct from old.verified then
    raise exception 'Only admins can change verified';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_columns_trigger on public.profiles;
create trigger profiles_protect_columns_trigger
  before update on public.profiles
  for each row execute function public.profiles_protect_columns();



create or replace function runner_profile_protect_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception 'Cannot change runner_profile user_id';
  end if;
  if new.status is distinct from old.status then
    raise exception 'Only admins/service can change runner status';
  end if;
  if new.trust_score is distinct from old.trust_score then
    raise exception 'Only service can change trust_score';
  end if;
  if new.active_load is distinct from old.active_load then
    raise exception 'Only service can change active_load';
  end if;
  if new.verified is distinct from old.verified then
    raise exception 'Only admins can change verified';
  end if;
  return new;
end;
$$;

drop trigger if exists runner_profile_protect_columns_trigger on public.runner_profile;
create trigger runner_profile_protect_columns_trigger
  before update on public.runner_profile
  for each row execute function public.runner_profile_protect_columns();


-- A runner cannot be marked available while quarantined or suspended.
update public.runner_profile
set is_available = false
where status <> 'active' and is_available = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'runner_profile_available_when_active'
      AND conrelid = 'public.runner_profile'::regclass
  ) THEN
    ALTER TABLE public.runner_profile
      ADD CONSTRAINT runner_profile_available_when_active
        CHECK (not (is_available and status <> 'active'));
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- RLS: tighten overly permissive policies.
-- ----------------------------------------------------------------------------

-- Don't expose live runner locations to every signed-in user.
drop policy if exists runner_profile_select on public.runner_profile;
create policy runner_profile_select on public.runner_profile
  for select using (user_id = auth.uid() or public.is_admin());


-- Task writes are performed by trusted service-role code.
drop policy if exists tasks_buyer_insert on public.tasks;
create policy tasks_insert_admin on public.tasks
  for insert with check (public.is_admin());

drop policy if exists tasks_participant_update on public.tasks;
create policy tasks_update_admin on public.tasks
  for update using (public.is_admin());

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select using (
    buyer_id = auth.uid()
    or selected_runner_id = auth.uid()
    or public.is_admin()
  );


-- Proofs: only the assigned runner may upload.
drop policy if exists proofs_runner_insert on public.proofs;
create policy proofs_runner_insert on public.proofs
  for insert with check (
    runner_id = auth.uid()
    and exists (
      select 1 from public.tasks t
      where t.id = task_id
        and t.selected_runner_id = auth.uid()
        and t.status in ('accepted', 'in_progress')
    )
  );


-- Ratings: only the buyer of a delivered errand may rate, and ratee must match
-- the runner who completed it.
drop policy if exists ratings_select on public.ratings;
create policy ratings_select on public.ratings
  for select using (
    rater_id = auth.uid()
    or ratee_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists ratings_insert on public.ratings;
create policy ratings_insert on public.ratings
  for insert with check (
    rater_id = auth.uid()
    and exists (
      select 1 from public.tasks t
      where t.id = task_id
        and t.buyer_id = auth.uid()
        and t.status in ('completed', 'resolved')
        and t.selected_runner_id = ratee_id
    )
  );


-- Disputes: only a task participant may raise a dispute.
drop policy if exists disputes_insert on public.disputes;
create policy disputes_insert on public.disputes
  for insert with check (
    raised_by = auth.uid()
    and exists (
      select 1 from public.tasks t
      where t.id = task_id
        and (t.buyer_id = auth.uid() or t.selected_runner_id = auth.uid())
        and t.status = 'completed'
    )
  );


-- ----------------------------------------------------------------------------
-- Storage: let task buyers also fetch proof-of-delivery photos.
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'objects'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'proofs_select_own_or_admin'
    ) THEN
      DROP POLICY proofs_select_own_or_admin ON storage.objects;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'proofs_select_participants'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR SELECT USING (bucket_id = %L AND (auth.uid()::text = path_tokens[1] OR public.is_admin() OR EXISTS (SELECT 1 FROM public.proofs p JOIN public.tasks t ON t.id = p.task_id WHERE p.photo_path = name AND (t.buyer_id = auth.uid() OR t.selected_runner_id = auth.uid()))))',
        'proofs_select_participants',
        'proofs'
      );
    END IF;
  END IF;
END $$;
