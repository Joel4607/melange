import { getServiceClient } from "@/lib/supabase/service";

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
}
