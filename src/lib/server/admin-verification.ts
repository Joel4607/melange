import { getServiceClient } from "@/lib/supabase/service";
import { logAdminAction } from "./admin-audit";

export async function approveVerificationCore(requestId: string, adminId: string): Promise<boolean> {
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
  await db.from("runner_profile").upsert({
    user_id: updated.user_id,
    verified: true,
    updated_at: now,
  });

  await logAdminAction(adminId, "verification_approve", requestId, { user_id: updated.user_id });
  return true;
}

export async function rejectVerificationCore(requestId: string, adminId: string): Promise<boolean> {
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
  await db.from("runner_profile").upsert({
    user_id: updated.user_id,
    verified: false,
    updated_at: now,
  });

  await logAdminAction(adminId, "verification_reject", requestId, { user_id: updated.user_id });
  return true;
}
