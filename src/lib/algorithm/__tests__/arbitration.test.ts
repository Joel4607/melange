import { describe, it, expect } from "vitest";
import { arbitrate } from "../arbitration";
import type { DisputeContext } from "../types";

describe("arbitrate", () => {
  it("auto-releases payment when proof exists and GPS matches", () => {
    const ctx: DisputeContext = {
      proofProvided: true,
      gpsMatch: true,
      buyerClaim: "not_delivered",
      fraudFlagged: false,
    };
    const res = arbitrate(ctx);
    expect(res.resolution).toBe("release");
    expect(res.decidedBy).toBe("system");
    expect(res.escalate).toBe(false);
  });

  it("auto-refunds when there is no proof and buyer says not delivered", () => {
    const ctx: DisputeContext = {
      proofProvided: false,
      gpsMatch: null,
      buyerClaim: "not_delivered",
      fraudFlagged: false,
    };
    const res = arbitrate(ctx);
    expect(res.resolution).toBe("refund");
    expect(res.decidedBy).toBe("system");
    expect(res.escalate).toBe(false);
  });

  it("escalates to a human when proof GPS mismatches, suggesting refund", () => {
    const ctx: DisputeContext = {
      proofProvided: true,
      gpsMatch: false,
      buyerClaim: "not_delivered",
      fraudFlagged: false,
    };
    const res = arbitrate(ctx);
    expect(res.escalate).toBe(true);
    expect(res.resolution).toBeNull();
    expect(res.decidedBy).toBe("admin");
    expect(res.suggestedAction).toBe("refund");
  });

  it("escalates when the runner is under a hard fraud flag", () => {
    const ctx: DisputeContext = {
      proofProvided: true,
      gpsMatch: true,
      buyerClaim: "damaged",
      fraudFlagged: true,
    };
    const res = arbitrate(ctx);
    expect(res.escalate).toBe(true);
    expect(res.ruleMatched).toBe("hard_fraud_flag");
  });

  it("escalates ambiguous cases that match no rule", () => {
    const ctx: DisputeContext = {
      proofProvided: false,
      gpsMatch: null,
      buyerClaim: "other",
      fraudFlagged: false,
    };
    const res = arbitrate(ctx);
    expect(res.escalate).toBe(true);
    expect(res.suggestedAction).toBeNull();
  });
});
