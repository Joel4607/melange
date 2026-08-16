import type { ShareRejectionReason, ShareTask } from "../errand-share";
import type { Urgency } from "../types";

export interface SimulatedErrand {
  task: ShareTask;
  simulatedCancellation: boolean;
  simulatedCompletion: boolean;
}

export interface UrgencySlice {
  scenarios: number;
  eligible: number;
  paired: number;
  pairingRate: number;
}

export interface ErrandShareEvaluationMetrics {
  eligibleErrands: number;
  pairedErrands: number;
  pairCount: number;
  pairingRate: number;
  noSharingBaselineKm: number;
  sharedRouteKm: number;
  distanceSavedKm: number;
  distanceSavingRate: number;
  meanDetourKm: number;
  maximumDetourKm: number;
  deadlineViolations: number;
  detourViolations: number;
  hardConstraintViolations: number;
  simulatedCancellationRate: number;
  simulatedCompletionRate: number;
  urgencySlices: Record<Urgency, UrgencySlice>;
  rejectionReasons: Partial<Record<ShareRejectionReason, number>>;
}

export interface ErrandShareEvaluationReport {
  evidence: "simulated";
  evaluationVersion: string;
  generatorVersion: string;
  algorithmVersion: string;
  configVersion: string;
  seed: number;
  scenarioCount: number;
  metrics: ErrandShareEvaluationMetrics;
  limitation: string;
}
