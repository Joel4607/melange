"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { resolveDisputeAdmin } from "@/lib/server/disputes";
import { approveVerificationCore, rejectVerificationCore } from "@/lib/server/admin-verification";
import { logAdminAction } from "@/lib/server/admin-audit";
import { createTelegramLinkToken, getBotUsernameFromToken } from "@/lib/telegram/init-data";
import { getTelegramBotToken } from "@/lib/telegram/env";

async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user.id;
}

async function requireAdmin(): Promise<string> {
  const userId = await requireUserId();
  const db = getServiceClient();
  const { data } = await db
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle<{ is_admin: boolean }>();
  if (!data?.is_admin) redirect("/admin/login");
  return userId;
}

export { requireAdmin };

export async function adminResolveDispute(
  disputeId: string,
  resolution: string,
) {
  const adminId = await requireAdmin();
  if (resolution !== "release" && resolution !== "refund" && resolution !== "partial") {
    throw new Error("Invalid resolution");
  }
  await resolveDisputeAdmin(disputeId, resolution);

  const actionType =
    resolution === "release"
      ? "dispute_release"
      : resolution === "refund"
        ? "dispute_refund"
        : "dispute_partial";
  await logAdminAction(adminId, actionType, disputeId, { resolution });

  revalidatePath("/admin");
}

export async function updateFraudFlag(
  flagId: string,
  status: string,
) {
  await requireAdmin();
  if (status !== "cleared" && status !== "confirmed") {
    throw new Error("Invalid fraud flag status");
  }

  const db = getServiceClient();
  const { data: flag } = await db
    .from("fraud_flags")
    .select("id, runner_id")
    .eq("id", flagId)
    .maybeSingle<{ id: string; runner_id: string }>();
  if (!flag) return;

  const { data: updatedFlag } = await db
    .from("fraud_flags")
    .update({ status })
    .eq("id", flagId)
    .eq("status", "active")
    .select("id")
    .maybeSingle<{ id: string }>();
  if (!updatedFlag) return;

  const { count } = await db
    .from("fraud_flags")
    .select("*", { count: "exact", head: true })
    .eq("runner_id", flag.runner_id)
    .in("status", ["active", "confirmed"]);

  const runnerStatus = count && count > 0 ? "quarantined" : "active";
  const update: { status: string; updated_at: string; is_available?: boolean } = {
    status: runnerStatus,
    updated_at: new Date().toISOString(),
  };
  if (runnerStatus === "quarantined") update.is_available = false;
  await db.from("runner_profile").update(update).eq("user_id", flag.runner_id);

  revalidatePath("/admin");
}

export async function approveVerification(requestId: string) {
  const adminId = await requireAdmin();
  const ok = await approveVerificationCore(requestId, adminId);
  if (ok) {
    revalidatePath("/admin");
    revalidatePath("/app");
    revalidatePath("/app/verify");
  }
}

export async function rejectVerification(requestId: string) {
  const adminId = await requireAdmin();
  const ok = await rejectVerificationCore(requestId, adminId);
  if (ok) {
    revalidatePath("/admin");
    revalidatePath("/app");
    revalidatePath("/app/verify");
  }
}

export async function generateTelegramLink(): Promise<{ ok: boolean; link?: string; error?: string }> {
  const adminId = await requireAdmin();
  const botToken = getTelegramBotToken();
  if (!botToken) return { ok: false, error: "Telegram bot token is not configured" };

  const username = await getBotUsernameFromToken(botToken);
  if (!username) return { ok: false, error: "Could not fetch bot username from Telegram" };

  const token = await createTelegramLinkToken(adminId);
  const link = `https://t.me/${username}?start=${encodeURIComponent(token)}`;
  return { ok: true, link };
}

export async function getAdminTelegramStatus(): Promise<{
  ok: boolean;
  linkedTelegramId?: string | null;
  link?: string;
  error?: string;
}> {
  const adminId = await requireAdmin();
  const botToken = getTelegramBotToken();
  if (!botToken) return { ok: false, error: "Telegram bot token is not configured" };

  const [username, { data: profile }] = await Promise.all([
    getBotUsernameFromToken(botToken),
    getServiceClient().from("profiles").select("telegram_user_id").eq("id", adminId).maybeSingle<{ telegram_user_id: string | null }>(),
  ]);

  if (!username) return { ok: false, error: "Could not fetch bot username from Telegram" };

  const token = await createTelegramLinkToken(adminId);
  const link = `https://t.me/${username}?start=${encodeURIComponent(token)}`;
  return { ok: true, linkedTelegramId: profile?.telegram_user_id ?? null, link };
}

export async function unlinkTelegram(): Promise<{ ok: boolean; error?: string }> {
  const adminId = await requireAdmin();
  const db = getServiceClient();
  const { data: profile } = await db
    .from("profiles")
    .select("telegram_user_id")
    .eq("id", adminId)
    .maybeSingle<{ telegram_user_id: string | null }>();

  if (!profile?.telegram_user_id) {
    return { ok: false, error: "This admin account is not linked to Telegram" };
  }

  const { error } = await db.from("profiles").update({ telegram_user_id: null }).eq("id", adminId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  revalidatePath("/admin/telegram-link");
  return { ok: true };
}
