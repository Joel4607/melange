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

export interface TaskRow {
  id: string;
  buyer_id: string;
  category: string | null;
  pickup_lat: number;
  pickup_lng: number;
  urgency: Urgency;
  price: string;
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

export interface ProofRow {
  gps_lat: number | null;
  gps_lng: number | null;
}

export interface DisputeRow {
  id: string;
  task_id: string;
  reason: string;
  status: DisputeStatus;
}

export interface FraudFlagRow {
  id: string;
}
