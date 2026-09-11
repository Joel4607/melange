import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  const file = resolve(process.cwd(), path);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

function actionBody(actions: string, name: string): string {
  const start = actions.indexOf(`export async function ${name}`);
  if (start < 0) return "";
  const next = actions.indexOf("export async function ", start + 1);
  return actions.slice(start, next < 0 ? actions.length : next);
}

describe("SEC-011 application money boundary", () => {
  it("does not accept a browser-supplied payment reference", () => {
    const actions = source("src/app/app/actions.ts");
    const postForm = source("src/app/app/post/post-form.tsx");

    expect(actions).not.toContain('formData.get("payment_reference")');
    expect(postForm).not.toContain('name="payment_reference"');
    expect(postForm).not.toContain("Mobile money reference");
  });

  it("keeps wallet credits labelled as a simulation", () => {
    const wallet = source("src/app/app/wallet/page.tsx");
    const dashboard = source("src/app/app/buyer-dashboard.tsx");

    expect(wallet).toContain("DEMO_MONEY_NOTICE");
    expect(dashboard).toContain("Demo wallet balance");
    expect(dashboard).toContain("View demo wallet");
  });

  it("rates, releases, and tips through one atomic database action", () => {
    const actions = source("src/app/app/actions.ts");
    const rating = actionBody(actions, "rateRunner");

    expect(rating).toContain("parseDemoTip(");
    expect(rating).toContain('.rpc("rate_and_tip"');
    expect(rating).not.toContain("releaseFunds(");
    expect(rating).toContain("DemoActionState");
  });

  it("creates direct requests and their holds through one RPC", () => {
    const actions = source("src/app/app/actions.ts");
    const create = actionBody(actions, "createErrand");

    expect(create).toContain('create_and_hold_direct_demo_errand');
    expect(create).not.toContain("await holdFunds(");
    expect(create).not.toContain('payment_reference:');
  });

  it("returns safe action states from ordinary and shared funding", () => {
    const actions = source("src/app/app/actions.ts");
    const ordinary = actionBody(actions, "payIntoEscrow");
    const shared = actionBody(actions, "confirmSharedEscrow");

    expect(actions).toContain("DemoActionState");
    expect(ordinary).toContain("demoMoneyError(");
    expect(ordinary).toContain("return { error: null }");
    expect(shared).toContain("demoMoneyError(");
    expect(shared).toContain("return { error: null }");
  });

  it("renders funding failures inline", () => {
    const fundingForm = source(
      "src/app/app/errands/[id]/funding-form.tsx",
    );
    const tracking = source("src/app/app/errands/[id]/page.tsx");
    const postForm = source("src/app/app/post/post-form.tsx");

    expect(fundingForm).toContain("useActionState");
    expect(fundingForm).toContain('role="alert"');
    expect(tracking).toContain("<FundingForm");
    expect(postForm).toContain("useActionState(createErrand");
    expect(postForm).toContain('role="alert"');
  });
});
