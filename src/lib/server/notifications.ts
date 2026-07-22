import { getServiceClient } from "@/lib/supabase/service";
import { sendPushToUser } from "./push";

export interface NotificationPayload {
  task_id?: string;
  task_title?: string;
  listing_order_id?: string;
  listing_title?: string;
  runner_name?: string;
  [key: string]: unknown;
}

export type NotificationType =
  | "offer"
  | "offer_accepted"
  | "picked_up"
  | "delivered"
  | "rated"
  | "buyer_cancelled"
  | "runner_cancelled"
  | "dispute_raised"
  | "dispute_resolved"
  | "listing_sold"
  | "listing_purchased"
  | "marketplace_ready"
  | "marketplace_delivered"
  | "marketplace_completed"
  | "marketplace_cancelled"
  | "marketplace_dispute_raised"
  | "marketplace_dispute_resolved";

function getTitle(type: NotificationType): string {
  switch (type) {
    case "offer":
      return "New errand offer";
    case "offer_accepted":
      return "Runner accepted";
    case "picked_up":
      return "Errand picked up";
    case "delivered":
      return "Errand delivered";
    case "rated":
      return "New rating";
    case "buyer_cancelled":
    case "runner_cancelled":
      return "Errand cancelled";
    case "dispute_raised":
      return "Dispute raised";
    case "dispute_resolved":
      return "Dispute resolved";
    case "listing_sold":
      return "Item sold";
    case "listing_purchased":
      return "Purchase confirmed";
    case "marketplace_ready":
      return "Order ready";
    case "marketplace_delivered":
      return "Order delivered";
    case "marketplace_completed":
      return "Order completed";
    case "marketplace_cancelled":
      return "Order cancelled";
    case "marketplace_dispute_raised":
      return "Marketplace dispute";
    case "marketplace_dispute_resolved":
      return "Marketplace dispute resolved";
  }
}

function getBody(type: NotificationType, payload: NotificationPayload): string {
  const taskTitle = payload.task_title ? `“${payload.task_title}”` : "an errand";
  const listingTitle = payload.listing_title ? `“${payload.listing_title}”` : "an item";

  switch (type) {
    case "offer":
      return `You have an offer for ${taskTitle}.`;
    case "offer_accepted":
      return `A runner accepted ${taskTitle}.`;
    case "picked_up":
      return `Your errand ${taskTitle} was picked up.`;
    case "delivered":
      return `Your errand ${taskTitle} has been delivered.`;
    case "rated":
      return `You received a rating for ${taskTitle}.`;
    case "buyer_cancelled":
      return `A buyer cancelled ${taskTitle}.`;
    case "runner_cancelled":
      return `A runner cancelled ${taskTitle}.`;
    case "dispute_raised":
      return `A dispute was raised for ${taskTitle}.`;
    case "dispute_resolved":
      return `A dispute was resolved for ${taskTitle}.`;
    case "listing_sold":
      return `Your listing ${listingTitle} was purchased.`;
    case "listing_purchased":
      return `You purchased ${listingTitle}.`;
    case "marketplace_ready":
      return `Your order for ${listingTitle} is ready.`;
    case "marketplace_delivered":
      return `Your order for ${listingTitle} has been delivered.`;
    case "marketplace_completed":
      return `Your order for ${listingTitle} is complete.`;
    case "marketplace_cancelled":
      return `Your order for ${listingTitle} was cancelled.`;
    case "marketplace_dispute_raised":
      return `A dispute was raised for ${listingTitle}.`;
    case "marketplace_dispute_resolved":
      return `A dispute was resolved for ${listingTitle}.`;
  }
}

function getUrl(payload: NotificationPayload): string {
  if (payload.listing_order_id) {
    return `/app/marketplace/orders/${payload.listing_order_id}`;
  }
  if (payload.task_id) {
    return `/app/errands/${payload.task_id}`;
  }
  return "/app";
}

/**
 * Create a notification for a user. Service-role so callers must ensure the
 * recipient is the correct user.
 */
export async function createNotification(
  recipientId: string,
  type: NotificationType,
  payload: NotificationPayload = {},
): Promise<void> {
  const db = getServiceClient();
  const { error } = await db.from("notifications").insert({
    recipient_id: recipientId,
    type,
    payload,
    channel: "in_app",
    read: false,
  });
  if (error) {
    throw new Error(`createNotification: ${error.message}`);
  }

  await sendPushToUser(recipientId, {
    title: getTitle(type),
    body: getBody(type, payload),
    icon: "/icon-192x192.png",
    data: { url: getUrl(payload) },
  });
}
