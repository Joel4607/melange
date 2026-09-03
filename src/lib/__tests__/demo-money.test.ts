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

  it("maps database failures to safe public demo-credit messages", async () => {
    const demoMoney = await loadDemoMoney() as {
      demoMoneyError?: (error: unknown) => string;
    };

    expect(demoMoney.demoMoneyError?.(
      new Error("demo_wallet_insufficient_credits"),
    )).toBe("You do not have enough demo credits for this transaction.");
    expect(demoMoney.demoMoneyError?.(
      new Error("postgres host secret detail"),
    )).toBe("The demo transaction could not be completed. Please try again.");
  });
});
