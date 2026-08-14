import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("migration auth shim", () => {
  it("creates the Supabase roles referenced by migrations", () => {
    const sql = readFileSync(resolve(process.cwd(), "scripts/auth-shim.sql"), "utf8");
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(sql).toContain(`create role ${role}`);
    }
  });
});
