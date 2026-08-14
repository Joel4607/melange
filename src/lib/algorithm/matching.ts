import { haversineKm } from "./geo";
import type {
  GeoPoint,
  MatchConfig,
  MatchResult,
  RunnerCandidate,
  TaskRequest,
} from "./types";

const WEIGHT_SUM_TOLERANCE = 1e-9;

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  weights: {
    proximity: 0.4,
    trust: 0.3,
    capacity: 0.2,
    urgency: 0.1,
  },
  distanceScaleKm: 3,
  assumedTravelSpeedKmh: 20,
  delayMinutesPerActiveTask: 8,
  urgencyTargetMinutes: {
    express: 15,
    normal: 35,
    low: 60,
  },
  algorithmVersion: "matching-v2",
  configVersion: "matching-v2-default",
};

/** Configuration selected on the calibration seed and locked before final evaluation. */
export const CALIBRATED_MATCH_CONFIG: MatchConfig = {
  ...DEFAULT_MATCH_CONFIG,
  weights: {
    proximity: 0,
    trust: 0.25,
    capacity: 0.1,
    urgency: 0.65,
  },
  configVersion: "matching-v2-calibrated",
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isValidPoint(point: GeoPoint | null): point is GeoPoint {
  return (
    point !== null &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lng >= -180 &&
    point.lng <= 180
  );
}

/** Validate a versioned matcher configuration before it affects ranking. */
export function validateMatchConfig(config: MatchConfig): void {
  const weights = Object.values(config.weights);
  if (weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new Error("Match weights must be finite and non-negative");
  }

  const sum = weights.reduce((total, weight) => total + weight, 0);
  if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {
    throw new Error("Match weights must sum to 1");
  }

  if (!isFinitePositive(config.distanceScaleKm)) {
    throw new Error("distanceScaleKm must be finite and positive");
  }
  if (!isFinitePositive(config.assumedTravelSpeedKmh)) {
    throw new Error("assumedTravelSpeedKmh must be finite and positive");
  }
  if (!isFinitePositive(config.delayMinutesPerActiveTask)) {
    throw new Error("delayMinutesPerActiveTask must be finite and positive");
  }
  for (const [urgency, target] of Object.entries(config.urgencyTargetMinutes)) {
    if (!isFinitePositive(target)) {
      throw new Error(`urgencyTargetMinutes.${urgency} must be finite and positive`);
    }
  }
  if (!config.algorithmVersion.trim() || !config.configVersion.trim()) {
    throw new Error("Matcher algorithm and configuration versions are required");
  }
}

function isEligible(task: TaskRequest, candidate: RunnerCandidate): boolean {
  if (!candidate.available || !candidate.active || !candidate.verified) return false;
  if (candidate.fraudAction === "exclude") return false;
  if (!isValidPoint(candidate.location)) return false;
  if (!Number.isFinite(candidate.trust)) return false;
  if (!Number.isFinite(candidate.activeLoad) || candidate.activeLoad < 0) return false;
  if (
    task.category &&
    candidate.capabilities &&
    candidate.capabilities.length > 0 &&
    !candidate.capabilities.includes(task.category)
  ) {
    return false;
  }
  return true;
}

/**
 * Rank eligible runner candidates with an explainable normalized weighted sum.
 * Eligibility is a hard gate. Urgency is based on estimated pickup time so it
 * has a direct operational meaning instead of duplicating the proximity/load
 * components. Equal scores use stable domain tie-breakers.
 */
export function rankRunners(
  task: TaskRequest,
  candidates: RunnerCandidate[],
  config: MatchConfig = DEFAULT_MATCH_CONFIG,
): MatchResult[] {
  validateMatchConfig(config);
  if (!isValidPoint(task.pickup)) {
    throw new Error("Task pickup must be a valid geographic point");
  }

  const { weights } = config;
  const scored = candidates.filter((candidate) => isEligible(task, candidate)).map((candidate) => {
    const location = candidate.location as GeoPoint;
    const distanceKm = haversineKm(task.pickup, location);
    const proximity = Math.exp(-distanceKm / config.distanceScaleKm);
    const capacity = 1 / (1 + candidate.activeLoad);
    const trust = clamp01(candidate.trust);
    const straightLineTravelMinutes =
      (distanceKm / config.assumedTravelSpeedKmh) * 60;
    const estimatedPickupMinutes =
      straightLineTravelMinutes +
      candidate.activeLoad * config.delayMinutesPerActiveTask;
    const urgencyTarget = config.urgencyTargetMinutes[task.urgency];
    const urgencyFit = Math.exp(-estimatedPickupMinutes / urgencyTarget);

    const matchScore =
      weights.proximity * proximity +
      weights.trust * trust +
      weights.capacity * capacity +
      weights.urgency * urgencyFit;

    return {
      runnerId: candidate.runnerId,
      rank: 0,
      matchScore,
      components: {
        proximity,
        trust,
        capacity,
        urgencyFit,
        distanceKm,
        estimatedPickupMinutes,
      },
    } satisfies MatchResult;
  });

  scored.sort(
    (a, b) =>
      b.matchScore - a.matchScore ||
      a.components.estimatedPickupMinutes - b.components.estimatedPickupMinutes ||
      b.components.trust - a.components.trust ||
      b.components.capacity - a.components.capacity ||
      a.runnerId.localeCompare(b.runnerId),
  );
  scored.forEach((result, index) => {
    result.rank = index + 1;
  });

  return scored;
}
