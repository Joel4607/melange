import type {
  ArbitrationConfig,
  ArbitrationResult,
  DisputeContext,
} from "./types";

export const DEFAULT_ARBITRATION_CONFIG: ArbitrationConfig = {
  escalationConfidence: 0.7,
};

/**
 * Rule-based dispute arbitration with confidence-gated human escalation.
 *
 * The engine resolves clear-cut cases deterministically and escalates ambiguous
 * or high-stakes ones to a human admin. Crucially, no AI/LLM decides outcomes
 * here: the admin (assisted separately by an AI summariser) makes the final
 * call on anything escalated. When escalating, the engine still returns a
 * non-binding `suggestedAction` to support the admin's decision.
 *
 * Decision logic (in priority order):
 *   1. Hard fraud flag                 -> escalate (suggest refund)
 *   2. Proof + GPS match, no fraud     -> release to runner   (high confidence)
 *   3. No proof + "not delivered"      -> refund buyer        (high confidence)
 *   4. Proof present but GPS mismatch  -> escalate (suggest refund)
 *   5. Anything else                   -> escalate (no suggestion)
 */
export function arbitrate(
  ctx: DisputeContext,
  config: ArbitrationConfig = DEFAULT_ARBITRATION_CONFIG,
): ArbitrationResult {
  const decision = decide(ctx);
  const escalate =
    decision.resolution === null ||
    decision.confidence < config.escalationConfidence;

  if (escalate) {
    return {
      resolution: null,
      decidedBy: "admin",
      escalate: true,
      confidence: decision.confidence,
      ruleMatched: decision.ruleMatched,
      suggestedAction: decision.suggestedAction,
    };
  }

  return {
    resolution: decision.resolution,
    decidedBy: "system",
    escalate: false,
    confidence: decision.confidence,
    ruleMatched: decision.ruleMatched,
    suggestedAction: decision.resolution,
  };
}

interface Decision {
  resolution: ArbitrationResult["resolution"];
  confidence: number;
  ruleMatched: string;
  suggestedAction: ArbitrationResult["suggestedAction"];
}

function decide(ctx: DisputeContext): Decision {
  if (ctx.fraudFlagged) {
    return {
      resolution: null,
      confidence: 0.4,
      ruleMatched: "hard_fraud_flag",
      suggestedAction: "refund",
    };
  }

  if (ctx.proofProvided && ctx.gpsMatch === true) {
    return {
      resolution: "release",
      confidence: 0.9,
      ruleMatched: "proof_gps_match",
      suggestedAction: "release",
    };
  }

  if (!ctx.proofProvided && ctx.buyerClaim === "not_delivered") {
    return {
      resolution: "refund",
      confidence: 0.85,
      ruleMatched: "no_proof_not_delivered",
      suggestedAction: "refund",
    };
  }

  if (ctx.proofProvided && ctx.gpsMatch === false) {
    return {
      resolution: null,
      confidence: 0.5,
      ruleMatched: "proof_gps_mismatch",
      suggestedAction: "refund",
    };
  }

  return {
    resolution: null,
    confidence: 0.3,
    ruleMatched: "no_rule_matched",
    suggestedAction: null,
  };
}
