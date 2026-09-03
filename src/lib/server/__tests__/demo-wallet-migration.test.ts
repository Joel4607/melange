import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/0049_demo_wallet_safety.sql",
);
const sql = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8").replace(/\s+/g, " ").toLowerCase()
  : "";

describe("SEC-011 demo wallet migration", () => {
  it("provisions one fixed allocation and removes arbitrary top-ups", () => {
    expect(sql).toContain("1000.00");
    expect(sql).toContain("function public.provision_demo_wallet_for_profile");
    expect(sql).toContain("create trigger profiles_provision_demo_wallet");
    expect(sql).toContain("ledger_demo_initial_credit_unique");
    expect(sql).toContain(
      "drop function if exists public.top_up_wallet(uuid, bigint)",
    );
  });

  it("never manufactures a matching shortfall", () => {
    const fundingStart = sql.indexOf(
      "create or replace function public.fund_and_hold_task",
    );
    const fundingEnd = sql.indexOf("create or replace function", fundingStart + 1);
    const funding = sql.slice(
      fundingStart,
      fundingEnd < 0 ? sql.length : fundingEnd,
    );

    expect(funding).toContain("demo_wallet_insufficient_credits");
    expect(funding).toContain("perform public.hold_funds(p_task_id)");
    expect(funding).not.toContain("v_shortfall");
    expect(funding).not.toContain("set balance = balance +");
  });

  it("creates direct errands and their holds in one transaction", () => {
    expect(sql).toContain(
      "function public.create_and_hold_direct_demo_errand",
    );
    expect(sql).toContain("perform public.hold_funds(v_task_id)");
    expect(sql).toContain(
      "grant execute on function public.create_and_hold_direct_demo_errand",
    );
  });

  it("makes release, rating, and tip one database transaction", () => {
    const ratingStart = sql.indexOf(
      "create or replace function public.rate_and_tip",
    );
    const rating = sql.slice(ratingStart);

    expect(rating).toContain("perform public.release_funds(p_task_id)");
    expect(rating).toContain("demo_wallet_insufficient_credits");
    expect(rating).toContain(
      "grant execute on function public.rate_and_tip",
    );
  });

  it("keeps every new mutation RPC private to the service role", () => {
    for (const signature of [
      "public.provision_demo_wallet_for_profile()",
      "public.fund_and_hold_task(uuid)",
      "public.create_and_hold_direct_demo_errand",
      "public.rate_and_tip",
    ]) {
      expect(sql).toContain(`revoke all on function ${signature}`);
    }
    expect(sql).toContain("to service_role");
  });
});
