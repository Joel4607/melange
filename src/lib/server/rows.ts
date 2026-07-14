/**
 * Minimal row types for the tables the wiring layer reads/writes. The project
 * has no generated Supabase types, so these are hand-written and intentionally
 * partial — only the columns the server functions actually touch. `numeric`
 * columns arrive as strings (the driver preserves precision), hence the
 * `string` types for money fields.
 */
import type { Urgency } from "@/lib/algorithm";

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

export interface TaskRow {
  id: string;
  buyer_id: string;
  title: string;
  category: string | null;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  urgency: Urgency;
  price: string;
  fee: string;
  payment_reference: string | null;
  status: TaskStatus;
  selected_runner_id: string | null;
  accepted_at: string | null;
  completed_at: string | null;
}

export interface RunnerProfileRow {
  user_id: string;
  current_lat: number | null;
  current_lng: number | null;
  is_available: boolean;
  active_load: number;
  trust_score: number;
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
  type: "hold" | "release" | "refund" | "topup" | "payout";
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
  status: VerificationStatus;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
}
