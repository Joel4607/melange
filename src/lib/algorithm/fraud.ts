import { haversineKm } from "./geo";
import type {
  FraudConfig,
  FraudContext,
  FraudFinding,
  FraudResult,
  FraudRuleType,
} from "./types";

export const DEFAULT_FRAUD_CONFIG: FraudConfig = {
  gpsToleranceKm: 0.3,
  maxSpeedKmh: 120,
  cancellationThreshold: 3,
  pairDisputeThreshold: 2,
  severities: {
    gps_mismatch: 0.6,
    impossible_speed: 0.5,
    rapid_cancellations: 0.3,
    repeated_pair_disputes: 0.4,
  },
  softThreshold: 0.3,
  hardThreshold: 0.6,
};

const MS_PER_HOUR = 3_600_000;

/**
 * Run the rule-based fraud/anomaly layer over a completed (or completing) task.
 *
 * Rules are deterministic and explainable (chosen over an ML model for
 * transparency and defensibility). Each triggered rule contributes its severity
 * to an aggregated risk score, which is squashed into [0, 1]. A two-tier
 * response is then applied:
 *   risk >= hardThreshold -> exclude the runner from matching + escalate
 *   risk >= softThreshold -> apply a soft trust penalty (runner ranks lower)
 *   otherwise             -> clear
 */
export function evaluateFraud(
  ctx: FraudContext,
  config: FraudConfig = DEFAULT_FRAUD_CONFIG,
): FraudResult {
  const findings: FraudFinding[] = [];

  // Rule 1: proof GPS far from the task location.
  if (ctx.proofLocation && ctx.taskLocation) {
    const gap = haversineKm(ctx.proofLocation, ctx.taskLocation);
    const triggered = gap > config.gpsToleranceKm;
    findings.push({
      ruleType: "gps_mismatch",
      triggered,
      severity: triggered ? config.severities.gps_mismatch : 0,
      detail: `proof ${gap.toFixed(2)}km from task (tolerance ${config.gpsToleranceKm}km)`,
    });
  }

  // Rule 2: completion implies a physically impossible average speed.
  if (
    ctx.taskDistanceKm != null &&
    ctx.acceptedAt != null &&
    ctx.completedAt != null &&
    ctx.completedAt > ctx.acceptedAt
  ) {
    const hours = (ctx.completedAt - ctx.acceptedAt) / MS_PER_HOUR;
    const speed = hours > 0 ? ctx.taskDistanceKm / hours : Infinity;
    const triggered = speed > config.maxSpeedKmh;
    findings.push({
      ruleType: "impossible_speed",
      triggered,
      severity: triggered ? config.severities.impossible_speed : 0,
      detail: `${speed.toFixed(0)}km/h required (max ${config.maxSpeedKmh}km/h)`,
    });
  }

  // Rule 3: rapid cancellations within the window.
  if (ctx.recentCancellations != null) {
    const triggered = ctx.recentCancellations >= config.cancellationThreshold;
    findings.push({
      ruleType: "rapid_cancellations",
      triggered,
      severity: triggered ? config.severities.rapid_cancellations : 0,
      detail: `${ctx.recentCancellations} recent cancellations (threshold ${config.cancellationThreshold})`,
    });
  }

  // Rule 4: repeated disputes with the same counterparty (possible collusion).
  if (ctx.disputesWithSameCounterparty != null) {
    const triggered =
      ctx.disputesWithSameCounterparty >= config.pairDisputeThreshold;
    findings.push({
      ruleType: "repeated_pair_disputes",
      triggered,
      severity: triggered ? config.severities.repeated_pair_disputes : 0,
      detail: `${ctx.disputesWithSameCounterparty} disputes with same counterparty (threshold ${config.pairDisputeThreshold})`,
    });
  }

  // Aggregate: combine independent severities as a noisy-OR so multiple weak
  // signals accumulate but the result stays bounded in [0, 1].
  const risk =
    1 -
    findings
      .filter((f) => f.triggered)
      .reduce((acc, f) => acc * (1 - f.severity), 1);

  let action: FraudResult["action"] = "clear";
  if (risk >= config.hardThreshold) action = "exclude";
  else if (risk >= config.softThreshold) action = "penalize";

  return {
    findings,
    risk,
    action,
    escalate: action === "exclude",
  };
}

export const FRAUD_RULE_TYPES: FraudRuleType[] = [
  "gps_mismatch",
  "impossible_speed",
  "rapid_cancellations",
  "repeated_pair_disputes",
];
