import { getServiceClient } from "@/lib/supabase/service";
import {
  computeTrust,
  evaluateFraud,
  rankRunners,
  type FraudResult,
  type MatchResult,
  type RunnerCandidate,
  type TaskRequest,
  type TrustEvent,
  type TrustEventType,
} from "@/lib/algorithm";
import { createNotification } from "./notifications";
import type { RunnerProfileRow, TaskRow, TrustEventRow } from "./rows";

const TRUST_EVENT_TYPES: ReadonlySet<string> = new Set<TrustEventType>([
  "completed",
  "cancelled",
  "rating",
  "responsiveness",
  "dispute_lost",
]);

/** Cancellations within this window feed the rapid-cancellation fraud rule. */
const CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Run the matcher for a task and persist the ranking snapshot.
 *
 * This is the single place the pure algorithm meets the database: it loads the
 * task and the pool of available runners, derives each runner's fresh trust and
 * fraud risk from their `trust_events`, ranks the fraud-cleared pool with
 * `rankRunners`, then writes one `match_runs` row + its ranked `match_candidates`
 * and advances a freshly-posted task to `matched`. Returns the ranked results.
 */
export async function generateMatchRun(taskId: string): Promise<MatchResult[]> {
  const db = getServiceClient();
  const now = Date.now();

  const { data: task, error: taskError } = await db
    .from("tasks")
    .select(
      "id, buyer_id, category, pickup_lat, pickup_lng, urgency, price, status, selected_runner_id, accepted_at, completed_at",
    )
    .eq("id", taskId)
    .single<TaskRow>();
  if (taskError || !task) {
    throw new Error(`generateMatchRun: task ${taskId} not found`);
  }

  const { data: runners, error: runnersError } = await db
    .from("runner_profile")
    .select(
      "user_id, current_lat, current_lng, is_available, active_load, trust_score, status",
    )
    .eq("is_available", true)
    .eq("status", "active")
    .returns<RunnerProfileRow[]>();
  if (runnersError) {
    throw new Error(`generateMatchRun: ${runnersError.message}`);
  }

  const located = (runners ?? []).filter(
    (r) => r.current_lat != null && r.current_lng != null,
  );

  const eventsByRunner = await loadTrustEvents(
    db,
    located.map((r) => r.user_id),
  );

  // For each runner: fraud first (drop hard-flagged), then a fraud-aware trust
  // score, then assemble the candidate the matcher consumes.
  const verifiedById = await loadVerified(
    db,
    located.map((r) => r.user_id),
  );

  const candidates: RunnerCandidate[] = [];
  const trustScores: { user_id: string; trust_score: number; updated_at: string }[] = [];
  for (const r of located) {
    const events = eventsByRunner.get(r.user_id) ?? [];
    const { trust, action } = runnerTrustSnapshot(
      events,
      verifiedById.get(r.user_id) ?? false,
      now,
    );

    trustScores.push({
      user_id: r.user_id,
      trust_score: trust,
      updated_at: new Date(now).toISOString(),
    });

    if (action === "exclude") continue;

    candidates.push({
      runnerId: r.user_id,
      location: { lat: r.current_lat!, lng: r.current_lng! },
      trust,
      activeLoad: r.active_load,
      available: true,
    });
  }

  if (trustScores.length > 0) {
    const { error: trustError } = await db
      .from("runner_profile")
      .upsert(trustScores, { onConflict: "user_id" });
    if (trustError) {
      throw new Error(`generateMatchRun: ${trustError.message}`);
    }
  }

  const request: TaskRequest = {
    pickup: { lat: task.pickup_lat, lng: task.pickup_lng },
    category: task.category ?? undefined,
    urgency: task.urgency,
  };
  const results = rankRunners(request, candidates);

  const { data: run, error: runError } = await db
    .from("match_runs")
    .insert({ task_id: task.id })
    .select("id")
    .single<{ id: string }>();
  if (runError || !run) {
    throw new Error(`generateMatchRun: failed to create match_run`);
  }

  if (results.length > 0) {
    const rows = results.map((m) => ({
      match_run_id: run.id,
      runner_id: m.runnerId,
      rank: m.rank,
      match_score: m.matchScore,
      proximity: m.components.proximity,
      trust: m.components.trust,
      availability: m.components.availability,
      urgency_fit: m.components.urgencyFit,
      distance_km: m.components.distanceKm,
    }));
    const { error: candError } = await db.from("match_candidates").insert(rows);
    if (candError) {
      throw new Error(`generateMatchRun: ${candError.message}`);
    }
  }

  if (task.status === "posted") {
    await db.from("tasks").update({ status: "matched" }).eq("id", task.id);
  }

  return results;
}

