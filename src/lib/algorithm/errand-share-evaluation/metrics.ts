import { haversineKm } from "../geo";
import {
  DEFAULT_ERRAND_SHARE_CONFIG,
  rankSharePartners,
  type ShareRejectionReason,
  type ShareTask,
} from "../errand-share";
import type { Urgency } from "../types";
import {
  DEFAULT_ERRAND_SHARE_SCENARIO_COUNT,
  DEFAULT_ERRAND_SHARE_SEED,
  ERRAND_SHARE_GENERATOR_VERSION,
  generateErrandShareScenarios,
} from "./generator";
import type {
  ErrandShareEvaluationReport,
  SimulatedErrand,
  UrgencySlice,
} from "./types";

const EVALUATION_VERSION = "errand-share-evaluation-v1";
const URGENCIES: Urgency[] = ["express", "normal", "low"];

function round(value: number): number {
  return Number(value.toFixed(6));
}

function directDistance(task: ShareTask): number {
  return haversineKm(task.pickup, task.dropoff);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortKeys(item)]),
    );
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

function emptySlice(): UrgencySlice {
  return { scenarios: 0, eligible: 0, paired: 0, pairingRate: 0 };
}

export function evaluateErrandSharing(options: {
  seed?: number;
  count?: number;
} = {}): ErrandShareEvaluationReport {
  const seed = options.seed ?? DEFAULT_ERRAND_SHARE_SEED;
  const count = options.count ?? DEFAULT_ERRAND_SHARE_SCENARIO_COUNT;
  const scenarios = generateErrandShareScenarios({ seed, count });
  const scenarioById = new Map(scenarios.map((scenario) => [scenario.task.id, scenario]));
  const waiting = new Map<string, SimulatedErrand>();
  const pairedIds = new Set<string>();
  const rejectionReasons: Partial<Record<ShareRejectionReason, number>> = {};
  const urgencySlices = Object.fromEntries(
    URGENCIES.map((value) => [value, emptySlice()]),
  ) as Record<Urgency, UrgencySlice>;
  let noSharingBaselineKm = 0;
  let sharedRouteKm = 0;
  let pairCount = 0;
  let detourSumKm = 0;
  let detourSamples = 0;
  let maximumDetourKm = 0;
  let deadlineViolations = 0;
  let detourViolations = 0;

  for (const scenario of scenarios) {
    const { task } = scenario;
    const directKm = directDistance(task);
    noSharingBaselineKm += directKm;
    sharedRouteKm += directKm;
    urgencySlices[task.urgency].scenarios += 1;
    if (task.urgency === "express") continue;
    urgencySlices[task.urgency].eligible += 1;

    for (const [waitingId, waitingScenario] of waiting) {
      if (waitingScenario.task.windowEndsAt <= task.createdAt) waiting.delete(waitingId);
    }
    const decisions = rankSharePartners(
      task,
      [...waiting.values()].map((value) => value.task),
      task.createdAt,
      DEFAULT_ERRAND_SHARE_CONFIG,
    );
    for (const decision of decisions) {
      if (!decision.accepted) {
        rejectionReasons[decision.reason] = (rejectionReasons[decision.reason] ?? 0) + 1;
      }
    }
    const accepted = decisions.find((decision) => decision.accepted);
    if (!accepted || !accepted.accepted) {
      waiting.set(task.id, scenario);
      continue;
    }

    const partnerId = accepted.taskIds.find((id) => id !== task.id);
    const partner = partnerId ? scenarioById.get(partnerId) : null;
    if (!partner) throw new Error("Accepted simulation pair omitted its partner");
    waiting.delete(partner.task.id);
    pairedIds.add(task.id);
    pairedIds.add(partner.task.id);
    pairCount += 1;
    sharedRouteKm -= directDistance(task) + directDistance(partner.task);
    sharedRouteKm += accepted.metrics.sharedDistanceKm;

    for (const memberId of accepted.taskIds) {
      const memberTask = scenarioById.get(memberId)?.task;
      const memberMetrics = accepted.metrics.taskMetrics[memberId];
      if (!memberTask || !memberMetrics) throw new Error("Pair metrics omitted a member");
      detourSumKm += memberMetrics.detourKm;
      detourSamples += 1;
      maximumDetourKm = Math.max(maximumDetourKm, memberMetrics.detourKm);
      const ratioViolation =
        memberMetrics.directDistanceKm >=
          DEFAULT_ERRAND_SHARE_CONFIG.minimumDirectDistanceForRatioKm &&
        (memberMetrics.detourRatio ?? 0) > DEFAULT_ERRAND_SHARE_CONFIG.maxDetourRatio + 1e-9;
      if (
        ratioViolation ||
        memberMetrics.detourKm > DEFAULT_ERRAND_SHARE_CONFIG.maxDetourKm + 1e-9
      ) {
        detourViolations += 1;
      }
      if (
        memberTask.deadlineAt != null &&
        memberMetrics.predictedCompletionAt > memberTask.deadlineAt
      ) {
        deadlineViolations += 1;
      }
    }
  }

  for (const pairedId of pairedIds) {
    const scenario = scenarioById.get(pairedId);
    if (scenario) urgencySlices[scenario.task.urgency].paired += 1;
  }
  for (const value of URGENCIES) {
    const slice = urgencySlices[value];
    slice.pairingRate = slice.eligible > 0 ? round(slice.paired / slice.eligible) : 0;
  }

  const eligibleErrands = scenarios.filter((scenario) => scenario.task.urgency !== "express").length;
  const pairedScenarios = scenarios.filter((scenario) => pairedIds.has(scenario.task.id));
  const distanceSavedKm = Math.max(0, noSharingBaselineKm - sharedRouteKm);
  const pairedErrands = pairedIds.size;
  const hardConstraintViolations = deadlineViolations + detourViolations;
  if (hardConstraintViolations > 0) {
    throw new Error(
      `Errand-Share evaluation rejected ${hardConstraintViolations} accepted route constraint violation(s)`,
    );
  }
  return {
    evidence: "simulated",
    evaluationVersion: EVALUATION_VERSION,
    generatorVersion: ERRAND_SHARE_GENERATOR_VERSION,
    algorithmVersion: DEFAULT_ERRAND_SHARE_CONFIG.algorithmVersion,
    configVersion: DEFAULT_ERRAND_SHARE_CONFIG.configVersion,
    seed,
    scenarioCount: scenarios.length,
    metrics: {
      eligibleErrands,
      pairedErrands,
      pairCount,
      pairingRate: eligibleErrands > 0 ? round(pairedErrands / eligibleErrands) : 0,
      noSharingBaselineKm: round(noSharingBaselineKm),
      sharedRouteKm: round(sharedRouteKm),
      distanceSavedKm: round(distanceSavedKm),
      distanceSavingRate:
        noSharingBaselineKm > 0 ? round(distanceSavedKm / noSharingBaselineKm) : 0,
      meanDetourKm: detourSamples > 0 ? round(detourSumKm / detourSamples) : 0,
      maximumDetourKm: round(maximumDetourKm),
      deadlineViolations,
      detourViolations,
      hardConstraintViolations,
      simulatedCancellationRate:
        pairedScenarios.length > 0
          ? round(pairedScenarios.filter((scenario) => scenario.simulatedCancellation).length / pairedScenarios.length)
          : 0,
      simulatedCompletionRate:
        pairedScenarios.length > 0
          ? round(pairedScenarios.filter((scenario) => scenario.simulatedCompletion).length / pairedScenarios.length)
          : 0,
      urgencySlices,
      rejectionReasons,
    },
    limitation:
      "Deterministic simulation supports repeatable engineering validation only; production outcomes are required for real-world claims.",
  };
}
