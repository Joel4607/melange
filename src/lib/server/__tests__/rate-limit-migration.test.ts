import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/0048_rate_limit_fallback.sql",
);

function migrationSql(): string {
  return readFileSync(migrationPath, "utf8").replace(/\s+/g, " ").toLowerCase();
}

describe("durable rate-limit fallback migration", () => {
  it("atomically creates, increments, caps, and resets each counter", () => {
    const sql = migrationSql();

    expect(sql).toContain("create table public.rate_limit_counters");
    expect(sql).toContain("function public.consume_rate_limit");
    expect(sql).toContain("insert into public.rate_limit_counters");
    expect(sql).toContain("on conflict (counter_key) do update");
    expect(sql).toContain("least(public.rate_limit_counters.hit_count + 1, p_limit + 1)");
    expect(sql).toContain("public.rate_limit_counters.expires_at <= v_now");
    expect(sql).toContain("floor(extract(epoch from v_now) / p_window_seconds)");
    expect(sql).toContain("return v_count <= p_limit");
  });

  it("keeps the fallback table and function private to the service role", () => {
    const sql = migrationSql();

    expect(sql).toContain("alter table public.rate_limit_counters enable row level security");
    expect(sql).toContain("revoke all on table public.rate_limit_counters from public, anon, authenticated");
    expect(sql).toContain("grant select, insert, update, delete on table public.rate_limit_counters to service_role");
    expect(sql).toContain("security definer set search_path = ''");
    expect(sql).toContain("revoke all on function public.consume_rate_limit");
    expect(sql).toContain("grant execute on function public.consume_rate_limit");
  });

  it("prunes old expired identities in bounded, contention-safe batches", () => {
    const sql = migrationSql();

    expect(sql).toContain("where expires_at < v_now - interval '1 hour'");
    expect(sql).toContain("for update skip locked limit 100");
    expect(sql).toContain("delete from public.rate_limit_counters counters");
  });
});
