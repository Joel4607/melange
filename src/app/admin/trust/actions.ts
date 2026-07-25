"use server";

import { revalidatePath } from "next/cache";
import { getServiceClient } from "@/lib/supabase/service";
import { refreshTrustScore } from "@/lib/server/matching";
import { logAdminAction } from "@/lib/server/admin-audit";
import { requireAdmin } from "../actions";

export async function updateRunnerStatus(
  runnerId: string,
  status: "active" | "quarantined" | "suspended",
) {
  const adminId = await requireAdmin();
  const db = getServiceClient();

  const update: { status: string; updated_at: string; is_available?: boolean } = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === "quarantined" || status === "suspended") {
    update.is_available = false;
  }

  const { error } = await db.from("runner_profile").update(update).eq("user_id", runnerId);
  if (error) throw new Error(error.message);

  const actionType =
    status === "active"
      ? "runner_activate"
      : status === "quarantined"
        ? "runner_quarantine"
        : "runner_suspend";
  await logAdminAction(adminId, actionType, runnerId, { status });

  await refreshTrustScore(runnerId);
  revalidatePath("/admin/trust");
  revalidatePath(`/admin/trust/${runnerId}`);
}

export async function clearRunnerFraudFlags(runnerId: string) {
  const adminId = await requireAdmin();
  const db = getServiceClient();

  const { error } = await db
    .from("fraud_flags")
    .update({ status: "cleared" })
    .eq("runner_id", runnerId)
    .eq("status", "active");
  if (error) throw new Error(error.message);

  const { error: profileError } = await db
    .from("runner_profile")
    .update({ status: "active", is_available: true, updated_at: new Date().toISOString() })
    .eq("user_id", runnerId);
  if (profileError) throw new Error(profileError.message);

  await logAdminAction(adminId, "fraud_flags_clear", runnerId);
  await refreshTrustScore(runnerId);
  revalidatePath("/admin/trust");
  revalidatePath(`/admin/trust/${runnerId}`);
}

export async function recalculateRunnerTrust(runnerId: string) {
  const adminId = await requireAdmin();
  await refreshTrustScore(runnerId);
  await logAdminAction(adminId, "runner_activate", runnerId, { recalculated: true });
  revalidatePath("/admin/trust");
  revalidatePath(`/admin/trust/${runnerId}`);
}
