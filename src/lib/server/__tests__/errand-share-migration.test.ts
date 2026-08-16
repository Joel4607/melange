import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/0046_errand_share.sql",
);

function migrationSql(): string {
  return readFileSync(migrationPath, "utf8").replace(/\s+/g, " ").toLowerCase();
}

describe("Errand-Share migration", () => {
  it("adds constrained sharing state to tasks", () => {
    const sql = migrationSql();
    expect(sql).toContain("add column share_state text not null default 'ineligible'");
    expect(sql).toContain("'ineligible','waiting','paired','released'");
    expect(sql).toContain("add column share_window_ends_at timestamptz");
    expect(sql).toContain("add column share_released_at timestamptz");
    expect(sql).toContain("add column share_group_id uuid");
    expect(sql).toContain("add column delivery_deadline_at timestamptz");
    expect(sql).toContain("tasks_share_waiting_idx");
  });

  it("creates the group, member, decision, match-run, candidate and outcome tables", () => {
    const sql = migrationSql();
    for (const table of [
      "errand_share_groups",
      "errand_share_members",
      "errand_share_decisions",
      "errand_share_match_runs",
      "errand_share_match_candidates",
      "errand_share_match_outcomes",
    ]) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
    expect(sql).toContain("create constraint trigger errand_share_exactly_two_members");
    expect(sql).toContain("deferrable initially deferred");
    expect(sql).toContain(") <> 2");
    expect(sql).toContain("not jsonb_path_exists(ordered_route, '$[*].point')");
  });

  it("protects participant data through member-aware RLS", () => {
    const sql = migrationSql();
    expect(sql).toContain("create policy errand_share_groups_select");
    expect(sql).toContain("create policy errand_share_members_select");
    expect(sql).toContain("create policy errand_share_match_runs_select");
    expect(sql).toContain("create policy errand_share_match_candidates_select");
    expect(sql).toContain("create policy errand_share_match_outcomes_select");
    expect(sql).toContain("public.is_admin()");
    expect(sql).toContain("t.buyer_id = auth.uid()");
    expect(sql).toContain("g.selected_runner_id = auth.uid()");
    expect(sql).toContain(
      "where t.id = errand_share_members.task_id and t.buyer_id = auth.uid()",
    );
    expect(sql).toContain("revoke select on public.errand_share_groups from anon, authenticated");
    expect(sql).toContain("grant select ( id, status, algorithm_version");
    expect(sql).not.toContain("grant select ( ordered_route");
  });

  it("atomically creates a pair only after locking and rechecking both tasks", () => {
    const sql = migrationSql();
    expect(sql).toContain("function public.create_errand_share_group");
    expect(sql).toContain("order by t.id for update");
    expect(sql).toContain("v_task_count <> 2");
    expect(sql).toContain("count(distinct t.buyer_id)");
    expect(sql).toContain("t.status <> 'posted'");
    expect(sql).toContain("t.share_state <> 'waiting'");
    expect(sql).toContain("t.share_window_ends_at <= now()");
    expect(sql).toContain("set share_state = 'paired'");
  });

  it("defines atomic matching, funding and offer rotation for one group", () => {
    const sql = migrationSql();
    for (const fn of [
      "finalize_share_match_run",
      "confirm_share_funding",
      "offer_next_share_candidate",
      "decline_and_offer_next_share_candidate",
    ]) {
      expect(sql).toContain(`function public.${fn}`);
    }
    expect(sql).toContain("set status = 'matched'");
    expect(sql).toContain("set status = 'posted'");
    expect(sql).toContain("perform public.fund_and_hold_task");
    expect(sql).toContain("for update");
  });

  it("defines atomic acceptance, trip, completion, cancellation and expiry", () => {
    const sql = migrationSql();
    for (const fn of [
      "accept_share_offer",
      "start_share_group",
      "complete_share_member",
      "dissolve_share_group_for_cancellation",
      "cancel_share_group_by_runner",
      "expire_due_errand_share_groups",
      "claim_due_errand_share_tasks",
    ]) {
      expect(sql).toContain(`function public.${fn}`);
    }
    expect(sql).toContain("perform public.refund_funds");
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("share_state = 'released'");
  });

  it("keeps every mutation RPC private to the service role", () => {
    const sql = migrationSql();
    for (const fn of [
      "create_errand_share_group",
      "finalize_share_match_run",
      "confirm_share_funding",
      "offer_next_share_candidate",
      "decline_and_offer_next_share_candidate",
      "accept_share_offer",
      "start_share_group",
      "complete_share_member",
      "dissolve_share_group_for_cancellation",
      "cancel_share_group_by_runner",
      "expire_due_errand_share_groups",
      "claim_due_errand_share_tasks",
    ]) {
      expect(sql).toContain(`revoke all on function public.${fn}`);
      expect(sql).toContain(`grant execute on function public.${fn}`);
    }
    expect(sql).toContain("to service_role");
  });
});
