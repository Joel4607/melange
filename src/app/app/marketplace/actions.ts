"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { topUp, refund as refundTaskFunds } from "@/lib/server/escrow";
import { createNotification } from "@/lib/server/notifications";
import {
  generatePickupCode,
  marketHoldFunds,
  marketReleaseFunds,
  marketRefundFunds,
  recordOrderEvent,
} from "@/lib/server/marketplace";
import { computeMarketplaceFees } from "@/lib/marketplace-fees";
import { estimateFee } from "@/lib/pricing";
import { haversineKm } from "@/lib/algorithm";
import type { ListingRow, ListingOrderRow, DeliveryOption } from "@/lib/server/rows";
import { requireAdmin } from "../admin/actions";
import { MARKETPLACE_CATEGORIES } from "@/lib/marketplace-categories";

const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

const CONDITIONS = ["new", "used_like_new", "used_good", "used_fair"] as const;
const DELIVERY_OPTIONS = ["pickup", "seller_delivery", "runner_delivery"] as const;
const VALID_ORDER_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending_payment: ["paid", "cancelled"],
  paid: ["ready_for_pickup", "in_delivery", "delivered", "cancelled", "disputed"],
  ready_for_pickup: ["delivered", "cancelled", "disputed"],
  in_delivery: ["delivered", "cancelled", "disputed"],
  delivered: ["completed", "disputed"],
  disputed: ["completed", "cancelled", "refunded"],
  completed: [],
  cancelled: [],
  refunded: [],
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function parseNumber(raw: FormDataEntryValue | null): number {
  const v = typeof raw === "string" ? raw.trim() : "";
  return v === "" ? Number.NaN : Number(v);
}

function isFiniteCoordinate(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function fileExtension(file: File): string {
  const ext = ALLOWED_IMAGE_TYPES.get(file.type.toLowerCase());
  if (!ext) throw new Error(`Unsupported image type: ${file.type}`);
  return ext;
}

function assertImageFile(value: FormDataEntryValue | null, label: string): File {
  if (!(value instanceof File) || value.size === 0) {
    throw new Error(`Please upload the ${label} photo`);
  }
  if (value.size > MAX_IMAGE_SIZE) {
    throw new Error(`${label} photo is too large (max ${MAX_IMAGE_SIZE / 1024 / 1024} MB)`);
  }
  if (!ALLOWED_IMAGE_TYPES.has(value.type.toLowerCase())) {
    throw new Error(`${label} photo must be a JPEG, PNG, or WebP image`);
  }
  return value;
}

async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user.id;
}

async function isUserVerified(userId: string): Promise<boolean> {
  const db = getServiceClient();
  const { data: profile } = await db
    .from("profiles")
    .select("verified")
    .eq("id", userId)
    .maybeSingle<{ verified: boolean }>();
  return profile?.verified ?? false;
}

async function requireVerified(userId: string): Promise<void> {
  if (!(await isUserVerified(userId))) {
    redirect("/app/verify");
  }
}

async function requireListingOwner(listingId: string): Promise<ListingRow> {
  const userId = await requireUserId();
  const db = getServiceClient();
  const { data, error } = await db
    .from("listings")
    .select(
      "id, seller_id, title, description, category, condition, price, stock, photos, contact_info, location_lat, location_lng, delivery_options, seller_delivery_fee, status",
    )
    .eq("id", listingId)
    .maybeSingle<ListingRow>();
  if (error) throw new Error(`marketplace: ${error.message}`);
  if (!data) throw new Error("Listing not found");
  if (data.seller_id !== userId) throw new Error("You do not own this listing");
  return data;
}

async function requireMarketplaceOrderParticipant(orderId: string): Promise<ListingOrderRow> {
  const userId = await requireUserId();
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
  if (!data) throw new Error("Order not found");
  return data;
}

async function loadBuyerWalletBalance(userId: string): Promise<number> {
  const db = getServiceClient();
  const { data } = await db
    .from("wallets")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle<{ balance: string }>();
  return data ? Number(data.balance) : 0;
}

async function uploadListingPhotos(sellerId: string, entries: FormDataEntryValue[]): Promise<string[]> {
  const db = getServiceClient();
  const paths: string[] = [];

  for (let i = 0; i < entries.length; i++) {
    const file = assertImageFile(entries[i], `photo ${i + 1}`);
    const path = `${sellerId}/${randomUUID()}.${fileExtension(file)}`;
    const { error } = await db.storage
      .from("marketplace")
      .upload(path, await file.arrayBuffer(), {
        contentType: file.type,
        upsert: false,
      });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    paths.push(path);
  }

  return paths;
}

