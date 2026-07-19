-- ============================================================================
-- Phase 23 — Deeper audit hardening: unique constraints to make ratings,
-- disputes, and fraud_flags insertions race-safe.
-- ============================================================================

-- Remove duplicate ratings (keep the earliest one per task/rater) before
-- adding the unique constraint.
delete from ratings a
using (
  select task_id, rater_id, min(id::text) as keep_id
  from ratings
  group by task_id, rater_id
  having count(*) > 1
) b
where a.task_id = b.task_id
  and a.rater_id = b.rater_id
  and a.id::text <> b.keep_id;

-- One rating per buyer per errand.
alter table ratings add constraint ratings_task_rater_unique
  unique (task_id, rater_id);

-- Remove duplicate disputes (keep the earliest one per task) before adding the
-- unique constraint.
delete from disputes a
using (
  select task_id, min(id::text) as keep_id
  from disputes
  group by task_id
  having count(*) > 1
) b
where a.task_id = b.task_id
  and a.id::text <> b.keep_id;

-- One dispute per errand.
alter table disputes add constraint disputes_task_unique
  unique (task_id);

-- Remove duplicate fraud flags (keep the earliest one per runner/task/rule)
-- before adding the unique constraint.
delete from fraud_flags a
using (
  select runner_id, task_id, rule_type, min(id::text) as keep_id
  from fraud_flags
  group by runner_id, task_id, rule_type
  having count(*) > 1
) b
where a.runner_id = b.runner_id
  and a.task_id = b.task_id
  and a.rule_type = b.rule_type
  and a.id::text <> b.keep_id;

-- One fraud flag per runner/task/rule. task_id is nullable, so the unique
-- index only applies where task_id is set (matching the persistence calls).
alter table fraud_flags add constraint fraud_flags_runner_task_rule_unique
  unique (runner_id, task_id, rule_type);
