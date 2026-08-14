import { getServiceClient } from "@/lib/supabase/service";
import {
  CALIBRATED_MATCH_CONFIG,
  computeTrust,
  evaluateFraud,
  rankRunners,
  type FraudContext,
  type FraudAction,
  type FraudResult,
  type MatchRunOutcome,
  type RunnerCandidate,
  type TaskRequest,
  type TrustEvent,
  type TrustEventType,
} from "@/lib/algorithm";
import { isRunnerAvailable } from "@/lib/availability";
import {
  countRecentCancellations,
  hasActiveFraudFlag,
  loadActiveFraudFlags,
  loadCancellationCounts,
  loadPairDisputeCounts,
} from "./fraud";
import { createNotification } from "./notifications";
import { liveRunnerLocations } from "./presence";
import type { RunnerProfileRow, TaskRow, TrustEventRow } from "./rows";

const TRUST_EVENT_TYPES: ReadonlySet<string> = new Set<TrustEventType>([
  "completed",
  "cancelled",
  "rating",
  "responsiveness",
  "dispute_lost",
]);

export type MatchRunSource = "automatic" | "manual" | "self_claim";
export type MatchOutcomeEvent =
  | "offered"
  | "accepted"
  | "declined"
  | "picked_up"
  | "completed"
  | "cancelled"
  | "disputed"
  | "resolved";

interface FinalizeMatchRunRow {
  status: "matched" | "no_candidates" | "not_posted";
  run_id: string | null;
}

export interface OfferMatchRow {
  status: "offered" | "reopened" | "not_matchable";
  offered_runner_id: string | null;
  run_id: string | null;
}

export function toRunnerCandidate(
  runner: RunnerProfileRow,
  trust: number,
  verified: boolean,
  fraudAction: FraudAction,
  available = true,
): RunnerCandidate {
  return {
    runnerId: runner.user_id,
    location:
      runner.current_lat == null || runner.current_lng == null
        ? null
        : { lat: runner.current_lat, lng: runner.current_lng },
    trust,
    activeLoad: runner.active_load,
    available,
    active: runner.status === "active",
    verified,
    fraudAction,
    capabilities: runner.capabilities ?? undefined,
  };
}

/**
 * Run the matcher for a task and persist the ranking snapshot.
 *
 * This is the single place the pure algorithm meets the database: it loads the
 * task and the pool of available runners, derives each runner's fresh trust and
 * fraud risk from their `trust_events`, ranks the fraud-cleared pool with
 * `rankRunners`, then writes one `match_runs` row + its ranked `match_candidates`
 * and advances a freshly-posted task to `matched`. Returns the ranked results.
 */
