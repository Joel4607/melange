import { getServiceClient } from "@/lib/supabase/service";
import { sendEmail, isEmailConfigured } from "./email";
import { sendPushToUser } from "./push";
import { sendTelegramToUser } from "@/lib/telegram/messaging";

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

interface UserNotificationChannels {
  email: string | null;
  telegram_user_id: string | null;
  notify_in_app: boolean;
  notify_push: boolean;
  notify_email: boolean;
  notify_telegram: boolean;
}

async function getChannelsForUser(
  db: ReturnType<typeof getServiceClient>,
  userId: string,
): Promise<UserNotificationChannels | null> {
  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("telegram_user_id, notify_in_app, notify_push, notify_email, notify_telegram")
    .eq("id", userId)
    .maybeSingle<UserNotificationChannels>();

  if (profileError || !profile) return null;

  const { data: authUser, error: authError } = await db.auth.admin.getUserById(userId);
  if (authError) {
    console.error("notifications: failed to load auth email", authError.message);
  }

  return {
    ...profile,
    email: authUser?.user?.email ?? null,
  };
}

/**
 * Create a notification for a user across enabled channels. Service-role so
 * callers must ensure the recipient is the correct user. Channel failures are
 * logged but never thrown so in-app delivery is not blocked.
 */
export async function createNotification(
  recipientId: string,
  type: NotificationType,
  payload: NotificationPayload = {},
): Promise<void> {
  const db = getServiceClient();
  const title = getTitle(type);
  const body = getBody(type, payload);

  const channels = await getChannelsForUser(db, recipientId);

  if (!channels || channels.notify_in_app) {
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

  if (channels?.notify_push) {
    try {
      await sendPushToUser(recipientId, {
        title,
        body,
        icon: "/icon-192x192.png",
        data: { url: payload.task_id ? `/app/errands/${payload.task_id}` : "/app" },
      });
    } catch (err) {
      console.error("notifications: push dispatch failed", err);
    }
  }

  if (channels?.notify_email && channels.email && isEmailConfigured()) {
    try {
      await sendEmail(
        channels.email,
        title,
        `<p>${body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`,
      );
    } catch (err) {
      console.error("notifications: email dispatch failed", err);
    }
  }

  if (channels?.notify_telegram && channels.telegram_user_id) {
    try {
      await sendTelegramToUser(channels.telegram_user_id, title, body);
    } catch (err) {
      console.error("notifications: telegram dispatch failed", err);
    }
  }
}
