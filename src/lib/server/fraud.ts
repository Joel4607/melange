import { type SupabaseClient } from "@supabase/supabase-js";
import { evaluateFraud, haversineKm } from "@/lib/algorithm";
import type { FraudContext, FraudResult } from "@/lib/algorithm";
import type { ProofRow, TaskRow } from "./rows";

const CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;

type Db = SupabaseClient;

export async function hasActiveFraudFlag(
  db: Db,
  runnerId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("fraud_flags")
    .select("id")
    .eq("runner_id", runnerId)
    .in("status", ["active", "confirmed"])
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (error) throw new Error(`fraudFlags: ${error.message}`);
  return data != null;
}

export async function loadActiveFraudFlags(
  db: Db,
  runnerIds: string[],
): Promise<Set<string>> {
  const flags = new Set<string>();
  if (runnerIds.length === 0) return flags;
  const { data, error } = await db
    .from("fraud_flags")
    .select("runner_id")
    .in("runner_id", runnerIds)
    .in("status", ["active", "confirmed"])
    .returns<{ runner_id: string }[]>();
  if (error) throw new Error(`loadActiveFraudFlags: ${error.message}`);
  for (const row of data ?? []) flags.add(row.runner_id);
  return flags;
}

export async function countRecentCancellations(
  db: Db,
  runnerId: string,
  now: number,
): Promise<number> {
  const since = new Date(now - CANCELLATION_WINDOW_MS).toISOString();
  const { count, error } = await db
    .from("trust_events")
    .select("*", { count: "exact", head: true })
    .eq("runner_id", runnerId)
    .eq("type", "cancelled")
    .gte("created_at", since);
  if (error) throw new Error(`countRecentCancellations: ${error.message}`);
  return count ?? 0;
}

export async function loadCancellationCounts(
  db: Db,
  runnerIds: string[],
  now: number,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (runnerIds.length === 0) return counts;
  const since = new Date(now - CANCELLATION_WINDOW_MS).toISOString();
  const { data, error } = await db
    .from("trust_events")
    .select("runner_id")
    .in("runner_id", runnerIds)
    .eq("type", "cancelled")
    .gte("created_at", since)
    .returns<{ runner_id: string }[]>();
  if (error) throw new Error(`loadCancellationCounts: ${error.message}`);
  for (const row of data ?? []) {
    counts.set(row.runner_id, (counts.get(row.runner_id) ?? 0) + 1);
  }
  return counts;
}

export async function countPairDisputes(
  db: Db,
  runnerId: string,
  buyerId: string,
): Promise<number> {
  const { data: tasks, error } = await db
    .from("tasks")
    .select("id")
    .eq("buyer_id", buyerId)
    .eq("selected_runner_id", runnerId)
    .returns<{ id: string }[]>();
  if (error) throw new Error(`countPairDisputes: ${error.message}`);
  if (!tasks?.length) return 0;

  const taskIds = tasks.map((t) => t.id);
  const { count, error: dErr } = await db
    .from("disputes")
    .select("*", { count: "exact", head: true })
    .in("task_id", taskIds);
  if (dErr) throw new Error(`countPairDisputes: ${dErr.message}`);
  return count ?? 0;
}

export async function loadPairDisputeCounts(
  db: Db,
  runnerIds: string[],
  buyerId: string,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (runnerIds.length === 0) return counts;

  const { data: tasks, error } = await db
    .from("tasks")
    .select("id, selected_runner_id")
    .eq("buyer_id", buyerId)
    .in("selected_runner_id", runnerIds)
    .returns<{ id: string; selected_runner_id: string }[]>();
  if (error) throw new Error(`loadPairDisputeCounts: ${error.message}`);
  if (!tasks?.length) return counts;

  const taskIds = tasks.map((t) => t.id);
  const { data: disputes, error: dErr } = await db
    .from("disputes")
    .select("task_id")
    .in("task_id", taskIds)
    .returns<{ task_id: string }[]>();
  if (dErr) throw new Error(`loadPairDisputeCounts: ${dErr.message}`);

  const runnerByTask = new Map(tasks.map((t) => [t.id, t.selected_runner_id]));
  for (const d of disputes ?? []) {
    const runnerId = runnerByTask.get(d.task_id);
    if (!runnerId) continue;
    counts.set(runnerId, (counts.get(runnerId) ?? 0) + 1);
  }
  return counts;
}

export async function evaluateCancellationFraud(
  db: Db,
  runnerId: string,
  buyerId: string,
  now: number,
): Promise<FraudResult> {
  const [recentCancellations, disputesWithSameCounterparty] = await Promise.all([
    countRecentCancellations(db, runnerId, now),
    countPairDisputes(db, runnerId, buyerId),
  ]);
  return evaluateFraud({ recentCancellations, disputesWithSameCounterparty });
}

export async function evaluateTaskFraud(
  db: Db,
  task: TaskRow,
  proof: ProofRow | null,
  now: number,
): Promise<FraudResult> {
  const runnerId = task.selected_runner_id;
  if (!runnerId) {
    return { findings: [], risk: 0, action: "clear", escalate: false };
  }

  const [recentCancellations, disputesWithSameCounterparty] = await Promise.all([
    countRecentCancellations(db, runnerId, now),
    countPairDisputes(db, runnerId, task.buyer_id),
  ]);

  const proofLocation =
    proof?.gps_lat != null && proof?.gps_lng != null
      ? { lat: proof.gps_lat, lng: proof.gps_lng }
      : undefined;

  const targetLat = task.dropoff_lat ?? task.pickup_lat;
  const targetLng = task.dropoff_lng ?? task.pickup_lng;

  const taskDistanceKm = haversineKm(
    { lat: task.pickup_lat, lng: task.pickup_lng },
    { lat: targetLat, lng: targetLng },
  );

  const ctx: FraudContext = {
    proofLocation,
    taskLocation: { lat: targetLat, lng: targetLng },
    taskDistanceKm,
    acceptedAt: task.accepted_at ? new Date(task.accepted_at).getTime() : undefined,
    completedAt: task.completed_at ? new Date(task.completed_at).getTime() : undefined,
    recentCancellations,
    disputesWithSameCounterparty,
  };
  return evaluateFraud(ctx);
}

export async function persistFraudFlags(
  db: Db,
  runnerId: string,
  taskId: string,
  result: FraudResult,
): Promise<void> {
  if (result.action !== "exclude") return;
  const triggered = result.findings.filter((f) => f.triggered);
  if (triggered.length === 0) return;

  const rows = triggered.map((f) => ({
    runner_id: runnerId,
    task_id: taskId,
    rule_type: f.ruleType,
    severity: f.severity,
    status: "active" as const,
    detail: f.detail,
  }));

  const { error } = await db.from("fraud_flags").insert(rows);
  if (error) {
    if (error.code === "23505") return;
    throw new Error(`persistFraudFlags: ${error.message}`);
  }

  // ponytail: a hard-threshold result immediately quarantines the runner so they
  // cannot be matched while the flag is active. Admin review can clear it.
  const { error: statusErr } = await db
    .from("runner_profile")
    .update({ status: "quarantined", is_available: false, updated_at: new Date().toISOString() })
    .eq("user_id", runnerId);
  if (statusErr) throw new Error(`persistFraudFlags: ${statusErr.message}`);
}
