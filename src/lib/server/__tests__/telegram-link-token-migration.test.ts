import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/0047_telegram_link_token_atomic.sql",
);

function migrationSql(): string {
  return readFileSync(migrationPath, "utf8").replace(/\s+/g, " ").toLowerCase();
}

describe("atomic Telegram link-token migration", () => {
  it("locks and consumes a valid token while linking its admin profile", () => {
    const sql = migrationSql();

    expect(sql).toContain("function public.link_telegram_from_token");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("for update of t, p");
    expect(sql).toContain("t.used_at is null");
    expect(sql).toContain("t.expires_at > now()");
    expect(sql).toContain("p.is_admin");
    expect(sql).toContain("is not distinct from p_telegram_user_id");
    expect(sql).toContain("update public.profiles");
    expect(sql).toContain("update public.telegram_link_tokens");
  });

  it("keeps the token table and atomic RPC private to the service role", () => {
    const sql = migrationSql();

    expect(sql).toContain("alter table public.telegram_link_tokens enable row level security");
    expect(sql).toContain("revoke all on table public.telegram_link_tokens from public, anon, authenticated");
    expect(sql).toContain("grant select, insert, update, delete on table public.telegram_link_tokens to service_role");
    expect(sql).toContain("revoke all on function public.link_telegram_from_token");
    expect(sql).toContain("grant execute on function public.link_telegram_from_token");
    expect(sql).toContain("to service_role");
  });
});
