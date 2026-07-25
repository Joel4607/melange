import { getServiceClient } from "@/lib/supabase/service";

export type AdminActionType =
  | "verification_approve"
  | "verification_reject"
  | "dispute_release"
  | "dispute_refund"
  | "dispute_partial"
  | "telegram_link"
  | "runner_activate"
  | "runner_suspend"
  | "runner_quarantine"
  | "fraud_flags_clear";

export async function logAdminAction(
  adminId: string,
  action: AdminActionType,
  targetId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const db = getServiceClient();
  const { error } = await db.from("telegram_admin_actions").insert({
    admin_id: adminId,
    action,
    target_id: targetId,
    metadata,
  });

  if (error) {
    console.error("Failed to log admin action", { adminId, action, targetId, error });
  }
}