export async function generateMatchRun(
  taskId: string,
  source: Exclude<MatchRunSource, "self_claim"> = "automatic",
): Promise<MatchRunOutcome> {
  const db = getServiceClient();
  const now = Date.now();

  const { data: task, error: taskError } = await db
    .from("tasks")
    .select(
      "id, buyer_id, category, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, urgency, price, fee, status, selected_runner_id, accepted_at, completed_at",
    )
    .eq("id", taskId)
    .maybeSingle<TaskRow>();
  if (taskError || !task) {
    throw new Error(`generateMatchRun: task ${taskId} not found`);
  }
  if (task.status !== "posted") {
    return { status: "not_posted", runId: null, results: [] };
  }

  const { data: runners, error: runnersError } = await db
    .from("runner_profile")
    .select(
      "user_id, current_lat, current_lng, is_available, active_load, trust_score, verified, status, capabilities, available_manual, scheduled_hours",
    )
    .returns<RunnerProfileRow[]>();
  if (runnersError) {
    throw new Error(`generateMatchRun: ${runnersError.message}`);
  }

  // Prefer fresh Redis presence positions over the (periodically synced)
  // Postgres coords; runners with neither are unmatchable. Availability is
  // computed from the manual toggle or the scheduled hours for the current time.
  const liveById = await liveRunnerLocations(
    (runners ?? []).map((r) => r.user_id),
  );
  const nowDate = new Date(now);
  const resolvedRunners = (runners ?? [])
    .map((r) => {
      const live = liveById.get(r.user_id);
      return live ? { ...r, current_lat: live.lat, current_lng: live.lng } : r;
    });

  const runnerIds = resolvedRunners.map((r) => r.user_id);
  const [eventsByRunner, verifiedById, cancellationCounts, pairDisputeCounts, activeFraudFlags] =
    await Promise.all([
      loadTrustEvents(db, runnerIds),
      loadVerified(db, runnerIds),
      loadCancellationCounts(db, runnerIds, now),
      loadPairDisputeCounts(db, runnerIds, task.buyer_id),
      loadActiveFraudFlags(db, runnerIds),
    ]);

  const candidates: RunnerCandidate[] = [];
  const trustScores: { user_id: string; trust_score: number; updated_at: string }[] = [];
  for (const r of resolvedRunners) {
    const verified = verifiedById.get(r.user_id) ?? false;
    const events = eventsByRunner.get(r.user_id) ?? [];
    const fraudContext: FraudContext = {
      recentCancellations: cancellationCounts.get(r.user_id) ?? 0,
      disputesWithSameCounterparty: pairDisputeCounts.get(r.user_id) ?? 0,
    };
    const { trust, action } = runnerTrustSnapshot(
      events,
      verified,
      now,
      fraudContext,
      activeFraudFlags.has(r.user_id),
    );

    trustScores.push({
      user_id: r.user_id,
      trust_score: trust,
      updated_at: new Date(now).toISOString(),
    });

    candidates.push(
      toRunnerCandidate(
        r,
        trust,
        verified,
        action,
        isRunnerAvailable(r.available_manual, r.scheduled_hours, nowDate),
      ),
    );
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
  const results = rankRunners(request, candidates, CALIBRATED_MATCH_CONFIG);
  const { data, error } = await db.rpc("finalize_match_run", {
    p_task_id: task.id,
    p_source: source,
    p_algorithm_version: CALIBRATED_MATCH_CONFIG.algorithmVersion,
    p_config_version: CALIBRATED_MATCH_CONFIG.configVersion,
    p_config: CALIBRATED_MATCH_CONFIG,
    p_candidates: results,
    p_self_claim_runner_id: null,
  });
  if (error) {
    throw new Error(`generateMatchRun: ${error.message}`);
  }

  const finalized = (Array.isArray(data) ? data[0] : data) as FinalizeMatchRunRow | null;
  if (!finalized || !["matched", "no_candidates", "not_posted"].includes(finalized.status)) {
    throw new Error("generateMatchRun: invalid finalization response");
  }
  if (finalized.status === "not_posted") {
    return { status: "not_posted", runId: null, results: [] };
  }
  if (!finalized.run_id) {
    throw new Error(`generateMatchRun: ${finalized.status} response omitted run id`);
  }
  if (finalized.status === "no_candidates") {
    return { status: "no_candidates", runId: finalized.run_id, results: [] };
  }
  return { status: "matched", runId: finalized.run_id, results };
}

/** Atomically reserve one posted errand for an eligible runner who claims it. */
export async function finalizeSelfClaim(
  taskId: string,
  runnerId: string,
): Promise<MatchRunOutcome> {
  const db = getServiceClient();
  const now = Date.now();
  const { data: task, error: taskError } = await db
    .from("tasks")
    .select("id, buyer_id, category, pickup_lat, pickup_lng, urgency, status, selected_runner_id")
    .eq("id", taskId)
    .maybeSingle<Pick<
      TaskRow,
      | "id"
      | "buyer_id"
      | "category"
      | "pickup_lat"
      | "pickup_lng"
      | "urgency"
      | "status"
      | "selected_runner_id"
    >>();
  if (taskError || !task) throw new Error(`finalizeSelfClaim: task ${taskId} not found`);
  if (task.status !== "posted" || task.selected_runner_id) {
    return { status: "not_posted", runId: null, results: [] };
  }

  const { data: runnerRows, error: runnerError } = await db
    .from("runner_profile")
    .select(
      "user_id, current_lat, current_lng, is_available, active_load, trust_score, verified, status, capabilities, available_manual, scheduled_hours",
    )
    .eq("user_id", runnerId)
    .returns<RunnerProfileRow[]>();
  if (runnerError) throw new Error(`finalizeSelfClaim: ${runnerError.message}`);
  let runner = runnerRows?.[0];
  if (!runner) throw new Error("Runner profile is missing");

  const live = (await liveRunnerLocations([runnerId])).get(runnerId);
  if (live) runner = { ...runner, current_lat: live.lat, current_lng: live.lng };

  const [eventsByRunner, verifiedById, cancellationCounts, pairDisputeCounts, activeFlags] =
    await Promise.all([
      loadTrustEvents(db, [runnerId]),
      loadVerified(db, [runnerId]),
      loadCancellationCounts(db, [runnerId], now),
      loadPairDisputeCounts(db, [runnerId], task.buyer_id),
      loadActiveFraudFlags(db, [runnerId]),
    ]);
  const verified = verifiedById.get(runnerId) ?? false;
  const { trust, action } = runnerTrustSnapshot(
    eventsByRunner.get(runnerId) ?? [],
    verified,
    now,
    {
      recentCancellations: cancellationCounts.get(runnerId) ?? 0,
      disputesWithSameCounterparty: pairDisputeCounts.get(runnerId) ?? 0,
    },
    activeFlags.has(runnerId),
  );
  const candidate = toRunnerCandidate(
    runner,
    trust,
    verified,
    action,
    isRunnerAvailable(runner.available_manual, runner.scheduled_hours, new Date(now)),
  );
  const results = rankRunners(
    {
      pickup: { lat: task.pickup_lat, lng: task.pickup_lng },
      category: task.category ?? undefined,
      urgency: task.urgency,
    },
    [candidate],
    CALIBRATED_MATCH_CONFIG,
  );
  if (results.length !== 1) {
    throw new Error("You are not currently eligible to claim this errand");
  }

  const { data, error } = await db.rpc("finalize_match_run", {
    p_task_id: taskId,
    p_source: "self_claim",
    p_algorithm_version: "self-claim",
    p_config_version: "self-claim-v1",
    p_config: CALIBRATED_MATCH_CONFIG,
    p_candidates: results,
    p_self_claim_runner_id: runnerId,
  });
  if (error) throw new Error(`finalizeSelfClaim: ${error.message}`);
  const finalized = (Array.isArray(data) ? data[0] : data) as FinalizeMatchRunRow | null;
  if (!finalized || finalized.status === "no_candidates") {
    throw new Error("finalizeSelfClaim: invalid finalization response");
  }
  if (finalized.status === "not_posted") {
    return { status: "not_posted", runId: null, results: [] };
  }
  if (!finalized.run_id) throw new Error("finalizeSelfClaim: matched response omitted run id");
  return { status: "matched", runId: finalized.run_id, results };
}

/**
 * Recompute and persist a single runner's cached `trust_score`.
 * Call this after a `trust_events` row is inserted so the cache stays fresh
 * between full match runs.
 */
export async function refreshTrustScore(runnerId: string): Promise<void> {
  const db = getServiceClient();
  const now = Date.now();

  const [eventsByRunner, verifiedById, recentCancellations, hasActiveFlag] = await Promise.all([
    loadTrustEvents(db, [runnerId]),
    loadVerified(db, [runnerId]),
    countRecentCancellations(db, runnerId, now),
    hasActiveFraudFlag(db, runnerId),
  ]);

  const fraudContext: FraudContext = {
    recentCancellations,
    disputesWithSameCounterparty: 0,
  };

  const { trust } = runnerTrustSnapshot(
    eventsByRunner.get(runnerId) ?? [],
    verifiedById.get(runnerId) ?? false,
    now,
    fraudContext,
    hasActiveFlag,
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
  fraudContext: FraudContext,
  hasActiveFlag: boolean,
): { trust: number; action: FraudResult["action"] } {
  const fraud = evaluateFraud(fraudContext);
  const fraudRisk = hasActiveFlag ? 1 : fraud.risk;
  const action = hasActiveFlag ? "exclude" : fraud.action;
  const { trust } = computeTrust({
    events,
    verified,
    fraudRisk,
    now,
  });

  return { trust, action };
}

export async function offerToTopCandidate(
  taskId: string,
  ensureHold = false,
): Promise<string | null> {
  const db = getServiceClient();
  const { data: task, error: taskError } = await db
    .from("tasks")
    .select("id, title")
    .eq("id", taskId)
    .maybeSingle<{ id: string; title: string }>();
  if (taskError || !task) {
    throw new Error(`offerToTopCandidate: task ${taskId} not found`);
  }

  const { data, error } = await db.rpc("offer_next_match_candidate", {
    p_task_id: taskId,
    p_ensure_hold: ensureHold,
  });
  if (error) throw new Error(`offerToTopCandidate: ${error.message}`);
  const offered = (Array.isArray(data) ? data[0] : data) as OfferMatchRow | null;
  if (!offered || offered.status !== "offered" || !offered.offered_runner_id) {
    return null;
  }

  await createNotification(offered.offered_runner_id, "offer", {
    task_id: taskId,
    task_title: task.title,
  });
  return offered.offered_runner_id;
}

/** Atomically record a decline and either assign the next runner or reopen. */
export async function declineAndOfferNextCandidate(
  taskId: string,
  runnerId: string,
): Promise<OfferMatchRow> {
  const db = getServiceClient();
  const { data: task, error: taskError } = await db
    .from("tasks")
    .select("id, title")
    .eq("id", taskId)
    .maybeSingle<{ id: string; title: string }>();
  if (taskError || !task) {
    throw new Error(`declineAndOfferNextCandidate: task ${taskId} not found`);
  }

  const { data, error } = await db.rpc("decline_and_offer_next_candidate", {
    p_task_id: taskId,
    p_runner_id: runnerId,
  });
  if (error) throw new Error(`declineAndOfferNextCandidate: ${error.message}`);
  const outcome = (Array.isArray(data) ? data[0] : data) as OfferMatchRow | null;
  if (!outcome) throw new Error("declineAndOfferNextCandidate: RPC returned no result");

  if (outcome.status === "offered" && outcome.offered_runner_id) {
    await createNotification(outcome.offered_runner_id, "offer", {
      task_id: taskId,
      task_title: task.title,
    });
  }
  return outcome;
}

/**
 * Best-effort lifecycle telemetry. It runs only after the caller's task-state
 * transition succeeds and deliberately never reverses that transition.
 */
export async function recordMatchOutcomeEvent(
  taskId: string,
  runnerId: string,
  event: Exclude<MatchOutcomeEvent, "offered">,
  options: { occurredAt?: Date; resolution?: string } = {},
): Promise<void> {
  const db = getServiceClient();
  const occurredAt = options.occurredAt ?? new Date();
  const timestamp = occurredAt.toISOString();

  try {
    const { data: task, error: taskError } = await db
      .from("tasks")
      .select("active_match_run_id")
      .eq("id", taskId)
      .maybeSingle<{ active_match_run_id: string | null }>();
    if (taskError) throw taskError;
    if (!task?.active_match_run_id) return;

    const { data: existing, error: existingError } = await db
      .from("match_outcomes")
      .select("offered_at, picked_up_at")
      .eq("match_run_id", task.active_match_run_id)
      .eq("runner_id", runnerId)
      .maybeSingle<{ offered_at: string; picked_up_at: string | null }>();
    if (existingError) throw existingError;
    let outcome = existing;
    if (!outcome) {
      const { error: repairError } = await db.from("match_outcomes").upsert(
        {
          match_run_id: task.active_match_run_id,
          task_id: taskId,
          runner_id: runnerId,
          offered_at: timestamp,
          updated_at: timestamp,
        },
        { onConflict: "match_run_id,runner_id" },
      );
      if (repairError) throw repairError;
      outcome = { offered_at: timestamp, picked_up_at: null };
    }

    const changes: Record<string, unknown> = { updated_at: timestamp };
    switch (event) {
      case "accepted":
        Object.assign(changes, { responded_at: timestamp, accepted: true, declined: false });
        break;
      case "declined":
        Object.assign(changes, { responded_at: timestamp, accepted: false, declined: true });
        break;
      case "picked_up":
        Object.assign(changes, {
          picked_up_at: timestamp,
          pickup_minutes: elapsedMinutes(outcome.offered_at, occurredAt),
        });
        break;
      case "completed":
        Object.assign(changes, {
          completed_at: timestamp,
          completion_minutes: outcome.picked_up_at
            ? elapsedMinutes(outcome.picked_up_at, occurredAt)
            : null,
        });
        break;
      case "cancelled":
        changes.cancelled_at = timestamp;
        break;
      case "disputed":
        Object.assign(changes, { disputed: true, disputed_at: timestamp });
        break;
      case "resolved":
        Object.assign(changes, { resolved_at: timestamp, resolution: options.resolution ?? null });
        break;
    }

    const { error } = await db
      .from("match_outcomes")
      .update(changes)
      .eq("match_run_id", task.active_match_run_id)
      .eq("runner_id", runnerId);
    if (error) throw error;
  } catch (error) {
    console.error("match_outcome_write_failed", {
      taskId,
      runnerId,
      event,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function elapsedMinutes(startIso: string, end: Date): number {
  return Math.max(0, (end.getTime() - new Date(startIso).getTime()) / 60_000);
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
