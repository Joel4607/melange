import { getServiceClient } from "@/lib/supabase/service";
import { getTelegramBotToken, getSiteUrl } from "./env";
import { getBotUsernameFromToken } from "./init-data";

const API_BASE = "https://api.telegram.org/bot";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

interface TelegramApiResponse {
  ok: boolean;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function botApi(method: string, body: unknown): Promise<TelegramApiResponse> {
  const botToken = getTelegramBotToken();
  if (!botToken) {
    console.error(`Telegram API ${method} failed: no bot token configured`);
    return { ok: false, description: "No bot token configured" };
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${API_BASE}${botToken}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        if (attempt === MAX_RETRIES - 1) {
          return { ok: false, description: `HTTP ${res.status}` };
        }
        await sleep(BASE_DELAY_MS * 2 ** attempt);
        continue;
      }

      const data = (await res.json()) as TelegramApiResponse;
      if (data.ok) return data;

      if (data.error_code === 429 && data.parameters?.retry_after && attempt < MAX_RETRIES - 1) {
        await sleep(data.parameters.retry_after * 1000 + 100);
        continue;
      }

      console.warn(`Telegram API ${method} returned error:`, data);
      return data;
    } catch (err) {
      console.error(`Telegram API ${method} network error (attempt ${attempt + 1}):`, err);
      if (attempt === MAX_RETRIES - 1) {
        return { ok: false, description: "Network error" };
      }
      await sleep(BASE_DELAY_MS * 2 ** attempt);
    }
  }

  return { ok: false, description: "Max retries exceeded" };
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

