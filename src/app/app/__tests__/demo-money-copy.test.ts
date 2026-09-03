import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const monetarySources = [
  "src/app/app/errands/[id]/page.tsx",
  "src/app/app/buyer-dashboard.tsx",
  "src/app/app/runner-dashboard.tsx",
  "src/app/app/dashboard-widgets.tsx",
  "src/app/app/earnings/page.tsx",
  "src/app/app/settings/page.tsx",
  "src/app/app/feed/page.tsx",
  "src/app/admin/page.tsx",
  "src/lib/telegram/messaging.ts",
  "src/lib/telegram/webhook.ts",
  "src/app/app/dashboard-shell.tsx",
  "src/app/admin/audit/page.tsx",
  "src/app/app/post/post-form.tsx",
].map(source);

describe("SEC-011 demo-money copy", () => {
  it("removes obsolete real-payment language from monetary surfaces", () => {
    for (const content of monetarySources) {
      expect(content).not.toMatch(/\bTop up\b/);
      expect(content).not.toContain("Mobile money reference");
      expect(content).not.toContain("Mobile money ref");
    }
  });

  it("qualifies buyer and runner balances as demo credits", () => {
    const wallet = source("src/app/app/wallet/page.tsx");
    const tracking = monetarySources[0];
    const runnerDashboard = monetarySources[2];
    const earnings = monetarySources[4];

    expect(wallet).toContain("DEMO_MONEY_NOTICE");
    expect(tracking).toContain("Demo credits in escrow");
    expect(tracking).toContain("DEMO_MONEY_NOTICE");
    expect(runnerDashboard).toContain("Demo payout");
    expect(earnings).toContain("Demo earnings");
    expect(earnings).toContain("DEMO_MONEY_NOTICE");
  });

  it("labels admin and Telegram transaction summaries as simulated", () => {
    const admin = monetarySources[7];
    const telegramMessaging = monetarySources[8];
    const telegramWebhook = monetarySources[9];

    expect(admin).toContain("Demo transaction reference");
    expect(telegramMessaging).toContain("Demo runner payout");
    expect(telegramMessaging).toContain("Simulation only; no real funds are transferred.");
    expect(telegramWebhook).toContain("Demo runner payout");
    expect(telegramWebhook).toContain("Simulation only; no real funds are transferred.");
  });
});
