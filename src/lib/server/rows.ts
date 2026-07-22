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

export type ListingStatus = "active" | "sold" | "paused" | "suspended";
export type ListingCondition = "new" | "used_like_new" | "used_good" | "used_fair";
export type DeliveryOption = "pickup" | "runner_delivery" | "seller_delivery";
export type ListingOrderStatus =
  | "pending_payment"
  | "paid"
  | "ready_for_pickup"
  | "in_delivery"
  | "delivered"
  | "completed"
  | "disputed"
  | "cancelled"
  | "refunded";

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
  listing_order_id: string | null;
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
  verified: boolean;
  status: "active" | "suspended" | "quarantined";
  capabilities: string[] | null;
  available_manual: boolean | null;
  scheduled_hours: { day: number; start: string; end: string }[] | null;
}

export interface ProfileRow {
  id: string;
  name: string | null;
  phone: string | null;
  verified: boolean;
  is_admin: boolean;
  is_seller: boolean;
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
  listing_order_id: string | null;
  user_id: string;
  type:
    | "hold"
    | "release"
    | "refund"
    | "topup"
    | "payout"
    | "market_hold"
    | "market_release"
    | "market_payout"
    | "market_delivery_payout"
    | "market_refund";
  amount: string;
  created_at: string;
}

export interface ProofRow {
  gps_lat: number | null;
  gps_lng: number | null;
}

export interface DisputeRow {
  id: string;
  task_id: string | null;
  listing_order_id: string | null;
  raised_by: string;
  reason: string;
  status: DisputeStatus;
  resolution: DisputeResolutionDb | null;
  created_at: string;
  resolved_at: string | null;
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

export interface ListingRow {
  id: string;
  seller_id: string;
  title: string;
  description: string | null;
  category: string;
  condition: ListingCondition;
  price: string;
  stock: number;
  photos: string[];
  contact_info: string | null;
  location_lat: number;
  location_lng: number;
  delivery_options: DeliveryOption[];
  seller_delivery_fee: string;
  status: ListingStatus;
  created_at: string;
  updated_at: string;
  seller_name?: string | null;
  seller_verified?: boolean;
  distance?: number | null;
}

export interface ListingOrderRow {
  id: string;
  listing_id: string;
  seller_id: string;
  buyer_id: string;
  price: string;
  delivery_fee: string;
  platform_fee: string;
  delivery_option: DeliveryOption;
  status: ListingOrderStatus;
  pickup_code: string | null;
  delivery_task_id: string | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  delivery_notes: string | null;
  buyer_confirmed_at: string | null;
  seller_rated: boolean;
  buyer_rated: boolean;
  created_at: string;
  updated_at: string;
  listing_title?: string | null;
  seller_name?: string | null;
  buyer_name?: string | null;
}

export interface ListingOrderEventRow {
  id: string;
  listing_order_id: string;
  actor_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface RatingRow {
  id: string;
  task_id: string | null;
  listing_order_id: string | null;
  rater_id: string;
  ratee_id: string;
  stars: number;
  comment: string | null;
  created_at: string;
}
