import { getServiceClient } from "@/lib/supabase/service";
import {
  approveVerificationAsAdmin,
  rejectVerificationAsAdmin,
} from "@/app/admin/actions";
import { resolveDisputeAdmin } from "@/lib/server/disputes";
import { sendTelegramMessage, answerCallbackQuery } from "./messaging";
import { verifyTelegramLinkToken } from "./init-data";

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  is_bot?: boolean;
}

interface TelegramChat {
  id: number;
  type: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  caption?: string;
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: { chat: TelegramChat; message_id: number };
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

async function findAdminByTelegramId(telegramUserId: string): Promise<{ id: string; name: string | null } | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("profiles")
    .select("id, name")
    .eq("telegram_user_id", telegramUserId)
    .eq("is_admin", true)
    .maybeSingle<{ id: string; name: string | null }>();

  if (error || !data) return null;
  return data;
}

async function linkTelegramFromToken(
  token: string,
  telegramUserId: string,
): Promise<{ ok: boolean; name?: string | null; alreadyLinked?: boolean }> {
  const db = getServiceClient();
  const tokenData = await verifyTelegramLinkToken(token);
  if (!tokenData) return { ok: false };

  const { data: profile } = await db
    .from("profiles")
    .select("id, name, is_admin, telegram_user_id")
    .eq("id", tokenData.profileId)
    .maybeSingle<{ id: string; name: string | null; is_admin: boolean; telegram_user_id: string | null }>();

  if (!profile || !profile.is_admin) return { ok: false };

  const alreadyLinked = profile.telegram_user_id === telegramUserId;

  if (!alreadyLinked) {
    await db.from("profiles").update({ telegram_user_id: telegramUserId }).eq("id", profile.id);
  }

  return { ok: true, name: profile.name, alreadyLinked };
}

async function handleStart(message: TelegramMessage): Promise<void> {
  const chatId = String(message.chat.id);
  const from = message.from;
  if (!from) return;

  const text = message.text?.trim() ?? "";
  const match = /^\/start(?:\s+(.+))?$/i.exec(text);
  const token = match?.[1]?.trim();

  if (!token) {
    await sendTelegramMessage(
      chatId,
      "Welcome to the Mélange Arbitrator bot.\n\nOpen the admin panel in your browser, go to <b>Trust & safety → Link Telegram</b>, and open the generated link here to receive verification and dispute alerts.",
    );
    return;
  }

  const telegramUserId = String(from.id);
  const result = await linkTelegramFromToken(token, telegramUserId);

  if (result.ok) {
    const name = from.first_name || result.name || "Admin";
    const status = result.alreadyLinked ? "already linked" : "now linked";
    await sendTelegramMessage(
      chatId,
      `Hi ${escapeHtml(name)}, your Telegram account is ${status} to Mélange admin alerts.\n\nYou will receive notifications here with inline buttons to approve verifications and resolve disputes.`,
    );
  } else {
    await sendTelegramMessage(
      chatId,
      "That link is invalid or expired. Please generate a new one from the Mélange admin panel.",
    );
  }
}

async function handleCallback(callback: TelegramCallbackQuery): Promise<void> {
  const from = callback.from;
  const chatId = callback.message ? String(callback.message.chat.id) : String(from.id);
  const telegramUserId = String(from.id);

  const admin = await findAdminByTelegramId(telegramUserId);
  if (!admin) {
    await answerCallbackQuery(callback.id, "You are not linked as a Mélange admin.");
    await sendTelegramMessage(chatId, "You are not linked as a Mélange admin.");
    return;
  }

  const data = callback.data ?? "";
  const [prefix, id] = data.split(":");
  if (!prefix || !id) {
    await answerCallbackQuery(callback.id, "Unknown action.");
    return;
  }

  switch (prefix) {
    case "va":
    case "vr": {
      const ok =
        prefix === "va"
          ? await approveVerificationAsAdmin(id, admin.id, true)
          : await rejectVerificationAsAdmin(id, admin.id, true);
      await answerCallbackQuery(callback.id, ok ? "Verification updated." : "Request not found or already reviewed.");
      await sendTelegramMessage(
        chatId,
        ok
          ? `Verification #${id.slice(0, 8)} was ${prefix === "va" ? "approved" : "rejected"}.`
          : `Could not update verification #${id.slice(0, 8)}. It may have already been reviewed.`,
      );
      break;
    }
    case "dr":
    case "df": {
      const resolution = prefix === "dr" ? "release" : "refund";
      try {
        await resolveDisputeAdmin(id, resolution);
        await answerCallbackQuery(callback.id, "Dispute resolved.");
        await sendTelegramMessage(
          chatId,
          `Dispute #${id.slice(0, 8)} was resolved: ${resolution === "release" ? "released to runner" : "refunded to buyer"}.`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not resolve dispute.";
        await answerCallbackQuery(callback.id, message);
        await sendTelegramMessage(chatId, `Could not resolve dispute #${id.slice(0, 8)}: ${message}`);
      }
      break;
    }
    default:
      await answerCallbackQuery(callback.id, "Unknown action.");
  }
}

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  if (update.message?.text && /^\/start\b/i.test(update.message.text)) {
    await handleStart(update.message);
    return;
  }

  if (update.callback_query) {
    await handleCallback(update.callback_query);
    return;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
