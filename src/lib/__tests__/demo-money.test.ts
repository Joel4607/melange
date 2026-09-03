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

  it.each([
    [null, 0],
    ["", 0],
    ["0", 0],
    ["5", 500],
    ["10.25", 1025],
    ["1000.00", 100000],
  ])("parses %p as %i pesewas", async (raw, expected) => {
    const demoMoney = await loadDemoMoney() as {
      parseDemoTip?: (value: FormDataEntryValue | null) => number;
    };

    expect(demoMoney.parseDemoTip?.(raw)).toBe(expected);
  });

  it.each(["-1", "1.001", "1000.01", "Infinity", "not-money"])(
    "rejects invalid demo tip %s",
    async (raw) => {
      const demoMoney = await loadDemoMoney() as {
        parseDemoTip?: (value: FormDataEntryValue | null) => number;
      };

      expect(() => demoMoney.parseDemoTip?.(raw)).toThrow(
        "Enter a demo tip from GHS 0 to GHS 1,000 with no more than two decimal places.",
      );
    },
  );
});
