import { getServiceClient } from "@/lib/supabase/service";
import { approveVerificationCore, rejectVerificationCore } from "@/lib/server/admin-verification";
import { logAdminAction } from "@/lib/server/admin-audit";
import { resolveDisputeAdmin } from "@/lib/server/disputes";
import { sendTelegramMessage, answerCallbackQuery, editTelegramMessage } from "./messaging";
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

async function isDuplicateUpdate(updateId: number): Promise<boolean> {
  const db = getServiceClient();
  const { error } = await db.from("telegram_webhook_updates").insert({ update_id: updateId });
  if (error) {
    if ((error as { code?: string }).code === "23505") return true;
    console.error("Failed to record Telegram update", error);
  }
  return false;
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
    await logAdminAction(profile.id, "telegram_link", profile.id, { telegram_user_id: telegramUserId });
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

interface DisputeContext {
  title: string;
  price: number;
  fee: number;
  runnerPayout: number;
  buyerRefund: number;
}

async function getDisputeContext(disputeId: string): Promise<DisputeContext | null> {
  const db = getServiceClient();
  const { data: dispute, error: dErr } = await db
    .from("disputes")
    .select("id, task_id, status")
    .eq("id", disputeId)
    .maybeSingle<{ id: string; task_id: string; status: string }>();
  if (dErr || !dispute || dispute.status !== "escalated") return null;

  const { data: task } = await db
    .from("tasks")
    .select("id, title, price, fee")
    .eq("id", dispute.task_id)
    .maybeSingle<{ id: string; title: string; price: string; fee: string }>();
  if (!task) return null;

  const price = Number(task.price ?? 0);
  const fee = Number(task.fee ?? 0);
  const runnerPayout = Math.max(0, price - fee);
  return {
    title: task.title,
    price,
    fee,
    runnerPayout,
    buyerRefund: price,
  };
}

function originalDisputeReplyMarkup(disputeId: string) {
  return {
    inline_keyboard: [
      [
        { text: "Release to runner", callback_data: `dr:${disputeId}` },
        { text: "Refund buyer", callback_data: `df:${disputeId}` },
      ],
    ],
  };
}

async function handleDisputeAction(
  disputeId: string,
  resolution: "release" | "refund",
  admin: { id: string; name: string | null },
  chatId: string,
  messageId?: number,
): Promise<void> {
  const before = await getDisputeContext(disputeId);
  if (!before) {
    const text = `Dispute #${disputeId.slice(0, 8)} is no longer escalated or could not be found.`;
    if (messageId) {
      await editTelegramMessage(chatId, messageId, text, { reply_markup: { inline_keyboard: [] } });
    } else {
      await sendTelegramMessage(chatId, text);
    }
    return;
  }

  await resolveDisputeAdmin(disputeId, resolution);

  const after = await getDisputeContext(disputeId);
  if (after) {
    const text = `Could not resolve dispute #${disputeId.slice(0, 8)}. Please try again or use the admin panel.`;
    if (messageId) {
      await editTelegramMessage(chatId, messageId, text, { reply_markup: { inline_keyboard: [] } });
    } else {
      await sendTelegramMessage(chatId, text);
    }
    return;
  }

  const actionType = resolution === "release" ? "dispute_release" : "dispute_refund";
  await logAdminAction(admin.id, actionType, disputeId, { resolution });

  const text = `Dispute #${disputeId.slice(0, 8)} was resolved by ${escapeHtml(admin.name ?? "admin")}: ${
    resolution === "release" ? "released to runner" : "refunded to buyer"
  }.`;
  if (messageId) {
    await editTelegramMessage(chatId, messageId, text, { reply_markup: { inline_keyboard: [] } });
  } else {
    await sendTelegramMessage(chatId, text);
  }
}

async function handleDisputeConfirmation(
  disputeId: string,
  resolution: "release" | "refund",
  chatId: string,
  messageId?: number,
): Promise<void> {
  const ctx = await getDisputeContext(disputeId);
  if (!ctx) {
    if (messageId) {
      await editTelegramMessage(
        chatId,
        messageId,
        `Dispute #${disputeId.slice(0, 8)} is no longer escalated or could not be found.`,
        { reply_markup: { inline_keyboard: [] } },
      );
    } else {
      await sendTelegramMessage(chatId, `Dispute #${disputeId.slice(0, 8)} is no longer escalated or could not be found.`);
    }
    return;
  }

  const amount = resolution === "release" ? ctx.runnerPayout : ctx.buyerRefund;
  const text = [
    `<b>Confirm dispute resolution</b>`,
    `Errand: ${escapeHtml(ctx.title)}`,
    `Action: ${resolution === "release" ? "Release to runner" : "Refund to buyer"}`,
    `Amount: GHS ${amount.toFixed(2)}`,
    `ID: #${disputeId.slice(0, 8)}`,
  ].join("\n");

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: `Yes, ${resolution}`, callback_data: `${resolution === "release" ? "dr" : "df"}_confirm:${disputeId}` },
        { text: "Cancel", callback_data: `${resolution === "release" ? "dr" : "df"}_cancel:${disputeId}` },
      ],
    ],
  };

  if (messageId) {
    await editTelegramMessage(chatId, messageId, text, { reply_markup: replyMarkup });
  } else {
    await sendTelegramMessage(chatId, text, { reply_markup: replyMarkup });
  }
}

