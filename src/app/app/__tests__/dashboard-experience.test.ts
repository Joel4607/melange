import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BuyerDashboard } from "../buyer-dashboard";
import { DashboardShell } from "../dashboard-shell";
import { RunnerDashboard } from "../runner-dashboard";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("dashboard experience", () => {
  it("puts the buyer's active errand action before supporting metrics", () => {
    const html = renderToStaticMarkup(
      createElement(BuyerDashboard, {
        errands: [
          {
            id: "errand-1",
            title: "Groceries from Osu Market",
            status: "in_progress",
            price: "72",
            category: "Shopping",
            created_at: "2026-08-31T09:20:00Z",
          },
        ],
        wallet: { balance: "86", held: "72" },
      }),
    );

    expect(html).toContain("Your errand is on the move");
    expect(html).toContain('href="/app/errands/errand-1"');
    expect(html.indexOf("Your errand is on the move")).toBeLessThan(
      html.indexOf("Active errands"),
    );
  });

  it("keeps the buyer's wallet actions inside the balance card", () => {
    const html = renderToStaticMarkup(
      createElement(BuyerDashboard, {
        errands: [],
        wallet: { balance: "86", held: "12" },
      }),
    );

    const balanceCard = labelledSection(html, "Wallet balance");
    expect(balanceCard).toContain("GHS 86.00");
    expect(balanceCard).toContain("GHS 12.00 in escrow");
    expect(balanceCard).toContain("Top up");
    expect(balanceCard).toContain(">Wallet<");
    expect(balanceCard.match(/href="\/app\/wallet"/g)).toHaveLength(2);
    expect(html).not.toContain("**** **** **** 4242");
  });

  it("prioritizes a new runner offer over an existing active job", () => {
    const html = renderToStaticMarkup(
      createElement(RunnerDashboard, {
        profile: { is_available: true, trust_score: 0.9, capabilities: ["Shopping"] },
        tasks: [
          {
            id: "active-1",
            title: "Package to Cantonments",
            status: "in_progress",
            price: "55",
            fee: "5",
            category: "Delivery",
          },
          {
            id: "offer-1",
            title: "Groceries from Osu Market",
            status: "matched",
            price: "65",
            fee: "7",
            category: "Shopping",
          },
        ],
        avgRating: 4.8,
        totalEarned: 284,
        completedCount: 6,
      }),
    );

    expect(html).toContain("New offer");
    expect(html).toContain("Groceries from Osu Market");
    expect(html).toContain('href="/app/errands/offer-1"');
    expect(html.indexOf("New offer")).toBeLessThan(html.indexOf("Total earned"));
    expect(html).not.toContain("**** **** **** 4242");
  });

  it("gives each role a persistent mobile navigation", () => {
    const buyerHtml = renderToStaticMarkup(
      createElement(
        DashboardShell,
        {
          user: { id: "buyer-1" },
          role: "buyer",
          firstName: "Ama",
          notifications: [],
        },
        createElement("div", null, "Buyer content"),
      ),
    );
    const runnerHtml = renderToStaticMarkup(
      createElement(
        DashboardShell,
        {
          user: { id: "runner-1" },
          role: "runner",
          firstName: "Kwame",
          notifications: [],
        },
        createElement("div", null, "Runner content"),
      ),
    );

    const buyerNav = mobileNav(buyerHtml);
    const runnerNav = mobileNav(runnerHtml);
    expect(buyerNav).toContain("Post");
    expect(buyerNav).toContain("Runners");
    expect(buyerNav).toContain("Wallet");
    expect(runnerNav).toContain("Find work");
    expect(runnerNav).toContain("Earnings");
    expect(runnerNav).toContain("Settings");
  });
});

function mobileNav(html: string) {
  const start = html.indexOf('<nav aria-label="Mobile navigation"');
  expect(start).toBeGreaterThanOrEqual(0);
  return html.slice(start, html.indexOf("</nav>", start));
}

function labelledSection(html: string, label: string) {
  const start = html.indexOf(`<section aria-label="${label}"`);
  expect(start).toBeGreaterThanOrEqual(0);
  return html.slice(start, html.indexOf("</section>", start) + "</section>".length);
}