export async function editTelegramMessage(
  chatId: string,
  messageId: number,
  text: string,
  options?: { reply_markup?: unknown },
): Promise<boolean> {
  const res = await botApi("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    ...options,
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
      .select(
        "id, user_id, front_photo_path, back_photo_path, selfie_photo_path, vehicle_license_photo_path, phone, email, legal_name, date_of_birth, ghana_card_number, residential_address, emergency_contact_name, emergency_contact_phone, next_of_kin_name, next_of_kin_phone, status, created_at",
      )
      .eq("id", requestId)
      .maybeSingle<{
        id: string;
        user_id: string;
        front_photo_path: string | null;
        back_photo_path: string | null;
        selfie_photo_path: string | null;
        vehicle_license_photo_path: string | null;
        phone: string | null;
        email: string | null;
        legal_name: string | null;
        date_of_birth: string | null;
        ghana_card_number: string | null;
        residential_address: string | null;
        emergency_contact_name: string | null;
        emergency_contact_phone: string | null;
        next_of_kin_name: string | null;
        next_of_kin_phone: string | null;
        status: string;
        created_at: string;
      }>(),
    db
      .from("profiles")
      .select("name")
      .eq("id", userId)
      .maybeSingle<{ name: string | null }>(),
  ]);

  if (!request || request.status !== "pending") return;

  const [frontUrl, backUrl, selfieUrl, vehicleLicenseUrl] = await Promise.all([
    signedStorageUrl("verification", request.front_photo_path),
    signedStorageUrl("verification", request.back_photo_path),
    signedStorageUrl("verification", request.selfie_photo_path),
    signedStorageUrl("verification", request.vehicle_license_photo_path),
  ]);

  if (!frontUrl || !backUrl || !selfieUrl) return;

  const submittedAt = new Date(request.created_at).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const name = request.legal_name || profile?.name || "A runner";
  const caption = [
    `New runner verification from <b>${escapeHtml(name)}</b>`,
    `<b>Legal name:</b> ${escapeHtml(request.legal_name ?? "—")}`,
    `<b>DOB:</b> ${escapeHtml(request.date_of_birth ?? "—")}`,
    `<b>Ghana Card:</b> ${escapeHtml(request.ghana_card_number ?? "—")}`,
    `<b>Phone:</b> ${escapeHtml(request.phone ?? "—")}`,
    request.email ? `<b>Email:</b> ${escapeHtml(request.email)}` : null,
    `<b>Address:</b> ${escapeHtml(request.residential_address ?? "—")}`,
    `<b>Emergency contact:</b> ${escapeHtml(request.emergency_contact_name ?? "—")} / ${escapeHtml(request.emergency_contact_phone ?? "—")}`,
    `<b>Next of kin:</b> ${escapeHtml(request.next_of_kin_name ?? "—")} / ${escapeHtml(request.next_of_kin_phone ?? "—")}`,
    vehicleLicenseUrl ? `<b>Vehicle license:</b> ${escapeHtml(vehicleLicenseUrl)}` : null,
    `<b>Submitted:</b> ${submittedAt}`,
    `<b>ID:</b> #${requestId.slice(0, 8)}`,
  ]
    .filter(Boolean)
    .join("\n");

  const admins = await getLinkedAdminChats();
  if (admins.length === 0) {
    console.warn(`No linked admins to notify for verification ${requestId}`);
    return;
  }

  const media: { type: "photo"; media: string; caption?: string; parse_mode?: string }[] = [
    { type: "photo" as const, media: frontUrl, caption, parse_mode: "HTML" },
    { type: "photo" as const, media: backUrl, parse_mode: "HTML" },
    { type: "photo" as const, media: selfieUrl, parse_mode: "HTML" },
  ];
  if (vehicleLicenseUrl) {
    media.push({ type: "photo" as const, media: vehicleLicenseUrl, parse_mode: "HTML" });
  }

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
        "Use the buttons below to approve or reject the runner verification request.",
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
    .select("id, title, price, fee, buyer_id, selected_runner_id")
    .eq("id", dispute.task_id)
    .maybeSingle<{
      id: string;
      title: string;
      price: string;
      fee: string;
      buyer_id: string;
      selected_runner_id: string | null;
    }>();

  if (!task) return;

  const userIds = [task.buyer_id, task.selected_runner_id].filter(Boolean) as string[];
  const { data: profiles } = await db
    .from("profiles")
    .select("id, name")
    .in("id", userIds)
    .returns<{ id: string; name: string | null }[]>();

  const namesById = new Map(profiles?.map((p) => [p.id, p.name ?? "—"]) ?? []);

  const price = Number(task.price ?? 0);
  const fee = Number(task.fee ?? 0);
  const runnerPayout = Math.max(0, price - fee);

  const adminUrl = `${getSiteUrl()}/admin`;

  const text = [
    `<b>Escalated dispute</b>`,
    `Errand: ${escapeHtml(task.title || taskTitle)}`,
    `Buyer: ${escapeHtml(namesById.get(task.buyer_id) ?? "—")}`,
    `Runner: ${escapeHtml(task.selected_runner_id ? namesById.get(task.selected_runner_id) ?? "—" : "—")}`,
    `Reason: ${escapeHtml(dispute.reason)}`,
    `Demo buyer refund: Demo GHS ${price.toFixed(2)}`,
    `Demo runner payout: Demo GHS ${runnerPayout.toFixed(2)}`,
    `Simulation only; no real funds are transferred.`,
    `ID: #${disputeId.slice(0, 8)}`,
  ].join("\n");

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: "Release demo credits", callback_data: `dr:${disputeId}` },
        { text: "Refund demo credits", callback_data: `df:${disputeId}` },
      ],
      [{ text: "View in admin panel", url: adminUrl }],
    ],
  };

  const admins = await getLinkedAdminChats();
  if (admins.length === 0) {
    console.warn(`No linked admins to notify for dispute ${disputeId}`);
    return;
  }

  await Promise.all(
    admins.map((admin) => sendTelegramMessage(admin.telegramUserId, text, { reply_markup: replyMarkup })),
  );
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Send a plain notification message to a user's Telegram chat.
 * The account must have already started a conversation with the bot.
 */
export async function sendTelegramToUser(
  telegramUserId: string,
  title: string,
  body: string,
): Promise<void> {
  const text = [`<b>${escapeHtml(title)}</b>`, escapeHtml(body)]
    .filter(Boolean)
    .join("\n\n");
  await sendTelegramMessage(telegramUserId, text);
}
