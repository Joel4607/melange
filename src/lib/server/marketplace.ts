import { getServiceClient } from "@/lib/supabase/service";
import { estimateFee } from "@/lib/pricing";
import { haversineKm, type GeoPoint, type Urgency } from "@/lib/algorithm";
import type { ListingOrderRow } from "./rows";

const PLATFORM_FEE_RATE = 0.05;
const PLATFORM_FEE_MIN = 1.0;

export interface MarketplaceFeeEstimate {
  price: number;
  deliveryFee: number;
  platformFee: number;
  total: number;
  sellerPayout: number;
}

export function computeMarketplaceFees(
  price: number,
  sellerDeliveryFee: number,
  deliveryOption: "pickup" | "seller_delivery" | "runner_delivery",
  sellerLocation: GeoPoint,
  buyerLocation: GeoPoint | null,
  urgency: Urgency,
): MarketplaceFeeEstimate {
  let deliveryFee = 0;

  if (deliveryOption === "runner_delivery" && buyerLocation) {
    const distanceKm = haversineKm(sellerLocation, buyerLocation);
    deliveryFee = estimateFee(distanceKm, urgency);
  } else if (deliveryOption === "seller_delivery") {
    deliveryFee = Math.max(0, sellerDeliveryFee);
  }

  let platformFee = 0;
  if (price > 0) {
    platformFee = Math.max(price * PLATFORM_FEE_RATE, PLATFORM_FEE_MIN);
    platformFee = Math.round(platformFee * 100) / 100;
  }

  const total = price + deliveryFee;
  const sellerPayout = Math.max(0, price - platformFee) + (deliveryOption === "seller_delivery" ? deliveryFee : 0);

  return {
    price,
    deliveryFee,
    platformFee,
    total,
    sellerPayout,
  };
}

export async function marketHoldFunds(orderId: string): Promise<void> {
  const db = getServiceClient();
  const { error } = await db.rpc("market_hold_funds", { p_listing_order_id: orderId });
  if (error) throw new Error(`marketplace escrow: ${error.message}`);
}

export async function marketReleaseFunds(orderId: string): Promise<void> {
  const db = getServiceClient();
  const { error } = await db.rpc("market_release_funds", { p_listing_order_id: orderId });
  if (error) throw new Error(`marketplace escrow: ${error.message}`);
}

export async function marketRefundFunds(orderId: string): Promise<void> {
  const db = getServiceClient();
  const { error } = await db.rpc("market_refund_funds", { p_listing_order_id: orderId });
  if (error) throw new Error(`marketplace escrow: ${error.message}`);
}

export function generatePickupCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function recordOrderEvent(
  orderId: string,
  actorId: string,
  eventType: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const db = getServiceClient();
  const { error } = await db.from("listing_order_events").insert({
    listing_order_id: orderId,
    actor_id: actorId,
    event_type: eventType,
    payload,
  });
  if (error) throw new Error(`marketplace event: ${error.message}`);
}

export async function signedMarketplaceUrls(paths: string[]): Promise<string[]> {
  const db = getServiceClient();
  const urls: string[] = [];
  for (const path of paths) {
    const { data } = await db.storage.from("marketplace").createSignedUrl(path, 60 * 5);
    urls.push(data?.signedUrl ?? "");
  }
  return urls;
}

export async function requireMarketplaceOrder(
  orderId: string,
  userId: string,
): Promise<ListingOrderRow> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("listing_orders")
    .select(
      "id, listing_id, seller_id, buyer_id, price, delivery_fee, platform_fee, delivery_option, status, pickup_code, delivery_task_id, delivery_lat, delivery_lng, delivery_notes, buyer_confirmed_at, seller_rated, buyer_rated, created_at, updated_at",
    )
    .eq("id", orderId)
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .maybeSingle<ListingOrderRow>();
  if (error) throw new Error(`marketplace: ${error.message}`);
  if (!data) throw new Error("marketplace: order not found");
  return data;
}
