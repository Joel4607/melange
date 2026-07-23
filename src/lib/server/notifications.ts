import { getServiceClient } from "@/lib/supabase/service";
import { sendPushToUser } from "./push";

export interface NotificationPayload {
  task_id?: string;
  task_title?: string;
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
  | "dispute_resolved";

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
  }
}

function getBody(type: NotificationType, payload: NotificationPayload): string {
  const title = payload.task_title ? `“${payload.task_title}”` : "an errand";
  switch (type) {
    case "offer":
      return `You have an offer for ${title}.`;
    case "offer_accepted":
      return `A runner accepted ${title}.`;
    case "picked_up":
      return `Your errand ${title} was picked up.`;
    case "delivered":
      return `Your errand ${title} has been delivered.`;
    case "rated":
      return `You received a rating for ${title}.`;
    case "buyer_cancelled":
      return `A buyer cancelled ${title}.`;
    case "runner_cancelled":
      return `A runner cancelled ${title}.`;
    case "dispute_raised":
      return `A dispute was raised for ${title}.`;
    case "dispute_resolved":
      return `A dispute was resolved for ${title}.`;
  }
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
    data: { url: payload.task_id ? `/app/errands/${payload.task_id}` : "/app" },
  });
}