export async function createListing(formData: FormData) {
  const sellerId = await requireUserId();
  await requireVerified(sellerId);

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const category = String(formData.get("category") ?? "").trim();
  const condition = String(formData.get("condition") ?? "").trim();
  const priceRaw = parseNumber(formData.get("price"));
  const stockRaw = parseNumber(formData.get("stock"));
  const contactInfo = String(formData.get("contact_info") ?? "").trim() || null;
  const lat = parseNumber(formData.get("location_lat"));
  const lng = parseNumber(formData.get("location_lng"));
  const sellerDeliveryFeeRaw = parseNumber(formData.get("seller_delivery_fee"));

  const deliveryOptions: DeliveryOption[] = formData
    .getAll("delivery_options")
    .map((v) => String(v))
    .filter((v): v is DeliveryOption => (DELIVERY_OPTIONS as readonly string[]).includes(v));

  const photoEntries = formData.getAll("photos");

  if (!title) throw new Error("Title is required");
  if (!(MARKETPLACE_CATEGORIES as readonly string[]).includes(category)) throw new Error("Select a valid category");
  if (!(CONDITIONS as readonly string[]).includes(condition)) throw new Error("Select a valid condition");
  if (!Number.isFinite(priceRaw) || priceRaw < 0) throw new Error("Price must be a number");
  if (!Number.isFinite(stockRaw) || stockRaw < 1 || !Number.isInteger(stockRaw)) {
    throw new Error("Stock must be a positive whole number");
  }
  if (!isFiniteCoordinate(lat, lng)) throw new Error("Select a valid location");
  if (deliveryOptions.length === 0) throw new Error("Select at least one delivery option");
  if (deliveryOptions.includes("seller_delivery")) {
    if (!Number.isFinite(sellerDeliveryFeeRaw) || sellerDeliveryFeeRaw < 0) {
      throw new Error("Seller delivery fee must be a number");
    }
  }
  if (photoEntries.length === 0) throw new Error("Upload at least one photo");

  const sellerDeliveryFee = deliveryOptions.includes("seller_delivery") ? sellerDeliveryFeeRaw : 0;
  const photos = await uploadListingPhotos(sellerId, photoEntries);

  const db = getServiceClient();
  const { data: listing, error } = await db
    .from("listings")
    .insert({
      seller_id: sellerId,
      title,
      description,
      category,
      condition,
      price: priceRaw,
      stock: stockRaw,
      photos,
      contact_info: contactInfo,
      location_lat: lat,
      location_lng: lng,
      delivery_options: deliveryOptions,
      seller_delivery_fee: sellerDeliveryFee,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !listing) {
    throw new Error(error?.message ?? "Failed to create listing");
  }

  await db.from("profiles").update({ is_seller: true }).eq("id", sellerId);

  revalidatePath("/app/marketplace");
  revalidatePath("/app");
  redirect(`/app/marketplace/${listing.id}`);
}

export async function updateListing(listingId: string, formData: FormData) {
  const listing = await requireListingOwner(listingId);
  if (listing.status === "sold") throw new Error("Sold listings cannot be edited");

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const category = String(formData.get("category") ?? "").trim();
  const condition = String(formData.get("condition") ?? "").trim();
  const priceRaw = parseNumber(formData.get("price"));
  const stockRaw = parseNumber(formData.get("stock"));
  const contactInfo = String(formData.get("contact_info") ?? "").trim() || null;
  const lat = parseNumber(formData.get("location_lat"));
  const lng = parseNumber(formData.get("location_lng"));
  const sellerDeliveryFeeRaw = parseNumber(formData.get("seller_delivery_fee"));

  const deliveryOptions: DeliveryOption[] = formData
    .getAll("delivery_options")
    .map((v) => String(v))
    .filter((v): v is DeliveryOption => (DELIVERY_OPTIONS as readonly string[]).includes(v));

  if (!title) throw new Error("Title is required");
  if (!(MARKETPLACE_CATEGORIES as readonly string[]).includes(category)) throw new Error("Select a valid category");
  if (!(CONDITIONS as readonly string[]).includes(condition)) throw new Error("Select a valid condition");
  if (!Number.isFinite(priceRaw) || priceRaw < 0) throw new Error("Price must be a number");
  if (!Number.isFinite(stockRaw) || stockRaw < 0 || !Number.isInteger(stockRaw)) {
    throw new Error("Stock must be a positive whole number");
  }
  if (!isFiniteCoordinate(lat, lng)) throw new Error("Select a valid location");
  if (deliveryOptions.length === 0) throw new Error("Select at least one delivery option");
  if (deliveryOptions.includes("seller_delivery")) {
    if (!Number.isFinite(sellerDeliveryFeeRaw) || sellerDeliveryFeeRaw < 0) {
      throw new Error("Seller delivery fee must be a number");
    }
  }

  const sellerDeliveryFee = deliveryOptions.includes("seller_delivery") ? sellerDeliveryFeeRaw : 0;

  const db = getServiceClient();
  const { error } = await db
    .from("listings")
    .update({
      title,
      description,
      category,
      condition,
      price: priceRaw,
      stock: stockRaw,
      contact_info: contactInfo,
      location_lat: lat,
      location_lng: lng,
      delivery_options: deliveryOptions,
      seller_delivery_fee: sellerDeliveryFee,
      updated_at: new Date().toISOString(),
    })
    .eq("id", listingId);

  if (error) throw new Error(`marketplace: ${error.message}`);

  revalidatePath(`/app/marketplace/${listingId}`);
  revalidatePath("/app/marketplace");
  revalidatePath("/app");
}

export async function suspendListing(listingId: string) {
  await requireListingOwner(listingId);
  const db = getServiceClient();
  const { error } = await db
    .from("listings")
    .update({ status: "suspended", updated_at: new Date().toISOString() })
    .eq("id", listingId);
  if (error) throw new Error(`marketplace: ${error.message}`);

  revalidatePath(`/app/marketplace/${listingId}`);
  revalidatePath("/app/marketplace");
  revalidatePath("/app");
}

export async function createOrder(listingId: string, formData: FormData) {
  const buyerId = await requireUserId();
  await requireVerified(buyerId);

  if (!isUuid(listingId)) throw new Error("Invalid listing");

  const db = getServiceClient();
  const { data: listing, error } = await db
    .from("listings")
    .select(
      "id, seller_id, title, price, stock, location_lat, location_lng, delivery_options, seller_delivery_fee, status, photos",
    )
    .eq("id", listingId)
    .eq("status", "active")
    .gt("stock", 0)
    .maybeSingle<ListingRow>();

  if (error) throw new Error(`marketplace: ${error.message}`);
  if (!listing) throw new Error("Listing is no longer available");
  if (listing.seller_id === buyerId) throw new Error("You cannot buy your own listing");

  const deliveryOption = String(formData.get("delivery_option") ?? "").trim() as DeliveryOption;

  if (!listing.delivery_options.includes(deliveryOption)) {
    throw new Error("This delivery option is not available");
  }

  let deliveryLat: number | null = null;
  let deliveryLng: number | null = null;

  if (deliveryOption === "seller_delivery" || deliveryOption === "runner_delivery") {
    deliveryLat = parseNumber(formData.get("delivery_lat"));
    deliveryLng = parseNumber(formData.get("delivery_lng"));
    if (!isFiniteCoordinate(deliveryLat, deliveryLng)) {
      throw new Error("Select a valid delivery location");
    }
  }

  const sellerLocation = { lat: listing.location_lat, lng: listing.location_lng };
  const buyerLocation = deliveryLat != null && deliveryLng != null ? { lat: deliveryLat, lng: deliveryLng } : null;

  let deliveryFee = 0;
  if (deliveryOption === "runner_delivery" && buyerLocation) {
    const distanceKm = haversineKm(sellerLocation, buyerLocation);
    deliveryFee = estimateFee(distanceKm, "normal");
  } else if (deliveryOption === "seller_delivery") {
    deliveryFee = Math.max(0, Number(listing.seller_delivery_fee));
  }

  const fees = computeMarketplaceFees(Number(listing.price), deliveryFee, deliveryOption);

  // Decrement stock first to prevent overselling.
  const { data: stockUpdate, error: stockError } = await db
    .from("listings")
    .update({ stock: listing.stock - 1 })
    .eq("id", listingId)
    .gt("stock", 0)
    .select("stock")
    .maybeSingle<{ stock: number }>();

  if (stockError || !stockUpdate) {
    throw new Error("Listing sold out before order could be placed");
  }

  if (stockUpdate.stock === 0) {
    await db.from("listings").update({ status: "sold" }).eq("id", listingId);
  }

  const { data: order, error: orderError } = await db
    .from("listing_orders")
    .insert({
      listing_id: listingId,
      seller_id: listing.seller_id,
      buyer_id: buyerId,
      price: fees.price,
      delivery_fee: fees.deliveryFee,
      platform_fee: fees.platformFee,
      delivery_option: deliveryOption,
      status: "pending_payment",
      pickup_code: deliveryOption === "pickup" ? generatePickupCode() : null,
      delivery_lat: deliveryLat,
      delivery_lng: deliveryLng,
    })
    .select("id")
    .single<{ id: string }>();

  if (orderError || !order) {
    throw new Error(orderError?.message ?? "Failed to create order");
  }

  const orderId = order.id;
  const listingStock = listing.stock;

  async function rollbackOrder() {
    await db.from("listing_orders").delete().eq("id", orderId);
    await db
      .from("listings")
      .update({ stock: listingStock, status: "active" })
      .eq("id", listingId);
  }

  try {
    if (fees.total > 0) {
      const balance = await loadBuyerWalletBalance(buyerId);
      if (balance < fees.total) {
        await topUp(buyerId, fees.total - balance);
      }
      await marketHoldFunds(orderId);
    }
  } catch (err) {
    await rollbackOrder();
    throw err;
  }

  const { error: paidError } = await db
    .from("listing_orders")
    .update({ status: "paid" })
    .eq("id", orderId)
    .eq("status", "pending_payment");

  if (paidError) {
    await marketRefundFunds(orderId);
    await rollbackOrder();
    throw new Error(`marketplace: ${paidError.message}`);
  }

  // For runner delivery, post a delivery task that a runner can claim.
  if (deliveryOption === "runner_delivery" && buyerLocation) {
    const { data: deliveryTask, error: taskError } = await db
      .from("tasks")
      .insert({
        buyer_id: buyerId,
        title: `Deliver ${listing.title}`,
        description: `Marketplace delivery for order ${orderId}`,
        category: "Marketplace delivery",
        urgency: "normal",
        price: fees.deliveryFee,
        fee: 0,
        pickup_lat: listing.location_lat,
        pickup_lng: listing.location_lng,
        dropoff_lat: deliveryLat,
        dropoff_lng: deliveryLng,
        status: "posted",
      })
      .select("id")
      .single<{ id: string }>();
    if (taskError || !deliveryTask) {
      await marketRefundFunds(orderId);
      await rollbackOrder();
      throw new Error(taskError?.message ?? "Failed to create delivery task");
    }

    await db
      .from("listing_orders")
      .update({ delivery_task_id: deliveryTask.id })
      .eq("id", orderId);
  }

  await recordOrderEvent(orderId, buyerId, "paid", { total: fees.total });
  await createNotification(listing.seller_id, "listing_sold", {
    listing_order_id: orderId,
    listing_title: listing.title,
  });
  await createNotification(buyerId, "listing_purchased", {
    listing_order_id: orderId,
    listing_title: listing.title,
  });

  revalidatePath("/app/marketplace");
  revalidatePath(`/app/marketplace/${listingId}`);
  revalidatePath("/app");
  redirect(`/app/marketplace/orders/${orderId}`);
}

export async function markReadyForPickup(orderId: string) {
  const order = await requireMarketplaceOrderParticipant(orderId);
  if (order.seller_id !== (await requireUserId())) throw new Error("Only the seller can mark ready");
  if (order.delivery_option !== "pickup") throw new Error("This action is only for pickup orders");
  if (!VALID_ORDER_STATUS_TRANSITIONS[order.status].includes("ready_for_pickup")) {
    throw new Error("Order cannot be marked ready");
  }

  const db = getServiceClient();
  const { error } = await db
    .from("listing_orders")
    .update({ status: "ready_for_pickup", updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", order.status);

  if (error) throw new Error(`marketplace: ${error.message}`);

  await recordOrderEvent(orderId, order.seller_id, "ready_for_pickup", {});
  await createNotification(order.buyer_id, "marketplace_ready", {
    listing_order_id: orderId,
  });

  revalidatePath(`/app/marketplace/orders/${orderId}`);
  revalidatePath("/app/marketplace/orders");
}

export async function markInDelivery(orderId: string) {
  const order = await requireMarketplaceOrderParticipant(orderId);
  if (order.seller_id !== (await requireUserId())) throw new Error("Only the seller can mark in delivery");
  if (order.delivery_option !== "seller_delivery") throw new Error("This action is only for seller delivery orders");
  if (!VALID_ORDER_STATUS_TRANSITIONS[order.status].includes("in_delivery")) {
    throw new Error("Order cannot be marked in delivery");
  }

  const db = getServiceClient();
  const { error } = await db
    .from("listing_orders")
    .update({ status: "in_delivery", updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", order.status);

  if (error) throw new Error(`marketplace: ${error.message}`);

  await recordOrderEvent(orderId, order.seller_id, "in_delivery", {});
  await createNotification(order.buyer_id, "marketplace_ready", {
    listing_order_id: orderId,
  });

  revalidatePath(`/app/marketplace/orders/${orderId}`);
  revalidatePath("/app/marketplace/orders");
}

export async function confirmPickup(orderId: string, formData: FormData) {
  const order = await requireMarketplaceOrderParticipant(orderId);
  if (order.seller_id !== (await requireUserId())) throw new Error("Only the seller can confirm pickup");
  if (order.status !== "ready_for_pickup") throw new Error("Order is not ready for pickup");

  const code = String(formData.get("pickup_code") ?? "").trim();
  if (!order.pickup_code || code !== order.pickup_code) {
    throw new Error("Invalid pickup code");
  }

  const db = getServiceClient();
  const { error } = await db
    .from("listing_orders")
    .update({ status: "delivered", updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "ready_for_pickup");

  if (error) throw new Error(`marketplace: ${error.message}`);

  await recordOrderEvent(orderId, order.seller_id, "delivered", { method: "pickup_code" });
  await createNotification(order.buyer_id, "marketplace_delivered", {
    listing_order_id: orderId,
  });

  revalidatePath(`/app/marketplace/orders/${orderId}`);
  revalidatePath("/app/marketplace/orders");
}

export async function markDelivered(orderId: string, formData: FormData) {
  const order = await requireMarketplaceOrderParticipant(orderId);
  if (order.seller_id !== (await requireUserId())) throw new Error("Only the seller can mark delivered");
  if (order.delivery_option !== "seller_delivery") throw new Error("This action is only for seller delivery orders");
  if (!VALID_ORDER_STATUS_TRANSITIONS[order.status].includes("delivered")) {
    throw new Error("Order cannot be marked delivered");
  }

  const notes = String(formData.get("notes") ?? "").trim() || null;

  const db = getServiceClient();
  const { error } = await db
    .from("listing_orders")
    .update({ status: "delivered", delivery_notes: notes, updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", order.status);

  if (error) throw new Error(`marketplace: ${error.message}`);

  await recordOrderEvent(orderId, order.seller_id, "delivered", { notes });
  await createNotification(order.buyer_id, "marketplace_delivered", {
    listing_order_id: orderId,
  });

  revalidatePath(`/app/marketplace/orders/${orderId}`);
  revalidatePath("/app/marketplace/orders");
}

export async function confirmReceipt(orderId: string, formData: FormData) {
  const order = await requireMarketplaceOrderParticipant(orderId);
  if (order.buyer_id !== (await requireUserId())) throw new Error("Only the buyer can confirm receipt");
  if (order.status !== "delivered") throw new Error("Order has not been delivered");

  const starsRaw = parseNumber(formData.get("stars"));
  const comment = String(formData.get("comment") ?? "").trim() || null;
  if (!Number.isInteger(starsRaw) || starsRaw < 1 || starsRaw > 5) {
    throw new Error("Rating must be between 1 and 5 stars");
  }
  const stars = starsRaw;

  const db = getServiceClient();

  await marketReleaseFunds(orderId);

  const { error: ratingError } = await db.from("ratings").insert({
    listing_order_id: orderId,
    rater_id: order.buyer_id,
    ratee_id: order.seller_id,
    stars,
    comment,
  });
  if (ratingError) {
    if (ratingError.code === "23505") throw new Error("You already rated this order");
    throw new Error(`marketplace: ${ratingError.message}`);
  }

  const { error } = await db
    .from("listing_orders")
    .update({
      status: "completed",
      buyer_confirmed_at: new Date().toISOString(),
      buyer_rated: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("status", "delivered");

  if (error) throw new Error(`marketplace: ${error.message}`);

  await recordOrderEvent(orderId, order.buyer_id, "completed", { stars });
  await createNotification(order.seller_id, "marketplace_completed", {
    listing_order_id: orderId,
  });

  revalidatePath(`/app/marketplace/orders/${orderId}`);
  revalidatePath("/app/marketplace/orders");
  revalidatePath("/app");
}

export async function rateBuyer(orderId: string, formData: FormData) {
  const order = await requireMarketplaceOrderParticipant(orderId);
  if (order.seller_id !== (await requireUserId())) throw new Error("Only the seller can rate the buyer");
  if (order.status !== "completed") throw new Error("Order must be completed before rating");
  if (order.seller_rated) throw new Error("You already rated the buyer");

  const starsRaw = parseNumber(formData.get("stars"));
  const comment = String(formData.get("comment") ?? "").trim() || null;
  if (!Number.isInteger(starsRaw) || starsRaw < 1 || starsRaw > 5) {
    throw new Error("Rating must be between 1 and 5 stars");
  }

  const db = getServiceClient();
  const { error } = await db.from("ratings").insert({
    listing_order_id: orderId,
    rater_id: order.seller_id,
    ratee_id: order.buyer_id,
    stars: starsRaw,
    comment,
  });
  if (error) {
    if (error.code === "23505") throw new Error("You already rated this order");
    throw new Error(`marketplace: ${error.message}`);
  }

  await db.from("listing_orders").update({ seller_rated: true }).eq("id", orderId);

  await recordOrderEvent(orderId, order.seller_id, "buyer_rated", { stars: starsRaw });

  revalidatePath(`/app/marketplace/orders/${orderId}`);
  revalidatePath("/app/marketplace/orders");
}

export async function cancelMarketplaceOrder(orderId: string) {
  const order = await requireMarketplaceOrderParticipant(orderId);
  const userId = await requireUserId();

  const cancellableByBuyer = ["pending_payment", "paid", "ready_for_pickup"];
  const cancellableBySeller = ["pending_payment", "paid", "ready_for_pickup", "in_delivery"];

  if (userId === order.buyer_id && !cancellableByBuyer.includes(order.status)) {
    throw new Error("Order cannot be cancelled by buyer at this stage");
  }
  if (userId === order.seller_id && !cancellableBySeller.includes(order.status)) {
    throw new Error("Order cannot be cancelled by seller at this stage");
  }

  const db = getServiceClient();

  if (["paid", "ready_for_pickup", "in_delivery"].includes(order.status)) {
    await marketRefundFunds(orderId);
  }

  if (order.delivery_task_id) {
    const { data: task } = await db
      .from("tasks")
      .select("id, status")
      .eq("id", order.delivery_task_id)
      .maybeSingle<{ id: string; status: string }>();
    if (task && !["completed", "cancelled"].includes(task.status)) {
      if (["matched", "accepted", "in_progress"].includes(task.status)) {
        await refundTaskFunds(task.id);
      }
      await db.from("tasks").update({ status: "cancelled" }).eq("id", task.id);
    }
  }

  const { error } = await db
    .from("listing_orders")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .in("status", ["pending_payment", "paid", "ready_for_pickup", "in_delivery"]);

  if (error) throw new Error(`marketplace: ${error.message}`);

  // Restore stock and reactivate listing if needed.
  const { data: listing } = await db
    .from("listings")
    .select("stock")
    .eq("id", order.listing_id)
    .maybeSingle<{ stock: number }>();
  if (listing) {
    await db
      .from("listings")
      .update({ stock: listing.stock + 1, status: "active" })
      .eq("id", order.listing_id);
  }

  await recordOrderEvent(orderId, userId, "cancelled", {});
  const otherParty = userId === order.buyer_id ? order.seller_id : order.buyer_id;
  await createNotification(otherParty, "marketplace_cancelled", {
    listing_order_id: orderId,
  });

  revalidatePath(`/app/marketplace/orders/${orderId}`);
  revalidatePath("/app/marketplace/orders");
  revalidatePath("/app/marketplace");
  revalidatePath("/app");
}

export async function raiseMarketplaceDispute(orderId: string, formData: FormData) {
  const order = await requireMarketplaceOrderParticipant(orderId);
  const userId = await requireUserId();
  if (order.status !== "delivered") {
    throw new Error("Order must be delivered before raising a dispute");
  }

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) throw new Error("A reason is required");

  const db = getServiceClient();
  const { data: existing } = await db
    .from("disputes")
    .select("id")
    .eq("listing_order_id", orderId)
    .maybeSingle<{ id: string }>();
  if (existing) throw new Error("A dispute already exists for this order");

  const { data: dispute, error } = await db
    .from("disputes")
    .insert({
      listing_order_id: orderId,
      raised_by: userId,
      reason,
      status: "escalated",
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !dispute) {
    if (error?.code === "23505") throw new Error("A dispute already exists for this order");
    throw new Error(`marketplace: ${error?.message ?? "Failed to raise dispute"}`);
  }

  const { error: statusError } = await db
    .from("listing_orders")
    .update({ status: "disputed", updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .in("status", ["delivered", "completed"]);

  if (statusError) throw new Error(`marketplace: ${statusError.message}`);

  await recordOrderEvent(orderId, userId, "dispute_raised", { dispute_id: dispute.id, reason });
  await createNotification(
    userId === order.buyer_id ? order.seller_id : order.buyer_id,
    "marketplace_dispute_raised",
    { listing_order_id: orderId },
  );

  revalidatePath(`/app/marketplace/orders/${orderId}`);
  revalidatePath("/app/marketplace/orders");
}

export async function adminResolveMarketplaceDispute(disputeId: string, resolution: string) {
  const adminId = await requireAdmin();
  if (resolution !== "release" && resolution !== "refund") {
    throw new Error("Resolution must be release or refund");
  }

  const db = getServiceClient();
  const { data: dispute, error } = await db
    .from("disputes")
    .select("id, listing_order_id, status")
    .eq("id", disputeId)
    .maybeSingle<{ id: string; listing_order_id: string; status: string }>();

  if (error) throw new Error(`marketplace: ${error.message}`);
  if (!dispute) throw new Error("Dispute not found");
  if (dispute.status === "resolved") throw new Error("Dispute already resolved");

  const { data: order } = await db
    .from("listing_orders")
    .select("id, listing_id, buyer_id, seller_id, status")
    .eq("id", dispute.listing_order_id)
    .maybeSingle<{ id: string; listing_id: string; buyer_id: string; seller_id: string; status: string }>();

  if (!order) throw new Error("Order not found");

  if (resolution === "refund") {
    await marketRefundFunds(order.id);
    await db.from("listing_orders").update({ status: "refunded" }).eq("id", order.id);
    const { data: listing } = await db
      .from("listings")
      .select("stock")
      .eq("id", order.listing_id)
      .maybeSingle<{ stock: number }>();
    if (listing) {
      await db.from("listings").update({ stock: listing.stock + 1, status: "active" }).eq("id", order.listing_id);
    }
  } else {
    await marketReleaseFunds(order.id);
    await db.from("listing_orders").update({ status: "completed" }).eq("id", order.id);
  }

  await db
    .from("disputes")
    .update({
      status: "resolved",
      resolution: resolution as "refund" | "release",
      resolved_at: new Date().toISOString(),
    })
    .eq("id", disputeId);

  await recordOrderEvent(order.id, adminId, "dispute_resolved", {
    dispute_id: disputeId,
    resolution,
  });
  await createNotification(order.buyer_id, "marketplace_dispute_resolved", {
    listing_order_id: order.id,
  });
  await createNotification(order.seller_id, "marketplace_dispute_resolved", {
    listing_order_id: order.id,
  });

  revalidatePath("/app/admin");
  revalidatePath(`/app/marketplace/orders/${order.id}`);
}

export async function adminSetListingStatus(listingId: string, status: "active" | "suspended") {
  await requireAdmin();
  const db = getServiceClient();
  const { error } = await db
    .from("listings")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", listingId);
  if (error) throw new Error(`marketplace: ${error.message}`);

  revalidatePath("/app/admin");
  revalidatePath(`/app/marketplace/${listingId}`);
  revalidatePath("/app/marketplace");
}
