import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/0045_matching_reliability.sql",
);

function migrationSql(): string {
  return readFileSync(migrationPath, "utf8").replace(/\s+/g, " ").toLowerCase();
}

describe("matching reliability migration", () => {
  it("stores match-run outcome, source, versions, configuration and candidate count", () => {
    const sql = migrationSql();
    expect(sql).toContain("add column outcome text");
    expect(sql).toContain("add column source text");
    expect(sql).toContain("add column algorithm_version text");
    expect(sql).toContain("add column config_version text");
    expect(sql).toContain("add column config jsonb");
    expect(sql).toContain("add column candidate_count integer");
    expect(sql).toContain("add column active_match_run_id uuid");
  });

  it("adds a protected outcome-event table for later production validation", () => {
    const sql = migrationSql();
    expect(sql).toContain("create table match_outcomes");
    expect(sql).toContain("alter table match_outcomes enable row level security");
    expect(sql).toContain("create policy match_outcomes_select");
  });

  it("finalizes one run while holding a task row lock", () => {
    const sql = migrationSql();
    expect(sql).toContain("function public.finalize_match_run");
    expect(sql).toContain("for update");
    expect(sql).toContain("v_task_status <> 'posted'");
    expect(sql).toContain("jsonb_array_length(p_candidates) = 0");
    expect(sql).toContain("outcome = 'no_candidates'");
    expect(sql).toContain("set status = 'matched'");
    expect(sql).toContain("function public.offer_next_match_candidate");
    expect(sql).toContain("function public.decline_and_offer_next_candidate");
    expect(sql).toContain("function public.cancel_task_with_refund");
    expect(sql).toContain("function public.fund_and_hold_task");
    expect(sql).toContain("insert into public.match_outcomes");
  });

  it("keeps finalization private to the service role", () => {
    const sql = migrationSql();
    expect(sql).toContain("revoke all on function public.finalize_match_run");
    expect(sql).toContain("grant execute on function public.finalize_match_run");
    expect(sql).toContain("to service_role");
  });

  it("backfills legacy run outcomes and active task links", () => {
    const sql = migrationSql();
    expect(sql).toContain("outcome = case");
    expect(sql).toContain("set active_match_run_id = (");
  });
});