/**
 * Recompute and persist a single runner's cached `trust_score`.
 * Call this after a `trust_events` row is inserted so the cache stays fresh
 * between full match runs.
 */
export async function refreshTrustScore(runnerId: string): Promise<void> {
  const db = getServiceClient();
  const now = Date.now();

  const eventsByRunner = await loadTrustEvents(db, [runnerId]);
  const verifiedById = await loadVerified(db, [runnerId]);

  const { trust } = runnerTrustSnapshot(
    eventsByRunner.get(runnerId) ?? [],
    verifiedById.get(runnerId) ?? false,
    now,
  );

  const { error } = await db
    .from("runner_profile")
    .update({ trust_score: trust, updated_at: new Date(now).toISOString() })
    .eq("user_id", runnerId);
  if (error) {
    throw new Error(`refreshTrustScore: ${error.message}`);
  }
}

function runnerTrustSnapshot(
  events: TrustEvent[],
  verified: boolean,
  now: number,
): { trust: number; action: FraudResult["action"] } {
  const recentCancellations = events.filter(
    (e) => e.type === "cancelled" && now - e.at <= CANCELLATION_WINDOW_MS,
  ).length;

  const fraud = evaluateFraud({ recentCancellations });
  const { trust } = computeTrust({
    events,
    verified,
    fraudRisk: fraud.risk,
    now,
  });

  return { trust, action: fraud.action };
}

export async function offerToTopCandidate(taskId: string): Promise<string | null> {
  const db = getServiceClient();
  const { data: task, error: taskError } = await db
    .from("tasks")
    .select("id, title, declined_runner_ids")
    .eq("id", taskId)
    .single<{ id: string; title: string; declined_runner_ids: string[] }>();
  if (taskError || !task) {
    throw new Error(`offerToTopCandidate: task ${taskId} not found`);
  }

  const { data: run, error: runError } = await db
    .from("match_runs")
    .select("id")
    .eq("task_id", taskId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (runError) {
    throw new Error(`offerToTopCandidate: ${runError.message}`);
  }

  let runnerId: string | null = null;
  if (run) {
    const { data: candidates, error: candidateError } = await db
      .from("match_candidates")
      .select("runner_id")
      .eq("match_run_id", run.id)
      .order("rank", { ascending: true })
      .returns<{ runner_id: string }[]>();
    if (candidateError) {
      throw new Error(`offerToTopCandidate: ${candidateError.message}`);
    }

    const declined = new Set(task.declined_runner_ids ?? []);
    runnerId = (candidates ?? []).find((candidate) => !declined.has(candidate.runner_id))?.runner_id ?? null;
  }

  await db
    .from("tasks")
    .update({ selected_runner_id: runnerId })
    .eq("id", taskId);

  if (runnerId) {
    await createNotification(runnerId, "offer", {
      task_id: taskId,
      task_title: task.title,
    });
  }

  return runnerId;
}

async function loadTrustEvents(
  db: ReturnType<typeof getServiceClient>,
  runnerIds: string[],
): Promise<Map<string, TrustEvent[]>> {
  const byRunner = new Map<string, TrustEvent[]>();
  if (runnerIds.length === 0) return byRunner;

  const { data, error } = await db
    .from("trust_events")
    .select("runner_id, type, value, created_at")
    .in("runner_id", runnerIds)
    .returns<TrustEventRow[]>();
  if (error) {
    throw new Error(`generateMatchRun: ${error.message}`);
  }

  for (const row of data ?? []) {
    if (!TRUST_EVENT_TYPES.has(row.type)) continue;
    const list = byRunner.get(row.runner_id) ?? [];
    list.push({
      type: row.type as TrustEventType,
      value: row.value,
      at: new Date(row.created_at).getTime(),
    });
    byRunner.set(row.runner_id, list);
  }
  return byRunner;
}

async function loadVerified(
  db: ReturnType<typeof getServiceClient>,
  ids: string[],
): Promise<Map<string, boolean>> {
  const byId = new Map<string, boolean>();
  if (ids.length === 0) return byId;

  const { data, error } = await db
    .from("profiles")
    .select("id, verified")
    .in("id", ids)
    .returns<{ id: string; verified: boolean }[]>();
  if (error) {
    throw new Error(`generateMatchRun: ${error.message}`);
  }
  for (const row of data ?? []) byId.set(row.id, row.verified);
  return byId;
}
