import { haversineKm } from "./geo";
import type {
  MatchConfig,
  MatchResult,
  RunnerCandidate,
  TaskRequest,
  Urgency,
} from "./types";

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  weights: {
    proximity: 0.4,
    trust: 0.3,
    availability: 0.2,
    urgency: 0.1,
  },
  distanceScaleKm: 3,
};

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * How much the task's urgency demands a "ready" runner.
 * Higher demand makes the urgency component punish unready runners more.
 */
function urgencyDemand(urgency: Urgency): number {
  switch (urgency) {
    case "express":
      return 1;
    case "normal":
      return 0.5;
    case "low":
      return 0.2;
  }
}

/**
 * Rank fraud-cleared candidate runners for a task using a normalized,
 * multi-criteria weighted-sum model.
 *
 * Every criterion is mapped into [0, 1] with a fixed bounded transform before
 * weighting, so the declared weights actually control the ranking (a raw
 * `1/distance + trust + ...` formula lets the largest-magnitude term dominate
 * regardless of weights). Components:
 *
 *   proximity    = exp(-distanceKm / d0)
 *   trust        = candidate.trust            (already in [0, 1])
 *   availability = 1 / (1 + activeLoad)
 *   urgencyFit   = 1 - demand(urgency) * (1 - readiness),
 *                  where readiness = proximity * availability
 *
 * Candidates that are unavailable or lack the required capability are filtered
 * out. Fraud filtering happens upstream (the caller passes a cleared pool).
 */
export function rankRunners(
  task: TaskRequest,
  candidates: RunnerCandidate[],
  config: MatchConfig = DEFAULT_MATCH_CONFIG,
): MatchResult[] {
  const { weights, distanceScaleKm } = config;
  const demand = urgencyDemand(task.urgency);

  const scored = candidates
    .filter((c) => c.available)
    .filter(
      (c) =>
        !task.category ||
        !c.capabilities ||
        c.capabilities.length === 0 ||
        c.capabilities.includes(task.category),
    )
    .map((c) => {
      const distanceKm = haversineKm(task.pickup, c.location);
      const proximity = Math.exp(-distanceKm / distanceScaleKm);
      const availability = 1 / (1 + Math.max(0, c.activeLoad));
      const trust = clamp01(c.trust);
      const readiness = proximity * availability;
      const urgencyFit = clamp01(1 - demand * (1 - readiness));

      const matchScore =
        weights.proximity * proximity +
        weights.trust * trust +
        weights.availability * availability +
        weights.urgency * urgencyFit;

      return {
        runnerId: c.runnerId,
        rank: 0,
        matchScore,
        components: { proximity, trust, availability, urgencyFit, distanceKm },
      } satisfies MatchResult;
    });

  scored.sort((a, b) => b.matchScore - a.matchScore);
  scored.forEach((r, i) => {
    r.rank = i + 1;
  });

  return scored;
}
