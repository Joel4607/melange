import type { TrustConfig, TrustInputs, TrustBreakdown } from "./types";

export const DEFAULT_TRUST_CONFIG: TrustConfig = {
  weights: {
    completion: 0.35,
    dispute: 0.25,
    rating: 0.25,
    responsiveness: 0.15,
  },
  halfLifeDays: 30,
  prior: { alpha: 2, beta: 2, verifiedBonus: 2 },
  fraudPenaltyWeight: 0.5,
};

const MS_PER_DAY = 86_400_000;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * Exponential time-decay weight for an event of a given age.
 * An event one half-life old contributes half as much as a fresh event.
 */
function decayWeight(ageMs: number, halfLifeDays: number): number {
  const ageDays = Math.max(0, ageMs) / MS_PER_DAY;
  const lambda = Math.LN2 / halfLifeDays;
  return Math.exp(-lambda * ageDays);
}

/**
 * Compute a runner's trust score in [0, 1] from their behavioural history.
 *
 * The score is a weighted combination of four components, each computed with
 * exponential time-decay so that recent behaviour dominates:
 *
 *   trust = w_c * completionRate
 *         + w_d * (1 - disputeRate)
 *         + w_r * ratingNorm
 *         + w_s * responsiveness
 *         - fraudPenaltyWeight * fraudRisk     (then clamped to [0, 1])
 *
 * The completion rate uses a Bayesian (Beta) prior so brand-new runners start
 * from a sensible neutral value instead of 0 or 1 (the cold-start problem).
 * Verified runners receive a higher prior, linking verification to trust.
 */
export function computeTrust(
  inputs: TrustInputs,
  config: TrustConfig = DEFAULT_TRUST_CONFIG,
): TrustBreakdown {
  const { weights, halfLifeDays, prior } = config;
  const now = inputs.now;

  let wCompleted = 0;
  let wCancelled = 0;
  let wDisputes = 0;

  let ratingWeightedSum = 0;
  let ratingWeightTotal = 0;

  let responsivenessWeightedSum = 0;
  let responsivenessWeightTotal = 0;

  for (const event of inputs.events) {
    const w = decayWeight(now - event.at, halfLifeDays);
    switch (event.type) {
      case "completed":
        wCompleted += w;
        break;
      case "cancelled":
        wCancelled += w;
        break;
      case "dispute_lost":
        wDisputes += w;
        break;
      case "rating": {
        // Normalise 1..5 stars to 0..1.
        const norm = clamp01((event.value - 1) / 4);
        ratingWeightedSum += w * norm;
        ratingWeightTotal += w;
        break;
      }
      case "responsiveness":
        responsivenessWeightedSum += w * clamp01(event.value);
        responsivenessWeightTotal += w;
        break;
    }
  }

  const verifiedBonus = inputs.verified ? prior.verifiedBonus : 0;
  const priorSuccess = prior.alpha + verifiedBonus;
  const opportunities = wCompleted + wCancelled;

  // Bayesian completion rate with a verification-weighted cold-start prior.
  const completionRate =
    (wCompleted + priorSuccess) /
    (opportunities + priorSuccess + prior.beta);

  // Smoothed dispute rate over decayed task volume.
  const disputeRate = wDisputes / (opportunities + wDisputes + 1);

  const ratingNorm =
    ratingWeightTotal > 0 ? ratingWeightedSum / ratingWeightTotal : 0.5;

  const responsiveness =
    responsivenessWeightTotal > 0
      ? responsivenessWeightedSum / responsivenessWeightTotal
      : 0.5;

  const base =
    weights.completion * completionRate +
    weights.dispute * (1 - disputeRate) +
    weights.rating * ratingNorm +
    weights.responsiveness * responsiveness;

  const fraudRisk = clamp01(inputs.fraudRisk ?? 0);
  const trust = clamp01(base - config.fraudPenaltyWeight * fraudRisk);

  return {
    trust,
    completionRate,
    disputeRate,
    ratingNorm,
    responsiveness,
    fraudRisk,
  };
}
