/**
 * Shared types for the trust framework algorithm module.
 *
 * This module is intentionally framework-agnostic: it contains pure functions
 * (inputs -> scores/decisions) with no database, network, or Next.js imports,
 * so it can be unit-tested and reasoned about in isolation. It is the core
 * technical contribution of the project.
 */

/** A WGS84 geographic coordinate. */
export interface GeoPoint {
  lat: number;
  lng: number;
}

/** Task urgency selected by the buyer. */
export type Urgency = "low" | "normal" | "express";

// ---------------------------------------------------------------------------
// Trust model
// ---------------------------------------------------------------------------

export type TrustEventType =
  | "completed"
  | "cancelled"
  | "rating"
  | "responsiveness"
  | "dispute_lost";

/**
 * A single behavioural event used to compute a runner's trust score.
 * `value` semantics depend on `type`:
 *  - "completed" / "cancelled" / "dispute_lost": 1 (occurrence)
 *  - "rating": star rating in [1, 5]
 *  - "responsiveness": a per-task readiness score in [0, 1]
 */
export interface TrustEvent {
  type: TrustEventType;
  value: number;
  /** Event time in Unix milliseconds. */
  at: number;
}

export interface TrustWeights {
  completion: number;
  dispute: number;
  rating: number;
  responsiveness: number;
}

export interface TrustConfig {
  /** Component weights; should sum to 1. */
  weights: TrustWeights;
  /** Exponential time-decay half-life, in days. */
  halfLifeDays: number;
  /** Bayesian cold-start prior (pseudo-counts) for completion rate. */
  prior: {
    /** Prior successes. */
    alpha: number;
    /** Prior failures. */
    beta: number;
    /** Extra prior successes granted to verified runners. */
    verifiedBonus: number;
  };
  /** How strongly an aggregated fraud risk reduces the final trust score. */
  fraudPenaltyWeight: number;
}

export interface TrustInputs {
  events: TrustEvent[];
  /** Whether the runner passed lightweight verification. */
  verified: boolean;
  /** Aggregated fraud risk in [0, 1] from the fraud module (optional). */
  fraudRisk?: number;
  /** Evaluation time in Unix milliseconds. */
  now: number;
}

export interface TrustBreakdown {
  trust: number;
  completionRate: number;
  disputeRate: number;
  ratingNorm: number;
  responsiveness: number;
  fraudRisk: number;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

export interface RunnerCandidate {
  runnerId: string;
  location: GeoPoint;
  /** Trust score in [0, 1], typically produced by the trust module. */
  trust: number;
  /** Number of tasks the runner is currently committed to. */
  activeLoad: number;
  available: boolean;
  /** Task categories the runner can handle; omit/empty = any. */
  capabilities?: string[];
}

export interface TaskRequest {
  pickup: GeoPoint;
  category?: string;
  urgency: Urgency;
}

export interface MatchWeights {
  proximity: number;
  trust: number;
  availability: number;
  urgency: number;
}

export interface MatchConfig {
  /** Component weights; should sum to 1. */
  weights: MatchWeights;
  /** Distance scale (km) for the proximity transform exp(-d / d0). */
  distanceScaleKm: number;
}

export interface MatchComponents {
  proximity: number;
  trust: number;
  availability: number;
  urgencyFit: number;
  distanceKm: number;
}

export interface MatchResult {
  runnerId: string;
  rank: number;
  matchScore: number;
  components: MatchComponents;
}

// ---------------------------------------------------------------------------
// Fraud detection
// ---------------------------------------------------------------------------

export type FraudRuleType =
  | "gps_mismatch"
  | "impossible_speed"
  | "rapid_cancellations"
  | "repeated_pair_disputes";

export interface FraudContext {
  /** Proof geolocation captured at completion, if a proof was submitted. */
  proofLocation?: GeoPoint;
  /** The task location the proof is checked against. */
  taskLocation?: GeoPoint;
  /** Straight-line task distance (km) for the speed check. */
  taskDistanceKm?: number;
  acceptedAt?: number;
  completedAt?: number;
  /** Cancellations by this runner within the configured window. */
  recentCancellations?: number;
  /** Disputes between this runner and the same counterparty. */
  disputesWithSameCounterparty?: number;
}

export interface FraudConfig {
  /** Max allowed distance (km) between proof and task location. */
  gpsToleranceKm: number;
  /** Max physically plausible average speed (km/h). */
  maxSpeedKmh: number;
  /** Cancellation count that trips the rapid-cancellation rule. */
  cancellationThreshold: number;
  /** Repeated-pair dispute count that trips the collusion rule. */
  pairDisputeThreshold: number;
  /** Per-rule severities contributing to the aggregated risk score. */
  severities: Record<FraudRuleType, number>;
  /** Aggregated-risk threshold for a soft penalty. */
  softThreshold: number;
  /** Aggregated-risk threshold for hard exclusion + escalation. */
  hardThreshold: number;
}

export interface FraudFinding {
  ruleType: FraudRuleType;
  triggered: boolean;
  severity: number;
  detail: string;
}

export type FraudAction = "clear" | "penalize" | "exclude";

export interface FraudResult {
  findings: FraudFinding[];
  /** Aggregated risk in [0, 1]. */
  risk: number;
  action: FraudAction;
  /** Whether the case should be escalated to a human admin. */
  escalate: boolean;
}

// ---------------------------------------------------------------------------
// Dispute arbitration
// ---------------------------------------------------------------------------

export type DisputeClaim =
  | "not_delivered"
  | "wrong_item"
  | "damaged"
  | "other";

export interface DisputeContext {
  proofProvided: boolean;
  /** Whether proof GPS matched the task location (null when no proof). */
  gpsMatch: boolean | null;
  buyerClaim: DisputeClaim;
  /** Runner is under a hard fraud flag. */
  fraudFlagged: boolean;
}

export type DisputeResolution = "refund" | "release" | "partial";

export interface ArbitrationConfig {
  /** Confidence below which the engine escalates to a human admin. */
  escalationConfidence: number;
}

export interface ArbitrationResult {
  resolution: DisputeResolution | null;
  decidedBy: "system" | "admin";
  escalate: boolean;
  confidence: number;
  ruleMatched: string;
  /** A non-binding action suggested to the admin when escalated. */
  suggestedAction: DisputeResolution | null;
}
