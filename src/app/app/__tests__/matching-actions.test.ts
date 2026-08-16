import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const actions = readFileSync(resolve(process.cwd(), "src/app/app/actions.ts"), "utf8");
const disputes = readFileSync(resolve(process.cwd(), "src/lib/server/disputes.ts"), "utf8");
const errandPage = readFileSync(
  resolve(process.cwd(), "src/app/app/errands/[id]/page.tsx"),
  "utf8",
);
const feedPage = readFileSync(resolve(process.cwd(), "src/app/app/feed/page.tsx"), "utf8");

function actionBody(name: string): string {
  const start = actions.indexOf(`export async function ${name}`);
  if (start < 0) throw new Error(`Action ${name} is missing`);
  const next = actions.indexOf("export async function ", start + 1);
  return actions.slice(start, next < 0 ? actions.length : next);
}

describe("matching action contracts", () => {
  it("uses explicit manual matching and the exact active run for payment", () => {
    expect(actionBody("rematch")).toContain('generateMatchRun(taskId, "manual")');
    const payment = actionBody("payIntoEscrow");
    expect(payment).toContain("active_match_run_id");
    expect(payment).not.toContain('.from("match_runs")');
    expect(payment).not.toContain('status !== "posted"');
    expect(payment).toContain("offerToTopCandidate(taskId, true)");
    expect(payment).not.toContain("holdFunds(taskId)");
    expect(payment).not.toContain("topUp(");
  });

  it("self-claim uses transactional finalization instead of a direct task assignment", () => {
    const claim = actionBody("claimTask");
    expect(claim).toContain("finalizeSelfClaim(taskId, runnerId)");
    expect(claim).not.toContain('update({ status: "matched", selected_runner_id: runnerId })');
    expect(claim).not.toContain("holdFunds(taskId)");
    expect(claim).not.toContain("topUp(");
  });

  it("declines and chooses the next offer or reopens in one transaction", () => {
    const decline = actionBody("declineOffer");
    expect(decline).toContain("declineAndOfferNextCandidate(taskId, runnerId)");
    expect(decline).not.toContain("selected_runner_id: null");
    expect(decline).not.toContain('recordMatchOutcomeEvent(taskId, runnerId, "declined")');
    expect(decline).not.toContain("offerToTopCandidate(taskId)");
  });

  it.each([
    ["acceptOffer", '"accepted"'],
    ["markPickedUp", '"picked_up"'],
    ["markDelivered", '"completed"'],
    ["cancelRunnerErrand", '"cancelled"'],
    ["raiseDispute", '"disputed"'],
  ])("records %s telemetry after its successful transition", (name, event) => {
    expect(actionBody(name)).toContain(`recordMatchOutcomeEvent(`);
    expect(actionBody(name)).toContain(event);
  });

  it("records dispute resolution after the task reaches resolved", () => {
    expect(disputes).toContain("recordMatchOutcomeEvent(");
    expect(disputes).toContain('"resolved"');
  });

  it.each(["cancelErrand", "cancelRunnerErrand"])(
    "%s cancels and refunds through one RPC-backed helper",
    (name) => {
      const body = actionBody(name);
      expect(body).toContain("cancelTaskWithRefund(");
      expect(body).not.toContain('.update({ status: "cancelled" })');
      expect(body).not.toContain("await refund(taskId)");
    },
  );

  it("renders only the active run and keeps the available feed posted-only", () => {
    expect(errandPage).toContain("active_match_run_id");
    expect(errandPage).not.toContain('.from("match_runs")');
    expect(feedPage).toContain('.eq("status", "posted")');
    expect(errandPage).toContain('task.status === "posted" &&');
  });
});
