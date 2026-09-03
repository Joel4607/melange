import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("SEC-011 application money boundary", () => {
  it("does not expose an application top-up path", () => {
    const actions = source("src/app/app/actions.ts");
    const escrow = source("src/lib/server/escrow.ts");
    const wallet = source("src/app/app/wallet/page.tsx");
    const dashboard = source("src/app/app/buyer-dashboard.tsx");

    expect(actions).not.toContain("export async function topUpWallet");
    expect(escrow).not.toContain("export async function topUp(");
    expect(wallet).not.toContain("TopUpForm");
    expect(dashboard).not.toContain("Top up");
  });

  it("does not accept a browser-supplied payment reference", () => {
    const actions = source("src/app/app/actions.ts");
    const postForm = source("src/app/app/post/post-form.tsx");

    expect(actions).not.toContain('formData.get("payment_reference")');
    expect(postForm).not.toContain('name="payment_reference"');
    expect(postForm).not.toContain("Mobile money reference");
  });

  it("shows the fixed allocation as a read-only simulation", () => {
    const wallet = source("src/app/app/wallet/page.tsx");
    const dashboard = source("src/app/app/buyer-dashboard.tsx");

    expect(wallet).toContain("Initial demo credits");
    expect(wallet).toContain("DEMO_MONEY_NOTICE");
    expect(dashboard).toContain("Demo wallet balance");
    expect(dashboard).toContain("View demo wallet");
  });
});
