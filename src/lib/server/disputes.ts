import { getServiceClient } from "@/lib/supabase/service";
import { releaseFunds, refund } from "./escrow";
import {
  arbitrate,
  DEFAULT_FRAUD_CONFIG,
  haversineKm,
  type ArbitrationResult,
  type DisputeClaim,
  type DisputeContext,
} from "@/lib/algorithm";
import type { DisputeRow, ProofRow, TaskRow } from "./rows";

type Db = ReturnType<typeof getServiceClient>;

/**
 * Resolve a dispute by gathering its evidence, running the pure `arbitrate`
 * engine, then persisting the outcome. Clear-cut cases are auto-resolved by the
 * system (and their escrow effect applied — `release` to the runner or `refund`
 * to the buyer); ambiguous or high-stakes cases are marked `escalated` for a
 * human admin and leave the funds untouched. Returns the arbitration result.
 */
export async function resolveDispute(disputeId: string): Promise<ArbitrationResult> {
  const db = getServiceClient();

  const { data: dispute, error: dErr } = await db
    .from("disputes")
    .select("id, task_id, reason, status")
    .eq("id", disputeId)
    .single<DisputeRow>();
  if (dErr || !dispute) throw new Error(`resolveDispute: dispute ${disputeId} not found`);

  const { data: task, error: tErr } = await db
    .from("tasks")
    .select(
      "id, buyer_id, category, pickup_lat, pickup_lng, urgency, price, status, selected_runner_id, accepted_at, completed_at",
    )
    .eq("id", dispute.task_id)
    .single<TaskRow>();
  if (tErr || !task) throw new Error(`resolveDispute: task ${dispute.task_id} not found`);

  const proof = await db
    .from("proofs")
    .select("gps_lat, gps_lng")
    .eq("task_id", task.id)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle<ProofRow>();
  if (proof.error) throw new Error(`resolveDispute: ${proof.error.message}`);

  const ctx: DisputeContext = {
    proofProvided: proof.data != null,
    gpsMatch: gpsMatch(proof.data, task),
    buyerClaim: classifyClaim(dispute.reason),
    fraudFlagged: await hasHardFraudFlag(db, task.selected_runner_id),
  };

  const result = arbitrate(ctx);

  if (result.escalate) {
    await db
      .from("disputes")
      .update({
        status: "escalated",
        decided_by: "admin",
        rule_matched: result.ruleMatched,
        confidence: result.confidence,
      })
      .eq("id", dispute.id);
    await db.from("tasks").update({ status: "disputed" }).eq("id", task.id);
    return result;
  }

  // System-decided: apply the escrow effect, then record the resolution.
  if (result.resolution === "release") {
    await releaseFunds(task.id);
  } else if (result.resolution === "refund") {
    await refund(task.id);
    if (task.selected_runner_id) {
      await db.from("trust_events").insert({
        runner_id: task.selected_runner_id,
        type: "dispute_lost",
        value: 1,
      });
    }
  }

  await db
    .from("disputes")
    .update({
      status: "auto_resolved",
      resolution: result.resolution,
      decided_by: "system",
      rule_matched: result.ruleMatched,
      confidence: result.confidence,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", dispute.id);
  await db.from("tasks").update({ status: "resolved" }).eq("id", task.id);

  return result;
}

function gpsMatch(proof: ProofRow | null, task: TaskRow): boolean | null {
  if (!proof || proof.gps_lat == null || proof.gps_lng == null) return null;
  const d = haversineKm(
    { lat: proof.gps_lat, lng: proof.gps_lng },
    { lat: task.pickup_lat, lng: task.pickup_lng },
  );
  return d <= DEFAULT_FRAUD_CONFIG.gpsToleranceKm;
}

function classifyClaim(reason: string): DisputeClaim {
  const r = reason.toLowerCase();
  if (r.includes("not delivered") || r.includes("not_delivered") || r.includes("never")) {
    return "not_delivered";
  }
  if (r.includes("wrong")) return "wrong_item";
  if (r.includes("damaged") || r.includes("broken")) return "damaged";
  return "other";
}

async function hasHardFraudFlag(db: Db, runnerId: string | null): Promise<boolean> {
  if (!runnerId) return false;
  const { data, error } = await db
    .from("fraud_flags")
    .select("id")
    .eq("runner_id", runnerId)
    .in("status", ["active", "confirmed"])
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (error) throw new Error(`resolveDispute: ${error.message}`);
  return data != null;
}
