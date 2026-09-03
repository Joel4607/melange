import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const feed = readFileSync(resolve(process.cwd(), "src/app/app/feed/page.tsx"), "utf8");
const tracking = readFileSync(
  resolve(process.cwd(), "src/app/app/errands/[id]/page.tsx"),
  "utf8",
);

describe("Errand-Share UI contracts", () => {
  it("shows each posted group once and excludes its child tasks", () => {
    expect(feed).toContain('.is("share_group_id", null)');
    expect(feed).toContain('.from("errand_share_groups")');
    expect(feed).toContain('.eq("status", "posted")');
    expect(feed).toContain("claimSharedGroup.bind(null, opportunity.id)");
    expect(feed).toContain("2 errands");
    expect(feed).toContain("4 ordered stops");
    expect(feed).toContain("Combined payout GHS");
    expect(feed).toContain("Stricter deadline");
  });

  it("keeps pre-assignment shared feed projections private", () => {
    const groupSection = feed.slice(feed.indexOf('.from("errand_share_groups")'));
    expect(groupSection).not.toContain("description");
    expect(groupSection).not.toContain("payment_reference");
    expect(groupSection).not.toContain("dropoff_lat");
    expect(groupSection).not.toContain('.from("messages")');
    expect(groupSection).not.toContain('.from("profiles")');
  });

  it("renders the buyer sharing states and funding/rematch actions", () => {
    expect(tracking).toContain("share_state");
    expect(tracking).toContain("share_window_ends_at");
    expect(tracking).toContain('.from("errand_share_groups")');
    expect(tracking).toContain("Looking for a shared trip");
    expect(tracking).toContain("Paired");
    expect(tracking).toContain("Waiting for both payments");
    expect(tracking).toContain("Continuing alone");
    expect(tracking).toContain("<FundingForm");
    expect(tracking).toContain("confirmSharedEscrow.bind(");
    expect(tracking).toContain("rematchSharedGroup.bind(");
  });

  it("shows ordered member links only to the assigned runner", () => {
    expect(tracking).toContain("isRunner && shareGroup?.ordered_route");
    expect(tracking).toContain("Pickup 1");
    expect(tracking).toContain("Pickup 2");
    expect(tracking).toContain("Drop-off 1");
    expect(tracking).toContain("Drop-off 2");
    expect(tracking).toContain("/app/errands/${stop.taskId}");
  });

  it("never joins private counterparty data into the buyer group query", () => {
    const groupQueryStart = tracking.indexOf('.from("errand_share_groups")');
    const groupQuery = tracking.slice(groupQueryStart, groupQueryStart + 900);
    expect(groupQuery).not.toContain("description");
    expect(groupQuery).not.toContain("payment_reference");
    expect(groupQuery).not.toContain("buyer_id");
    expect(groupQuery).not.toContain("messages");
    expect(groupQuery).not.toContain("profiles");
  });
});
