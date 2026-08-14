import { haversineKm } from "../geo";
import { DEFAULT_MATCH_CONFIG } from "../matching";
import type { MatchConfig, RunnerCandidate } from "../types";
import {
  EQUAL_WEIGHT_CONFIG,
  createMatcherRanker,
  createRandomRanker,
  eligibleCandidates,
  rankLegacyCurrent,
  rankHighestTrust,
  rankNearest,
} from "./baselines";
import { assessOracleOutcome, oracleUtility } from "./oracle";
import type {
  EvaluationSlice,
  MatchingEvaluationReport,
  ScenarioRanker,
  SimulatedScenario,
  StrategyEvaluation,
  StrategyMetrics,
  StrategyName,
} from "./types";
import { BOOTSTRAP_SEED, EVALUATION_VERSION, GENERATOR_VERSION } from "./types";
import { createSeededRandom } from "./random";

export function normalizedRegret(bestUtility: number, selectedUtility: number): number {
  if (bestUtility <= 0) return 0;
  return Math.max(0, (bestUtility - selectedUtility) / bestUtility);
}

export function ndcgAtK(actualUtilities: number[], idealUtilities: number[], k: number): number {
  const dcg = (values: number[]) =>
    values.slice(0, k).reduce((total, relevance, index) =>
      total + (2 ** relevance - 1) / Math.log2(index + 2), 0);
  const ideal = dcg(idealUtilities);
  return ideal === 0 ? 1 : dcg(actualUtilities) / ideal;
}

export function bootstrapMeanInterval(
  values: number[],
  seed: number,
  iterations = 500,
): { lower: number; upper: number } {
  if (values.length === 0) return { lower: 0, upper: 0 };
  const random = createSeededRandom(seed);
  const means: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let total = 0;
    for (let index = 0; index < values.length; index += 1) {
      total += values[random.int(0, values.length - 1)];
    }
    means.push(total / values.length);
  }
  means.sort((a, b) => a - b);
  const lowerIndex = Math.floor(iterations * 0.025);
  const upperIndex = Math.min(iterations - 1, Math.ceil(iterations * 0.975) - 1);
  return { lower: means[lowerIndex], upper: means[upperIndex] };
}

function normalizedConfig(config: MatchConfig, key: keyof MatchConfig["weights"], factor: number): MatchConfig {
  const weights = { ...config.weights, [key]: config.weights[key] * factor };
  const sum = Object.values(weights).reduce((total, value) => total + value, 0);
  return {
    ...config,
    weights: {
      proximity: weights.proximity / sum,
      trust: weights.trust / sum,
      capacity: weights.capacity / sum,
      urgency: weights.urgency / sum,
    },
    configVersion: `${config.configVersion}-perturbed`,
  };
}

