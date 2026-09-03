import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

async function loadDemoMoney() {
  const modulePath = resolve(process.cwd(), "src/lib/demo-money.ts");
  if (!existsSync(modulePath)) return {};
  return import(/* @vite-ignore */ pathToFileURL(modulePath).href);
}

describe("demo money", () => {
  it("formats values as demo currency and states that they are not real funds", async () => {
    const demoMoney = await loadDemoMoney();

    expect(demoMoney).toMatchObject({
      DEMO_CREDIT_ALLOCATION: 1000,
      DEMO_CURRENCY_LABEL: "Demo GHS",
    });
    expect(
      (demoMoney as { DEMO_MONEY_NOTICE?: string }).DEMO_MONEY_NOTICE,
    ).toContain("no real funds");
    expect(
      (
        demoMoney as {
          formatDemoMoney?: (amount: number | string) => string;
        }
      ).formatDemoMoney?.("5"),
    ).toBe("Demo GHS 5.00");
  });
});
