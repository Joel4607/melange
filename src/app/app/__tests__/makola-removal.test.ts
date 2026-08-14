import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const removedPaths = [
  "src/app/app/market/page.tsx",
  "src/app/api/market/price/route.ts",
  "src/app/api/market/route/route.ts",
  "src/lib/algorithm/market-price.ts",
  "src/lib/algorithm/market-routing.ts",
  "src/lib/algorithm/__tests__/market-price.test.ts",
  "src/lib/algorithm/__tests__/market-routing.test.ts",
  "src/lib/algorithm/data/market-price-history.json",
  "src/lib/algorithm/data/madina-market-zones.json",
  "scripts/market-seed.ts",
] as const;

describe("Makola-Matrix removal", () => {
  it.each(removedPaths)("removes %s", (path) => {
    expect(existsSync(resolve(process.cwd(), path))).toBe(false);
  });

  it("removes navigation and algorithm exports", () => {
    const dashboard = readFileSync(
      resolve(process.cwd(), "src/app/app/dashboard-shell.tsx"),
      "utf8",
    );
    const algorithmIndex = readFileSync(
      resolve(process.cwd(), "src/lib/algorithm/index.ts"),
      "utf8",
    );

    expect(dashboard).not.toContain("/app/market");
    expect(dashboard).not.toContain("Makola-Matrix");
    expect(algorithmIndex).not.toContain("./market-price");
    expect(algorithmIndex).not.toContain("./market-routing");
  });
});
