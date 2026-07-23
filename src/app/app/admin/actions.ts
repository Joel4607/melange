"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { resolveDisputeAdmin } from "@/lib/server/disputes";
import { createTelegramLinkToken, getBotUsernameFromToken } from "@/lib/telegram/init-data";

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
  if (!data?.is_admin) redirect("/app");
  return userId;
}

export { requireAdmin };

export async function adminResolveDispute(
  disputeId: string,
  resolution: string,
) {
  await requireAdmin();
  if (resolution !== "release" && resolution !== "refund" && resolution !== "partial") {
    throw new Error("Invalid resolution");
  }
  await resolveDisputeAdmin(disputeId, resolution);

  revalidatePath("/app/admin");
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

  revalidatePath("/app/admin");
}

export async function approveVerificationAsAdmin(requestId: string, adminId: string) {
  const db = getServiceClient();
  const { data: request } = await db
    .from("verification_requests")
    .select("user_id, status")
    .eq("id", requestId)
    .maybeSingle<{ user_id: string; status: string }>();
  if (!request || request.status !== "pending") return false;
  const now = new Date().toISOString();
  const { data: updated } = await db
    .from("verification_requests")
    .update({ status: "approved", reviewed_at: now, reviewed_by: adminId })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("user_id")
    .maybeSingle<{ user_id: string }>();
  if (!updated) return false;
  await db.from("profiles").update({ verified: true }).eq("id", updated.user_id);
  await db
    .from("runner_profile")
    .update({ verified: true, updated_at: now })
    .eq("user_id", updated.user_id);

  revalidatePath("/app/admin");
  revalidatePath("/app");
  revalidatePath("/app/verify");
  return true;
}

export async function approveVerification(requestId: string) {
  const adminId = await requireAdmin();
  await approveVerificationAsAdmin(requestId, adminId);
}

export async function rejectVerificationAsAdmin(requestId: string, adminId: string) {
  const db = getServiceClient();
  const { data: request } = await db
    .from("verification_requests")
    .select("user_id, status")
    .eq("id", requestId)
    .maybeSingle<{ user_id: string; status: string }>();
  if (!request || request.status !== "pending") return false;
  const now = new Date().toISOString();
  const { data: updated } = await db
    .from("verification_requests")
    .update({ status: "rejected", reviewed_at: now, reviewed_by: adminId })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("user_id")
    .maybeSingle<{ user_id: string }>();
  if (!updated) return false;
  await db.from("profiles").update({ verified: false }).eq("id", updated.user_id);
  await db
    .from("runner_profile")
    .update({ verified: false, updated_at: now })
    .eq("user_id", updated.user_id);

  revalidatePath("/app/admin");
  revalidatePath("/app");
  revalidatePath("/app/verify");
  return true;
}

export async function rejectVerification(requestId: string) {
  const adminId = await requireAdmin();
  await rejectVerificationAsAdmin(requestId, adminId);
}

export async function generateTelegramLink(): Promise<{ ok: boolean; link?: string; error?: string }> {
  const adminId = await requireAdmin();
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return { ok: false, error: "Telegram bot token is not configured" };

  const [username, { data: profile }] = await Promise.all([
    getBotUsernameFromToken(botToken),
    getServiceClient().from("profiles").select("telegram_user_id").eq("id", adminId).maybeSingle<{ telegram_user_id: string | null }>(),
  ]);

  if (!username) return { ok: false, error: "Could not fetch bot username from Telegram" };
  if (profile?.telegram_user_id) return { ok: false, error: "This admin account is already linked to Telegram" };

  const token = createTelegramLinkToken(adminId, botToken);
  const link = `https://t.me/${username}?startapp=${encodeURIComponent(token)}`;
  return { ok: true, link };
}