async function cancelDisputeAction(
  disputeId: string,
  chatId: string,
  messageId?: number,
): Promise<void> {
  const ctx = await getDisputeContext(disputeId);
  if (!ctx) {
    if (messageId) {
      await editTelegramMessage(
        chatId,
        messageId,
        `Dispute #${disputeId.slice(0, 8)} is no longer escalated or could not be found.`,
        { reply_markup: { inline_keyboard: [] } },
      );
    } else {
      await sendTelegramMessage(chatId, `Dispute #${disputeId.slice(0, 8)} is no longer escalated or could not be found.`);
    }
    return;
  }

  const text = [
    `<b>Escalated dispute</b>`,
    `Errand: ${escapeHtml(ctx.title)}`,
    `Buyer refund: GHS ${ctx.buyerRefund.toFixed(2)}`,
    `Runner payout: GHS ${ctx.runnerPayout.toFixed(2)}`,
    `ID: #${disputeId.slice(0, 8)}`,
  ].join("\n");

  if (messageId) {
    await editTelegramMessage(chatId, messageId, text, { reply_markup: originalDisputeReplyMarkup(disputeId) });
  } else {
    await sendTelegramMessage(chatId, text, { reply_markup: originalDisputeReplyMarkup(disputeId) });
  }
}

async function handleCallback(callback: TelegramCallbackQuery): Promise<void> {
  const from = callback.from;
  const chatId = callback.message ? String(callback.message.chat.id) : String(from.id);
  const messageId = callback.message?.message_id;
  const telegramUserId = String(from.id);

  const admin = await findAdminByTelegramId(telegramUserId);
  if (!admin) {
    await answerCallbackQuery(callback.id, "You are not linked as a Mélange admin.");
    await sendTelegramMessage(chatId, "You are not linked as a Mélange admin.");
    return;
  }

  const data = callback.data ?? "";
  const [rawPrefix, id] = data.split(":");
  if (!rawPrefix || !id) {
    await answerCallbackQuery(callback.id, "Unknown action.");
    return;
  }

  const [base, modifier] = rawPrefix.split("_") as [string, string | undefined];

  switch (base) {
    case "va":
    case "vr": {
      if (modifier) {
        await answerCallbackQuery(callback.id, "Unknown action.");
        return;
      }
      const ok =
        base === "va"
          ? await approveVerificationCore(id, admin.id)
          : await rejectVerificationCore(id, admin.id);
      const statusText = ok
        ? `Verification #${id.slice(0, 8)} was ${base === "va" ? "approved" : "rejected"} by ${escapeHtml(admin.name ?? "admin")}.`
        : `Could not update verification #${id.slice(0, 8)}. It may have already been reviewed.`;
      await answerCallbackQuery(callback.id, ok ? "Verification updated." : "Request not found or already reviewed.");
      if (messageId) {
        await editTelegramMessage(chatId, messageId, statusText, { reply_markup: { inline_keyboard: [] } });
      } else {
        await sendTelegramMessage(chatId, statusText);
      }
      break;
    }
    case "dr":
    case "df": {
      const resolution = base === "dr" ? ("release" as const) : ("refund" as const);
      if (!modifier) {
        await answerCallbackQuery(callback.id, "Please confirm.");
        await handleDisputeConfirmation(id, resolution, chatId, messageId);
      } else if (modifier === "confirm") {
        try {
          await handleDisputeAction(id, resolution, admin, chatId, messageId);
          await answerCallbackQuery(callback.id, "Dispute resolved.");
        } catch {
          await answerCallbackQuery(callback.id, "Could not resolve dispute.");
          if (messageId) {
            await editTelegramMessage(chatId, messageId, `Could not resolve dispute #${id.slice(0, 8)}.`, {
              reply_markup: { inline_keyboard: [] },
            });
          } else {
            await sendTelegramMessage(chatId, `Could not resolve dispute #${id.slice(0, 8)}.`);
          }
        }
      } else if (modifier === "cancel") {
        await answerCallbackQuery(callback.id, "Cancelled.");
        await cancelDisputeAction(id, chatId, messageId);
      } else {
        await answerCallbackQuery(callback.id, "Unknown action.");
      }
      break;
    }
    default:
      await answerCallbackQuery(callback.id, "Unknown action.");
  }
}

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const duplicate = await isDuplicateUpdate(update.update_id);
  if (duplicate) {
    console.log(`Skipping duplicate Telegram update ${update.update_id}`);
    return;
  }

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
