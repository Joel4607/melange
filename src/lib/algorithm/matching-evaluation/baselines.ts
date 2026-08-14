import { haversineKm } from "../geo";
import { DEFAULT_MATCH_CONFIG, rankRunners } from "../matching";
import type { MatchConfig, RunnerCandidate } from "../types";
import { createSeededRandom } from "./random";
import type { ScenarioRanker, SimulatedScenario } from "./types";

export function eligibleCandidates(scenario: SimulatedScenario): RunnerCandidate[] {
  return scenario.candidates.map(({ candidate }) => candidate).filter((candidate) =>
    candidate.available &&
    candidate.active &&
    candidate.verified &&
    candidate.fraudAction !== "exclude" &&
    candidate.location !== null &&
    Number.isFinite(candidate.trust) &&
    Number.isFinite(candidate.activeLoad) &&
    candidate.activeLoad >= 0 &&
    (!scenario.task.category ||
      !candidate.capabilities ||
      candidate.capabilities.length === 0 ||
      candidate.capabilities.includes(scenario.task.category)),
  );
}

export const rankNearest: ScenarioRanker = (scenario) =>
  eligibleCandidates(scenario).sort((a, b) =>
    haversineKm(scenario.task.pickup, a.location!) - haversineKm(scenario.task.pickup, b.location!) ||
    a.runnerId.localeCompare(b.runnerId),
  );

export const rankHighestTrust: ScenarioRanker = (scenario) =>
  eligibleCandidates(scenario).sort(
    (a, b) => b.trust - a.trust || a.runnerId.localeCompare(b.runnerId),
  );

export function createRandomRanker(seed: number): ScenarioRanker {
  return (scenario) => {
    const random = createSeededRandom(seed ^ stableHash(scenario.id));
    return eligibleCandidates(scenario)
      .map((candidate) => ({ candidate, key: random.next() }))
      .sort((a, b) => a.key - b.key || a.candidate.runnerId.localeCompare(b.candidate.runnerId))
      .map(({ candidate }) => candidate);
  };
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Frozen adapter for the matcher deployed before ETA-based matching-v2. */
export const rankLegacyCurrent: ScenarioRanker = (scenario) => {
  const demand = scenario.task.urgency === "express"
    ? 1
    : scenario.task.urgency === "normal"
      ? 0.5
      : 0.2;
  return eligibleCandidates(scenario)
    .map((candidate) => {
      const proximity = Math.exp(
        -haversineKm(scenario.task.pickup, candidate.location!) /
          DEFAULT_MATCH_CONFIG.distanceScaleKm,
      );
      const capacity = 1 / (1 + Math.max(0, candidate.activeLoad));
      const trust = Math.max(0, Math.min(1, candidate.trust));
      const urgencyFit = Math.max(0, Math.min(1, 1 - demand * (1 - proximity * capacity)));
      return {
        candidate,
        score:
          0.4 * proximity +
          0.3 * trust +
          0.2 * capacity +
          0.1 * urgencyFit,
      };
    })
    // Array#sort is stable: the pre-v2 matcher preserved source order on ties.
    .sort((left, right) => right.score - left.score)
    .map(({ candidate }) => candidate);
};

export function createMatcherRanker(config: MatchConfig): ScenarioRanker {
  return (scenario) => {
    const byId = new Map(eligibleCandidates(scenario).map((candidate) => [candidate.runnerId, candidate]));
    return rankRunners(scenario.task, [...byId.values()], config)
      .map((result) => byId.get(result.runnerId))
      .filter((candidate): candidate is RunnerCandidate => Boolean(candidate));
  };
}

export const EQUAL_WEIGHT_CONFIG: MatchConfig = {
  ...DEFAULT_MATCH_CONFIG,
  weights: { proximity: 0.25, trust: 0.25, capacity: 0.25, urgency: 0.25 },
  configVersion: "matching-v2-equal-weight",
};

export function selectNearest(scenario: SimulatedScenario): RunnerCandidate | undefined {
  return rankNearest(scenario)[0];
}

export function selectHighestTrust(scenario: SimulatedScenario): RunnerCandidate | undefined {
  return rankHighestTrust(scenario)[0];
}
