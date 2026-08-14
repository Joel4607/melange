import type { MatchConfig, RunnerCandidate, TaskRequest, Urgency } from "../types";

export const EVALUATION_VERSION = "matching-evaluation-v1";
export const GENERATOR_VERSION = "matching-generator-v1";
export const CALIBRATION_SEED = 20260814;
export const FINAL_SEED = 20260815;
export const BOOTSTRAP_SEED = 20260816;
export const DEFAULT_SCENARIO_COUNT = 5000;

export interface HiddenRunnerProfile {
  responseTendency: number;
  categoryProficiency: number;
  travelSpeedKmh: number;
  completionReliability: number;
  cancellationTendency: number;
}

export interface OutcomeDraws {
  acceptance: number;
  completion: number;
  cancellation: number;
  dispute: number;
}

export interface SimulatedRunner {
  candidate: RunnerCandidate;
  hidden: HiddenRunnerProfile;
  draws: OutcomeDraws;
  distanceKm: number;
}

export interface SimulatedScenario {
  id: string;
  task: TaskRequest;
  candidates: SimulatedRunner[];
}

export interface GeneratorOptions {
  seed: number;
  count: number;
}

export interface OracleAssessment {
  utility: number;
  acceptanceProbability: number;
  completionProbability: number;
  cancellationProbability: number;
  disputeProbability: number;
  pickupMinutes: number;
  onTime: boolean;
  accepted: boolean;
  completed: boolean;
  cancelled: boolean;
  disputed: boolean;
  successfulOnTime: boolean;
}

export type StrategyName =
  | "random-eligible"
  | "nearest-eligible"
  | "highest-trust"
  | "equal-weight"
  | "current-config"
  | "proposed-config";

export interface MetricInterval {
  lower: number;
  upper: number;
}

export interface StrategyMetrics {
  scenarios: number;
  eligibilityViolations: number;
  acceptanceRate: number;
  completionRate: number;
  cancellationRate: number;
  disputeRate: number;
  successfulOnTimeRate: number;
  meanPickupMinutes: number;
  meanDistanceKm: number;
  ndcgAt5: number;
  normalizedRegret: number;
  topThreeOracleCoverage: number;
  coldStartExposure: number;
  selectionConcentration: number;
  successfulOnTimeInterval?: MetricInterval;
}

export interface EvaluationSlice {
  key: string;
  metrics: StrategyMetrics;
}

export interface StrategyEvaluation {
  name: StrategyName;
  metrics: StrategyMetrics;
  slices: {
    urgency: EvaluationSlice[];
    category: EvaluationSlice[];
    candidatePool: EvaluationSlice[];
    distance: EvaluationSlice[];
    activeLoad: EvaluationSlice[];
  };
}

export interface PairedStrategyDifference {
  baseline: Exclude<StrategyName, "proposed-config">;
  meanDifference: number;
  interval: MetricInterval;
}

export interface MatchingEvaluationReport {
  evaluationVersion: string;
  generatorVersion: string;
  generatorSeed: number;
  bootstrapSeed: number;
  scenarioCount: number;
  generatedAt: string;
  algorithmVersion: string;
  configVersion: string;
  config: MatchConfig;
  weightPerturbationStability: number;
  pairedDifferences: PairedStrategyDifference[];
  strategies: StrategyEvaluation[];
  acceptanceCriteria: Record<string, boolean>;
  urgencyTargets: Record<Urgency, number>;
}

export type ScenarioRanker = (scenario: SimulatedScenario) => RunnerCandidate[];
