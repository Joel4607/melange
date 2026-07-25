import { getServiceClient } from "@/lib/supabase/service";
import { getTelegramBotToken } from "./env";
import { getBotUsernameFromToken } from "./init-data";

const API_BASE = "https://api.telegram.org/bot";

interface TelegramApiResponse {
  ok: boolean;
  description?: string;
}

async function botApi(method: string, body: unknown): Promise<TelegramApiResponse> {
  const botToken = getTelegramBotToken();
  if (!botToken) return { ok: false, description: "No bot token configured" };

  try {
    const res = await fetch(`${API_BASE}${botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as TelegramApiResponse;
  } catch {
    return { ok: false, description: "Network error" };
  }
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options?: { reply_markup?: unknown },
): Promise<boolean> {
  const res = await botApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...options,
  });
  return res.ok;
}

export async function sendTelegramMediaGroup(
  chatId: string,
  media: { type: "photo"; media: string; caption?: string; parse_mode?: string }[],
): Promise<boolean> {
  const res = await botApi("sendMediaGroup", { chat_id: chatId, media });
  return res.ok;
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<boolean> {
  const res = await botApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text: text ?? undefined,
  });
  return res.ok;
}

let cachedBotUsername: string | null | undefined;

export async function getBotUsername(): Promise<string | null> {
  if (cachedBotUsername !== undefined) return cachedBotUsername;

  const botToken = getTelegramBotToken();
  if (!botToken) {
    cachedBotUsername = null;
    return null;
  }

  cachedBotUsername = await getBotUsernameFromToken(botToken);
  return cachedBotUsername;
}

interface AdminChat {
  profileId: string;
  telegramUserId: string;
}

async function getLinkedAdminChats(): Promise<AdminChat[]> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("profiles")
    .select("id, telegram_user_id")
    .eq("is_admin", true)
    .not("telegram_user_id", "is", null)
    .returns<{ id: string; telegram_user_id: string }[]>();

  if (error || !data) return [];
  return data.map((row) => ({ profileId: row.id, telegramUserId: row.telegram_user_id }));
}

async function signedStorageUrl(bucket: string, path: string | null): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;

  const db = getServiceClient();
  const { data, error } = await db.storage.from(bucket).createSignedUrl(path, 60 * 5);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function notifyAdminsOfVerification(
  requestId: string,
  userId: string,
): Promise<void> {
  const db = getServiceClient();

  const [{ data: request }, { data: profile }] = await Promise.all([
    db
      .from("verification_requests")
      .select("id, user_id, front_photo_path, back_photo_path, phone, email, status")
      .eq("id", requestId)
      .maybeSingle<{
        id: string;
        user_id: string;
        front_photo_path: string | null;
        back_photo_path: string | null;
        phone: string | null;
        email: string | null;
        status: string;
      }>(),
    db
      .from("profiles")
      .select("name, email")
      .eq("id", userId)
      .maybeSingle<{ name: string | null; email: string | null }>(),
  ]);

  if (!request || request.status !== "pending") return;

  const [frontUrl, backUrl] = await Promise.all([
    signedStorageUrl("verification", request.front_photo_path),
    signedStorageUrl("verification", request.back_photo_path),
  ]);

  if (!frontUrl || !backUrl) return;

  const name = profile?.name || profile?.email || "A user";
  const caption = [
    `New verification request from <b>${escapeHtml(name)}</b>`,
    `Phone: ${escapeHtml(request.phone ?? "—")}`,
    request.email ? `Email: ${escapeHtml(request.email)}` : null,
    `ID: #${requestId.slice(0, 8)}`,
  ]
    .filter(Boolean)
    .join("\n");

  const admins = await getLinkedAdminChats();
  if (admins.length === 0) return;

  const media = [
    { type: "photo" as const, media: frontUrl, caption, parse_mode: "HTML" },
    { type: "photo" as const, media: backUrl, parse_mode: "HTML" },
  ];

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: "Approve", callback_data: `va:${requestId}` },
        { text: "Reject", callback_data: `vr:${requestId}` },
      ],
    ],
  };

  await Promise.all(
    admins.map(async (admin) => {
      await sendTelegramMediaGroup(admin.telegramUserId, media);
      await sendTelegramMessage(
        admin.telegramUserId,
        "Use the buttons below to approve or reject the verification request.",
        { reply_markup: replyMarkup },
      );
    }),
  );
}

export async function notifyAdminsOfDispute(
  disputeId: string,
  taskTitle: string,
): Promise<void> {
  const db = getServiceClient();

  const { data: dispute, error } = await db
    .from("disputes")
    .select("id, task_id, reason, status")
    .eq("id", disputeId)
    .maybeSingle<{ id: string; task_id: string; reason: string; status: string }>();

  if (error || !dispute || dispute.status !== "escalated") return;

  const { data: task } = await db
    .from("tasks")
    .select("id, title, price, fee")
    .eq("id", dispute.task_id)
    .maybeSingle<{ id: string; title: string; price: string; fee: string }>();

  const price = Number(task?.price ?? 0);
  const fee = Number(task?.fee ?? 0);
  const runnerPayout = Math.max(0, price - fee);

  const text = [
    `<b>Escalated dispute</b>`,
    `Errand: ${escapeHtml(task?.title ?? taskTitle)}`,
    `Reason: ${escapeHtml(dispute.reason)}`,
    `Buyer refund: GHS ${price.toFixed(2)}`,
    `Runner payout: GHS ${runnerPayout.toFixed(2)}`,
    `ID: #${disputeId.slice(0, 8)}`,
  ].join("\n");

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: "Release to runner", callback_data: `dr:${disputeId}` },
        { text: "Refund buyer", callback_data: `df:${disputeId}` },
      ],
    ],
  };

  const admins = await getLinkedAdminChats();
  if (admins.length === 0) return;

  await Promise.all(
    admins.map((admin) => sendTelegramMessage(admin.telegramUserId, text, { reply_markup: replyMarkup })),
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
