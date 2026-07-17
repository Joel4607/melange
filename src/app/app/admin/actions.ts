"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { resolveDisputeAdmin } from "@/lib/server/disputes";

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

  await db.from("fraud_flags").update({ status }).eq("id", flagId);

  const { count } = await db
    .from("fraud_flags")
    .select("*", { count: "exact", head: true })
    .eq("runner_id", flag.runner_id)
    .in("status", ["active", "confirmed"]);

  await db
    .from("runner_profile")
    .update({
      status: count && count > 0 ? "quarantined" : "active",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", flag.runner_id);

  revalidatePath("/app/admin");
}

export async function approveVerification(requestId: string) {
  const adminId = await requireAdmin();
  const db = getServiceClient();
  const { data: request } = await db
    .from("verification_requests")
    .select("user_id, status")
    .eq("id", requestId)
    .maybeSingle<{ user_id: string; status: string }>();
  if (!request || request.status !== "pending") return;
  const now = new Date().toISOString();
  await db
    .from("verification_requests")
    .update({ status: "approved", reviewed_at: now, reviewed_by: adminId })
    .eq("id", requestId);
  await db.from("profiles").update({ verified: true }).eq("id", request.user_id);
  await db
    .from("runner_profile")
    .update({ verified: true, updated_at: now })
    .eq("user_id", request.user_id);

  revalidatePath("/app/admin");
  revalidatePath("/app");
  revalidatePath("/app/verify");
}

export async function rejectVerification(requestId: string) {
  const adminId = await requireAdmin();
  const db = getServiceClient();
  const { data: request } = await db
    .from("verification_requests")
    .select("user_id, status")
    .eq("id", requestId)
    .maybeSingle<{ user_id: string; status: string }>();
  if (!request || request.status !== "pending") return;
  const now = new Date().toISOString();
  await db
    .from("verification_requests")
    .update({ status: "rejected", reviewed_at: now, reviewed_by: adminId })
    .eq("id", requestId);
  await db.from("profiles").update({ verified: false }).eq("id", request.user_id);
  await db
    .from("runner_profile")
    .update({ verified: false, updated_at: now })
    .eq("user_id", request.user_id);

  revalidatePath("/app/admin");
  revalidatePath("/app");
  revalidatePath("/app/verify");
}
