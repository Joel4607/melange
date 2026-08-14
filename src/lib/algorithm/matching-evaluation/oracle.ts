import type { TaskRequest } from "../types";
import type { OracleAssessment, SimulatedRunner } from "./types";

const TARGET_MINUTES = { express: 15, normal: 35, low: 60 } as const;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

function isEligible(task: TaskRequest, runner: SimulatedRunner): boolean {
  const candidate = runner.candidate;
  return Boolean(
    candidate.available &&
      candidate.active &&
      candidate.verified &&
      candidate.fraudAction !== "exclude" &&
      candidate.location &&
      Number.isFinite(candidate.trust) &&
      Number.isFinite(candidate.activeLoad) &&
      candidate.activeLoad >= 0 &&
      (!task.category ||
        !candidate.capabilities ||
        candidate.capabilities.length === 0 ||
        candidate.capabilities.includes(task.category)),
  );
}

export function oracleUtility(task: TaskRequest, runner: SimulatedRunner): number {
  if (!isEligible(task, runner)) return 0;
  const assessment = assessOracleOutcome(task, runner);
  return assessment.utility;
}

export function assessOracleOutcome(
  task: TaskRequest,
  runner: SimulatedRunner,
): OracleAssessment {
  if (!isEligible(task, runner)) {
    return {
      utility: 0,
      acceptanceProbability: 0,
      completionProbability: 0,
      cancellationProbability: 1,
      disputeProbability: 0,
      pickupMinutes: Infinity,
      onTime: false,
      accepted: false,
      completed: false,
      cancelled: true,
      disputed: false,
      successfulOnTime: false,
    };
  }

  const { candidate, hidden, draws, distanceKm } = runner;
  const pickupMinutes =
    (distanceKm / hidden.travelSpeedKmh) * 60 +
    candidate.activeLoad * (5 + 4 * (1 - hidden.responseTendency));
  const target = TARGET_MINUTES[task.urgency];
  const urgencyPressure = task.urgency === "express" ? 1.2 : task.urgency === "normal" ? 0.5 : 0;
  const acceptanceProbability = sigmoid(
    -0.1 +
      2.1 * hidden.responseTendency +
      0.8 * hidden.categoryProficiency -
      0.11 * distanceKm -
      0.38 * candidate.activeLoad -
      urgencyPressure * Math.max(0, pickupMinutes - target) / target,
  );
  const cancellationProbability = clamp01(
    hidden.cancellationTendency + candidate.activeLoad * 0.045 + Math.max(0, pickupMinutes - target) * 0.004,
  );
  const completionProbability = clamp01(
    hidden.completionReliability * 0.72 +
      hidden.categoryProficiency * 0.28 -
      cancellationProbability * 0.35,
  );
  const disputeProbability = clamp01(
    0.02 + (1 - hidden.categoryProficiency) * 0.15 + (1 - hidden.completionReliability) * 0.08,
  );
  const onTimeProbability = sigmoid((target - pickupMinutes) / Math.max(4, target * 0.18));
  const utility = clamp01(
    acceptanceProbability *
      completionProbability *
      (1 - cancellationProbability) *
      onTimeProbability *
      (1 - disputeProbability * 0.5),
  );
  const accepted = draws.acceptance < acceptanceProbability;
  const cancelled = accepted && draws.cancellation < cancellationProbability;
  const completed = accepted && !cancelled && draws.completion < completionProbability;
  const disputed = completed && draws.dispute < disputeProbability;
  const onTime = pickupMinutes <= target;

  return {
    utility,
    acceptanceProbability,
    completionProbability,
    cancellationProbability,
    disputeProbability,
    pickupMinutes,
    onTime,
    accepted,
    completed,
    cancelled,
    disputed,
    successfulOnTime: completed && onTime,
  };
}