export function topChoiceStability(
  scenarios: SimulatedScenario[],
  config: MatchConfig,
): number {
  if (scenarios.length === 0) return 1;
  const baseRanker = createMatcherRanker(config);
  const keys = Object.keys(config.weights) as Array<keyof MatchConfig["weights"]>;
  const variants = keys.flatMap((key) => [
    createMatcherRanker(normalizedConfig(config, key, 0.9)),
    createMatcherRanker(normalizedConfig(config, key, 1.1)),
  ]);
  let stable = 0;
  let comparisons = 0;
  for (const scenario of scenarios) {
    const base = baseRanker(scenario)[0]?.runnerId ?? null;
    for (const ranker of variants) {
      if ((ranker(scenario)[0]?.runnerId ?? null) === base) stable += 1;
      comparisons += 1;
    }
  }
  return comparisons === 0 ? 1 : stable / comparisons;
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function findSimulated(scenario: SimulatedScenario, candidate: RunnerCandidate) {
  return scenario.candidates.find(({ candidate: item }) => item.runnerId === candidate.runnerId)!;
}

export function evaluateStrategy(
  scenarios: SimulatedScenario[],
  ranker: ScenarioRanker,
): StrategyMetrics {
  let eligibilityViolations = 0;
  let accepted = 0;
  let completed = 0;
  let cancelled = 0;
  let disputed = 0;
  let successfulOnTime = 0;
  let topThreeCoverage = 0;
  let coldStart = 0;
  const selectedCounts = new Map<string, number>();
  const pickupMinutes: number[] = [];
  const distances: number[] = [];
  const ndcgs: number[] = [];
  const regrets: number[] = [];

  for (const scenario of scenarios) {
    const eligible = eligibleCandidates(scenario);
    const eligibleIds = new Set(eligible.map((candidate) => candidate.runnerId));
    const ranked = ranker(scenario);
    eligibilityViolations += ranked.filter((candidate) => !eligibleIds.has(candidate.runnerId)).length;
    const oracleRanked = scenario.candidates
      .filter(({ candidate }) => eligibleIds.has(candidate.runnerId))
      .sort((a, b) => oracleUtility(scenario.task, b) - oracleUtility(scenario.task, a));
    const idealUtilities = oracleRanked.map((runner) => oracleUtility(scenario.task, runner));
    const actualUtilities = ranked.map((candidate) =>
      oracleUtility(scenario.task, findSimulated(scenario, candidate)));
    ndcgs.push(ndcgAtK(actualUtilities, idealUtilities, 5));

    const selected = ranked[0];
    if (!selected) {
      regrets.push(idealUtilities[0] ? 1 : 0);
      continue;
    }
    const simulated = findSimulated(scenario, selected);
    selectedCounts.set(selected.runnerId, (selectedCounts.get(selected.runnerId) ?? 0) + 1);
    const outcome = assessOracleOutcome(scenario.task, simulated);
    const bestUtility = idealUtilities[0] ?? 0;
    regrets.push(normalizedRegret(bestUtility, outcome.utility));
    if (outcome.accepted) accepted += 1;
    if (outcome.completed) completed += 1;
    if (outcome.cancelled) cancelled += 1;
    if (outcome.disputed) disputed += 1;
    if (outcome.successfulOnTime) successfulOnTime += 1;
    pickupMinutes.push(outcome.pickupMinutes);
    distances.push(haversineKm(scenario.task.pickup, selected.location!));
    if (selected.trust <= 0.55) coldStart += 1;
    const topThree = new Set(oracleRanked.slice(0, 3).map(({ candidate }) => candidate.runnerId));
    if (topThree.has(selected.runnerId)) topThreeCoverage += 1;
  }

  const count = scenarios.length;
  const selectedTotal = [...selectedCounts.values()].reduce((sum, value) => sum + value, 0);
  const selectionConcentration = selectedTotal === 0
    ? 0
    : [...selectedCounts.values()].reduce(
        (sum, value) => sum + (value / selectedTotal) ** 2,
        0,
      );
  return {
    scenarios: count,
    eligibilityViolations,
    acceptanceRate: accepted / count,
    completionRate: completed / count,
    cancellationRate: cancelled / count,
    disputeRate: disputed / count,
    successfulOnTimeRate: successfulOnTime / count,
    meanPickupMinutes: average(pickupMinutes),
    meanDistanceKm: average(distances),
    ndcgAt5: average(ndcgs),
    normalizedRegret: average(regrets),
    topThreeOracleCoverage: topThreeCoverage / count,
    coldStartExposure: coldStart / count,
    selectionConcentration,
  };
}

function successfulOnTimeVector(
  scenarios: SimulatedScenario[],
  ranker: ScenarioRanker,
): number[] {
  return scenarios.map((scenario) => {
    const selected = ranker(scenario)[0];
    if (!selected) return 0;
    const simulated = findSimulated(scenario, selected);
    return assessOracleOutcome(scenario.task, simulated).successfulOnTime ? 1 : 0;
  });
}

function slicesFor(
  scenarios: SimulatedScenario[],
  ranker: ScenarioRanker,
  keyOf: (scenario: SimulatedScenario) => string,
): EvaluationSlice[] {
  const groups = new Map<string, SimulatedScenario[]>();
  for (const scenario of scenarios) {
    const key = keyOf(scenario);
    const group = groups.get(key) ?? [];
    group.push(scenario);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, group]) => ({ key, metrics: evaluateStrategy(group, ranker) }));
}

function evaluateNamedStrategy(
  name: StrategyName,
  scenarios: SimulatedScenario[],
  ranker: ScenarioRanker,
): StrategyEvaluation {
  const evaluation = evaluateStrategy(scenarios, ranker);
  const successes = successfulOnTimeVector(scenarios, ranker);
  evaluation.successfulOnTimeInterval = bootstrapMeanInterval(
    successes,
    BOOTSTRAP_SEED ^ name.length,
  );
  return {
    name,
    metrics: evaluation,
    slices: {
      urgency: slicesFor(scenarios, ranker, (scenario) => scenario.task.urgency),
      category: slicesFor(scenarios, ranker, (scenario) => scenario.task.category ?? "uncategorized"),
      candidatePool: slicesFor(scenarios, ranker, (scenario) => {
        const count = scenario.candidates.length;
        return count <= 5 ? "small-3-5" : count <= 8 ? "medium-6-8" : "large-9-12";
      }),
      distance: selectionSlicesFor(scenarios, ranker, (scenario, selected) => {
        const distance = findSimulated(scenario, selected).distanceKm;
        return distance < 2 ? "near-under-2km" : distance < 5 ? "mid-2-5km" : "far-5km-plus";
      }),
      activeLoad: selectionSlicesFor(scenarios, ranker, (_scenario, selected) =>
        selected.activeLoad === 0
          ? "load-0"
          : selected.activeLoad <= 2
            ? "load-1-2"
            : "load-3-plus",
      ),
    },
  };
}

