import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const actions = readFileSync(resolve(process.cwd(), "src/app/app/actions.ts"), "utf8");
const notifications = readFileSync(
  resolve(process.cwd(), "src/lib/server/notifications.ts"),
  "utf8",
);

function actionBody(name: string): string {
  const start = actions.indexOf(`export async function ${name}`);
  if (start < 0) throw new Error(`Action ${name} is missing`);
  const next = actions.indexOf("export async function ", start + 1);
  return actions.slice(start, next < 0 ? actions.length : next);
}

describe("Errand-Share action contracts", () => {
  it("routes eligible automatic posts through pairing and Express through ordinary matching", () => {
    const create = actionBody("createErrand");
    expect(create).toContain("enqueueOrPairErrand(task.id)");
    expect(create).toContain("shareWindowEndsAt(");
    expect(create).toContain("todayDeadlineAt(");
    expect(create).toContain("generateMatchRun(task.id)");
    expect(create).toContain('urgency !== "express"');
    expect(create).toContain("processDueShareWindows(5)");
  });

  it("exposes atomic shared funding, rematch, claim, accept, decline and start actions", () => {
    expect(actionBody("confirmSharedEscrow")).toContain("confirmShareFunding(");
    expect(actionBody("confirmSharedEscrow")).toContain("offerShareToTopCandidate(");
    expect(actionBody("rematchSharedGroup")).toContain("generateShareMatchRun(");
    expect(actionBody("claimSharedGroup")).toContain("finalizeShareSelfClaim(");
    expect(actionBody("acceptSharedOffer")).toContain("acceptShareOffer(");
    expect(actionBody("declineSharedOffer")).toContain("declineAndOfferNextShareCandidate(");
    expect(actionBody("startSharedTrip")).toContain("startShareGroup(");
  });

  it("synchronizes group completion only after the child task is completed", () => {
    const delivered = actionBody("markDelivered");
    expect(delivered).toContain('status: "completed"');
    expect(delivered).toContain("syncShareMemberCompletion(taskId, completedAt)");
    expect(delivered.indexOf('status: "completed"')).toBeLessThan(
      delivered.indexOf("syncShareMemberCompletion(taskId, completedAt)"),
    );
  });

  it("dissolves a pre-acceptance group before using ordinary cancellation", () => {
    const cancel = actionBody("cancelErrand");
    expect(cancel).toContain("dissolveShareGroupForCancellation(");
    expect(cancel).toContain("share_group_id");
    expect(cancel.indexOf("dissolveShareGroupForCancellation(")).toBeLessThan(
      cancel.indexOf("cancelTaskWithRefund("),
    );
  });

  it("cancels an accepted shared group once rather than cancelling child tasks", () => {
    const cancel = actionBody("cancelRunnerErrand");
    expect(cancel).toContain("cancelShareGroupByRunner(");
    expect(cancel).toContain("share_group_id");
    expect(cancel.indexOf("cancelShareGroupByRunner(")).toBeLessThan(
      cancel.indexOf("cancelTaskWithRefund("),
    );
  });

  it("defines explicit sharing notifications without cross-buyer copy", () => {
    for (const type of [
      "share_paired",
      "share_dissolved",
      "share_continuing_alone",
      "share_funding_ready",
      "share_offer",
      "share_accepted",
      "share_member_delivered",
      "share_completed",
    ]) {
      expect(notifications).toContain(`| "${type}"`);
    }
    expect(notifications).not.toMatch(/other buyer|other buyer's|other buyer’s/i);
  });
});
