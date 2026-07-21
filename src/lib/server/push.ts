import webpush from "web-push";
import { getServiceClient } from "@/lib/supabase/service";

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT ?? "mailto:hello@melange.app";

let configured = false;

function configure() {
  if (configured) return;
  if (!vapidPublicKey || !vapidPrivateKey) return;
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  configured = true;
}

export function isPushConfigured(): boolean {
  return Boolean(vapidPublicKey && vapidPrivateKey);
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: { url?: string; [key: string]: unknown };
}

export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  if (!isPushConfigured()) return;
  configure();

  const db = getServiceClient();
  const { data: subs, error } = await db
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error || !subs?.length) return;

  const pushPayload = JSON.stringify(payload);
  const expired: string[] = [];

  for (const sub of subs) {
    const pushSub: webpush.PushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    };

    try {
      await webpush.sendNotification(pushSub, pushPayload);
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        expired.push(sub.id);
      } else {
        console.error("push: send failed", status, err);
      }
    }
  }

  if (expired.length) {
    await db.from("push_subscriptions").delete().in("id", expired);
  }
}
