/**
 * Minimal row types for the tables the wiring layer reads/writes. The project
 * has no generated Supabase types, so these are hand-written and intentionally
 * partial — only the columns the server functions actually touch. `numeric`
 * columns arrive as strings (the driver preserves precision), hence the
 * `string` types for money fields.
 */
import type { Urgency, TaskStop } from "@/lib/algorithm";

export type TaskStatus =
  | "posted"
  | "matched"
  | "accepted"
  | "in_progress"
  | "completed"
  | "disputed"
  | "resolved"
  | "cancelled";

export type DisputeStatus = "open" | "auto_resolved" | "escalated" | "resolved";
export type DisputeResolutionDb = "refund" | "release" | "partial";
export type VerificationStatus = "pending" | "approved" | "rejected";
export type ShareState = "ineligible" | "waiting" | "paired" | "released";
export type ShareGroupStatus =
  | "posted"
  | "awaiting_funding"
  | "offered"
  | "accepted"
  | "in_progress"
  | "completed"
  | "dissolved";

export interface TaskRow {
  id: string;
  buyer_id: string;
  title: string;
  description?: string | null;
  category: string | null;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  stops?: TaskStop[] | null;
  recurrence?: "none" | "daily" | "weekly" | "monthly" | null;
  recurrence_end_date?: string | null;
  parent_task_id?: string | null;
  series_number?: number;
  urgency: Urgency;
  price: string;
  fee: string;
  payment_reference: string | null;
  status: TaskStatus;
  active_match_run_id: string | null;
  selected_runner_id: string | null;
  accepted_at: string | null;
  completed_at: string | null;
  share_state: ShareState;
  share_window_ends_at: string | null;
  share_released_at: string | null;
  share_group_id: string | null;
  delivery_deadline_at: string | null;
}

export interface ErrandShareGroupRow {
  id: string;
  status: ShareGroupStatus;
  ordered_route: unknown;
  algorithm_version: string;
  config_version: string;
  config: unknown;
  predicted_solo_km: number;
  predicted_shared_km: number;
  predicted_saved_km: number;
  stricter_deadline_at: string | null;
  confirmation_deadline_at: string;
  selected_runner_id: string | null;
  active_match_run_id: string | null;
  offered_at: string | null;
  accepted_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  dissolved_at: string | null;
  dissolution_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ErrandShareMemberRow {
  group_id: string;
  task_id: string;
  pickup_position: number;
  dropoff_position: number;
  direct_distance_km: number;
  carried_distance_km: number;
  detour_km: number;
  detour_ratio: number | null;
  predicted_completion_at: string;
  escrow_confirmed_at: string | null;
  completed_at: string | null;
}

export interface ErrandShareDecisionRow {
  id: string;
  task_a_id: string;
  task_b_id: string;
  accepted: boolean;
  reason: string | null;
  algorithm_version: string;
  config_version: string;
  config: unknown;
  metrics: unknown;
  deadline_met: boolean | null;
  evaluated_at: string;
}

export interface ErrandShareMatchRunRow {
  id: string;
  group_id: string;
  outcome: "matched" | "no_candidates";
  source: "automatic" | "manual" | "self_claim";
  algorithm_version: string;
  config_version: string;
  config: unknown;
  candidate_count: number;
  generated_at: string;
}

export interface ErrandShareMatchCandidateRow {
  match_run_id: string;
  runner_id: string;
  rank: number;
  match_score: number;
  proximity: number;
  trust: number;
  capacity: number;
  urgency_fit: number;
  distance_km: number;
}

export interface ErrandShareMatchOutcomeRow {
  id: string;
  match_run_id: string;
  group_id: string;
  runner_id: string;
  offered_at: string;
  responded_at: string | null;
  accepted: boolean;
  declined: boolean;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RunnerProfileRow {
  user_id: string;
  current_lat: number | null;
  current_lng: number | null;
  is_available: boolean;
  active_load: number;
  trust_score: number;
  verified: boolean;
  status: "active" | "suspended" | "quarantined";
  capabilities: string[] | null;
  available_manual: boolean | null;
  scheduled_hours: { day: number; start: string; end: string }[] | null;
}

export interface TrustEventRow {
  runner_id: string;
  type: string;
  value: number;
  created_at: string;
}

export interface WalletRow {
  user_id: string;
  balance: string;
  held: string;
}

export interface LedgerRow {
  id: string;
  task_id: string | null;
  user_id: string;
  type: "hold" | "release" | "refund" | "topup" | "payout" | "tip" | "tip_charge";
  amount: string;
  created_at: string;
}

export interface ProofRow {
  gps_lat: number | null;
  gps_lng: number | null;
}

export interface DisputeRow {
  id: string;
  task_id: string;
  reason: string;
  status: DisputeStatus;
  created_at: string;
}

export interface FraudFlagRow {
  id: string;
  runner_id: string;
  task_id: string | null;
  rule_type: string;
  severity: number;
  status: "active" | "cleared" | "confirmed";
  detail: string | null;
  created_at: string;
}

export interface VerificationRequestRow {
  id: string;
  user_id: string;
  front_photo_path: string;
  back_photo_path: string | null;
  phone: string | null;
  email: string | null;
  legal_name: string | null;
  date_of_birth: string | null;
  ghana_card_number: string | null;
  residential_address: string | null;
  selfie_photo_path: string | null;
  vehicle_license_photo_path: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  status: VerificationStatus;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
}
