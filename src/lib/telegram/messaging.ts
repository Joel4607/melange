import { getServiceClient } from "@/lib/supabase/service";
import { getBotUsernameFromToken } from "./init-data";

let cachedBotUsername: string | null | undefined;

async function getBotUsername(): Promise<string | null> {
  if (cachedBotUsername !== undefined) return cachedBotUsername;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    cachedBotUsername = null;
    return null;
  }

  cachedBotUsername = await getBotUsernameFromToken(botToken);
  return cachedBotUsername;
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    const json = (await res.json()) as { ok: boolean };
    return json.ok ?? false;
  } catch {
    return false;
  }
}

async function getLinkedAdminTelegramIds(): Promise<string[]> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("profiles")
    .select("telegram_user_id")
    .eq("is_admin", true)
    .not("telegram_user_id", "is", null)
    .returns<{ telegram_user_id: string }[]>();

  if (error || !data) return [];
  return data.map((row) => row.telegram_user_id);
}

async function miniAppLink(): Promise<string> {
  const username = await getBotUsername();
  return username ? `https://t.me/${username}?startapp=open` : "";
}

export async function notifyAdmins(text: string): Promise<void> {
  const admins = await getLinkedAdminTelegramIds();
  if (admins.length === 0) return;

  await Promise.all(admins.map((chatId) => sendTelegramMessage(chatId, text)));
}

export async function notifyAdminsOfVerification(
  requestId: string,
  userId: string,
): Promise<void> {
  const db = getServiceClient();
  const { data: profile } = await db
    .from("profiles")
    .select("name, email")
    .eq("id", userId)
    .maybeSingle<{ name: string | null; email: string | null }>();

  const name = profile?.name || profile?.email || "A user";
  const link = await miniAppLink();
  const linkLine = link ? `\n\nOpen the Mélange Admin Mini App:\n${link}` : "";

  await notifyAdmins(
    `New verification request from ${name} (#${requestId.slice(0, 8)}).` +
      `\nReview it in the admin panel to approve or reject.${linkLine}`,
  );
}

export async function notifyAdminsOfDispute(
  disputeId: string,
  taskTitle: string,
): Promise<void> {
  const link = await miniAppLink();
  const linkLine = link ? `\n\nOpen the Mélange Admin Mini App:\n${link}` : "";

  await notifyAdmins(
    `A dispute was escalated for errand “${taskTitle}” (#${disputeId.slice(0, 8)}).` +
      `\nPlease review and resolve it in the admin panel.${linkLine}`,
  );
}