function selectionSlicesFor(
  scenarios: SimulatedScenario[],
  ranker: ScenarioRanker,
  keyOf: (scenario: SimulatedScenario, selected: RunnerCandidate) => string,
): EvaluationSlice[] {
  const groups = new Map<string, SimulatedScenario[]>();
  for (const scenario of scenarios) {
    const selected = ranker(scenario)[0];
    if (!selected) continue;
    const key = keyOf(scenario, selected);
    const group = groups.get(key) ?? [];
    group.push(scenario);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, group]) => ({ key, metrics: evaluateStrategy(group, ranker) }));
}

export function evaluateAllStrategies(
  scenarios: SimulatedScenario[],
  proposedConfig: MatchConfig = DEFAULT_MATCH_CONFIG,
  generatorSeed = 0,
): MatchingEvaluationReport {
  const strategyRankers: Array<[StrategyName, ScenarioRanker]> = [
    ["random-eligible", createRandomRanker(generatorSeed ^ 0xa5a5)],
    ["nearest-eligible", rankNearest],
    ["highest-trust", rankHighestTrust],
    ["equal-weight", createMatcherRanker(EQUAL_WEIGHT_CONFIG)],
    ["current-config", rankLegacyCurrent],
    ["proposed-config", createMatcherRanker(proposedConfig)],
  ];
  const strategies = strategyRankers.map(([name, ranker]) =>
    evaluateNamedStrategy(name, scenarios, ranker));
  const proposed = strategies.find((strategy) => strategy.name === "proposed-config")!;
  const current = strategies.find((strategy) => strategy.name === "current-config")!;
  const strongestSingle = Math.max(
    ...strategies
      .filter((strategy) => strategy.name === "nearest-eligible" || strategy.name === "highest-trust")
      .map((strategy) => strategy.metrics.successfulOnTimeRate),
  );
  const weightPerturbationStability = topChoiceStability(scenarios, proposedConfig);
  const urgencyNonRegression = proposed.slices.urgency.every((slice) => {
    const baselines = strategies
      .filter((strategy) => strategy.name === "nearest-eligible" || strategy.name === "highest-trust")
      .flatMap((strategy) => strategy.slices.urgency)
      .filter((candidateSlice) => candidateSlice.key === slice.key);
    const strongest = Math.max(...baselines.map((candidateSlice) => candidateSlice.metrics.successfulOnTimeRate));
    return slice.metrics.successfulOnTimeRate >= strongest;
  });
  const proposedRanker = strategyRankers.find(([name]) => name === "proposed-config")![1];
  const proposedVector = successfulOnTimeVector(scenarios, proposedRanker);
  const pairedDifferences = strategyRankers
    .filter(([name]) => name !== "proposed-config")
    .map(([name, ranker]) => {
      const baselineVector = successfulOnTimeVector(scenarios, ranker);
      const differences = proposedVector.map((value, index) => value - baselineVector[index]);
      return {
        baseline: name as Exclude<StrategyName, "proposed-config">,
        meanDifference: average(differences),
        interval: bootstrapMeanInterval(
          differences,
          BOOTSTRAP_SEED ^ [...name].reduce((hash, character) => hash + character.charCodeAt(0), 0),
        ),
      };
    });

  return {
    evaluationVersion: EVALUATION_VERSION,
    generatorVersion: GENERATOR_VERSION,
    generatorSeed,
    bootstrapSeed: BOOTSTRAP_SEED,
    scenarioCount: scenarios.length,
    generatedAt: "deterministic",
    algorithmVersion: proposedConfig.algorithmVersion,
    configVersion: proposedConfig.configVersion,
    config: proposedConfig,
    weightPerturbationStability,
    pairedDifferences,
    strategies,
    urgencyTargets: proposedConfig.urgencyTargetMinutes,
    acceptanceCriteria: {
      zeroEligibilityViolations: proposed.metrics.eligibilityViolations === 0,
      ndcgAtLeast085: proposed.metrics.ndcgAt5 >= 0.85,
      regretAtMost010: proposed.metrics.normalizedRegret <= 0.1,
      noWorseThanCurrent:
        proposed.metrics.successfulOnTimeRate >= current.metrics.successfulOnTimeRate,
      beatsStrongestSingleByFivePercent:
        proposed.metrics.successfulOnTimeRate >= strongestSingle * 1.05,
      urgencySliceNonRegression: urgencyNonRegression,
      weightStabilityAtLeast075: weightPerturbationStability >= 0.75,
    },
  };
}
