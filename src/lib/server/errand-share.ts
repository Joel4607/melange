import {
  CALIBRATED_MATCH_CONFIG,
  DEFAULT_ERRAND_SHARE_CONFIG,
  rankSharePartners,
  type MatchRunOutcome,
  type ShareDecision,
  type ShareRouteStop,
  type ShareTask,
  type Urgency,
} from "../algorithm";
import { getServiceClient } from "@/lib/supabase/service";
import { createNotification } from "./notifications";
import {
  generateMatchRun,
  rankAvailableRunners,
  type MatchRunSource,
  type OfferMatchRow,
} from "./matching";

const SHARE_TASK_SELECT = [
  "id",
  "buyer_id",
  "title",
  "category",
  "urgency",
  "pickup_lat",
  "pickup_lng",
  "dropoff_lat",
  "dropoff_lng",
  "stops",
  "created_at",
  "status",
  "selected_runner_id",
  "share_state",
  "share_window_ends_at",
  "delivery_deadline_at",
].join(", ");

type ShareTaskRow = {
  id: string;
  buyer_id: string;
  title: string;
  category: string | null;
  urgency: Urgency;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  stops: unknown[] | null;
  created_at: string;
  status: ShareTask["status"];
  selected_runner_id: string | null;
  share_state: ShareTask["shareState"];
  share_window_ends_at: string | null;
  delivery_deadline_at: string | null;
};

interface ShareGroupContext {
  group: {
    id: string;
    status: string;
    ordered_route: ShareRouteStop[];
  };
  tasks: ShareTaskRow[];
}

type StoredShareRouteStop = Pick<ShareRouteStop, "taskId" | "kind">;

interface FinalizeShareRunRow {
  status: "matched" | "no_candidates" | "not_posted";
  run_id: string | null;
}

interface ShareRpcStatus {
  status: string;
}

function firstRow<T>(data: unknown): T | null {
  return (Array.isArray(data) ? data[0] : data) as T | null;
}

function toShareTask(row: ShareTaskRow): ShareTask | null {
  if (
    row.dropoff_lat == null ||
    row.dropoff_lng == null ||
    !row.share_window_ends_at
  ) {
    return null;
  }
  return {
    id: row.id,
    buyerId: row.buyer_id,
    urgency: row.urgency,
    pickup: { lat: row.pickup_lat, lng: row.pickup_lng },
    dropoff: { lat: row.dropoff_lat, lng: row.dropoff_lng },
    category: row.category ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    windowEndsAt: new Date(row.share_window_ends_at).getTime(),
    deadlineAt: row.delivery_deadline_at
      ? new Date(row.delivery_deadline_at).getTime()
      : null,
    status: row.status,
    selectedRunnerId: row.selected_runner_id,
    shareState: row.share_state,
    manualRunner: row.selected_runner_id !== null,
    stopCount: row.stops?.length ?? 0,
  };
}

function decisionPayload(decision: ShareDecision) {
  if (!decision.accepted) {
    return {
      ...decision,
      algorithmVersion: DEFAULT_ERRAND_SHARE_CONFIG.algorithmVersion,
      configVersion: DEFAULT_ERRAND_SHARE_CONFIG.configVersion,
      config: DEFAULT_ERRAND_SHARE_CONFIG,
    };
  }
  return {
    ...decision,
    route: decision.route.map(({ taskId, kind }) => ({ taskId, kind })),
    algorithmVersion: DEFAULT_ERRAND_SHARE_CONFIG.algorithmVersion,
    configVersion: DEFAULT_ERRAND_SHARE_CONFIG.configVersion,
    config: DEFAULT_ERRAND_SHARE_CONFIG,
  };
}

function decisionTelemetry(decision: ShareDecision) {
  return {
    task_a_id: decision.taskIds[0],
    task_b_id: decision.taskIds[1],
    accepted: decision.accepted,
    reason: decision.accepted ? null : decision.reason,
    algorithm_version: DEFAULT_ERRAND_SHARE_CONFIG.algorithmVersion,
    config_version: DEFAULT_ERRAND_SHARE_CONFIG.configVersion,
    config: DEFAULT_ERRAND_SHARE_CONFIG,
    metrics: decision.accepted ? decision.metrics : {},
    deadline_met: decision.accepted ? true : null,
  };
}

/** Pair a newly posted eligible errand, or leave it waiting for the release sweep. */
export async function enqueueOrPairErrand(
  taskId: string,
  now: Date = new Date(),
): Promise<{ status: "waiting" | "paired" | "released"; groupId: string | null }> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("tasks")
    .select(SHARE_TASK_SELECT)
    .eq("id", taskId)
    .maybeSingle<ShareTaskRow>();
  if (error || !data) throw new Error(`enqueueOrPairErrand: task ${taskId} not found`);
  const newTask = toShareTask(data);
  if (
    !newTask ||
    newTask.urgency === "express" ||
    newTask.status !== "posted" ||
    newTask.selectedRunnerId ||
    newTask.shareState === "released"
  ) {
    return { status: "released", groupId: null };
  }
  if (newTask.shareState !== "waiting" || newTask.windowEndsAt <= now.getTime()) {
    return { status: "released", groupId: null };
  }

  const { data: candidateRows, error: candidatesError } = await db
    .from("tasks")
    .select(SHARE_TASK_SELECT)
    .eq("status", "posted")
    .eq("share_state", "waiting")
    .is("selected_runner_id", null)
    .is("share_group_id", null)
    .neq("id", taskId)
    .neq("buyer_id", newTask.buyerId)
    .gt("share_window_ends_at", now.toISOString())
    .order("created_at", { ascending: true })
    .limit(DEFAULT_ERRAND_SHARE_CONFIG.maxCandidates)
    .returns<ShareTaskRow[]>();
  if (candidatesError) throw new Error(`enqueueOrPairErrand: ${candidatesError.message}`);

  const candidates = (candidateRows ?? [])
    .map(toShareTask)
    .filter((candidate): candidate is ShareTask => candidate !== null);
  const decisions = rankSharePartners(
    newTask,
    candidates,
    now.getTime(),
    DEFAULT_ERRAND_SHARE_CONFIG,
  );
  if (decisions.length > 0) {
    const { error: telemetryError } = await db
      .from("errand_share_decisions")
      .insert(decisions.map(decisionTelemetry));
    if (telemetryError) throw new Error(`enqueueOrPairErrand: ${telemetryError.message}`);
  }

  const candidateById = new Map((candidateRows ?? []).map((candidate) => [candidate.id, candidate]));
  for (const decision of decisions) {
    if (!decision.accepted) continue;
    const partnerId = decision.taskIds.find((id) => id !== taskId);
    const partner = partnerId ? candidateById.get(partnerId) : null;
    if (!partner) continue;
    const { data: rpcData, error: rpcError } = await db.rpc("create_errand_share_group", {
      p_task_a_id: taskId,
      p_task_b_id: partner.id,
      p_decision: decisionPayload(decision),
    });
    if (rpcError) throw new Error(`enqueueOrPairErrand: ${rpcError.message}`);
    const created = firstRow<{ status: "created" | "conflict"; group_id: string | null }>(rpcData);
    if (created?.status !== "created" || !created.group_id) continue;

    await Promise.all([
      createNotification(newTask.buyerId, "share_paired", {
        task_id: taskId,
        share_group_id: created.group_id,
      }),
      createNotification(partner.buyer_id, "share_paired", {
        task_id: partner.id,
        share_group_id: created.group_id,
      }),
    ]);
    try {
      await generateShareMatchRun(created.group_id);
    } catch {
      // The valid group stays posted for manual rematching or self-claim.
    }
    return { status: "paired", groupId: created.group_id };
  }
  return { status: "waiting", groupId: null };
}

async function loadGroupContext(groupId: string): Promise<ShareGroupContext> {
  const db = getServiceClient();
  const [{ data: group, error: groupError }, { data: tasks, error: tasksError }] =
    await Promise.all([
      db
        .from("errand_share_groups")
        .select("id, status, ordered_route")
        .eq("id", groupId)
        .maybeSingle<{
          id: string;
          status: string;
          ordered_route: StoredShareRouteStop[];
        }>(),
      db
        .from("tasks")
        .select(SHARE_TASK_SELECT)
        .eq("share_group_id", groupId)
        .returns<ShareTaskRow[]>(),
    ]);
  if (groupError || tasksError || !group || !tasks || tasks.length !== 2) {
    throw new Error(`Errand-Share group ${groupId} is incomplete`);
  }
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const orderedRoute = group.ordered_route.map((stop): ShareRouteStop => {
    const task = taskById.get(stop.taskId);
    if (!task) throw new Error(`Errand-Share route references an unknown task`);
    const lat = stop.kind === "pickup" ? task.pickup_lat : task.dropoff_lat;
    const lng = stop.kind === "pickup" ? task.pickup_lng : task.dropoff_lng;
    if (lat == null || lng == null) {
      throw new Error(`Errand-Share route references a missing ${stop.kind}`);
    }
    return { ...stop, point: { lat, lng } };
  });
  return { group: { ...group, ordered_route: orderedRoute }, tasks };
}

function stricterUrgency(tasks: ShareTaskRow[]): Urgency {
  return tasks.some((task) => task.urgency === "normal") ? "normal" : "low";
}

async function finalizeGroupRun(
  context: ShareGroupContext,
  source: MatchRunSource,
  runnerIds?: string[],
): Promise<MatchRunOutcome> {
  const firstPickup = context.group.ordered_route.find((stop) => stop.kind === "pickup")?.point;
  if (!firstPickup) throw new Error("Errand-Share route has no pickup");
  if (runnerIds?.some((runnerId) => context.tasks.some((task) => task.buyer_id === runnerId))) {
    throw new Error("You cannot claim your own shared errand");
  }
  const requiredCapabilities = [...new Set(
    context.tasks.map((task) => task.category).filter((value): value is string => Boolean(value)),
  )].sort();
  const results = await rankAvailableRunners({
    buyerIds: context.tasks.map((task) => task.buyer_id),
    pickup: firstPickup,
    urgency: stricterUrgency(context.tasks),
    requiredCapabilities,
    loadUnits: 2,
    runnerIds,
  });
  if (runnerIds && results.length !== 1) {
    throw new Error("You are not currently eligible to claim this shared errand");
  }

  const selfClaimRunnerId = runnerIds?.[0] ?? null;
  const { data, error } = await getServiceClient().rpc("finalize_share_match_run", {
    p_group_id: context.group.id,
    p_source: source,
    p_algorithm_version: selfClaimRunnerId
      ? "self-claim"
      : CALIBRATED_MATCH_CONFIG.algorithmVersion,
    p_config_version: selfClaimRunnerId
      ? "self-claim-v1"
      : CALIBRATED_MATCH_CONFIG.configVersion,
    p_config: CALIBRATED_MATCH_CONFIG,
    p_candidates: results,
    p_self_claim_runner_id: selfClaimRunnerId,
  });
  if (error) throw new Error(`generateShareMatchRun: ${error.message}`);
  const finalized = firstRow<FinalizeShareRunRow>(data);
  if (!finalized || !["matched", "no_candidates", "not_posted"].includes(finalized.status)) {
    throw new Error("generateShareMatchRun: invalid finalization response");
  }
  if (finalized.status === "not_posted") {
    return { status: "not_posted", runId: null, results: [] };
  }
  if (!finalized.run_id) throw new Error("generateShareMatchRun: response omitted run id");
  return finalized.status === "no_candidates"
    ? { status: "no_candidates", runId: finalized.run_id, results: [] }
    : { status: "matched", runId: finalized.run_id, results };
}

export async function generateShareMatchRun(
  groupId: string,
  source: Exclude<MatchRunSource, "self_claim"> = "automatic",
): Promise<MatchRunOutcome> {
  return finalizeGroupRun(await loadGroupContext(groupId), source);
}

export async function finalizeShareSelfClaim(
  groupId: string,
  runnerId: string,
): Promise<MatchRunOutcome> {
  return finalizeGroupRun(await loadGroupContext(groupId), "self_claim", [runnerId]);
}

export async function confirmShareFunding(
  groupId: string,
  taskId: string,
  buyerId: string,
): Promise<{ ready: boolean }> {
  const db = getServiceClient();
  const { data, error } = await db.rpc("confirm_share_funding", {
    p_group_id: groupId,
    p_task_id: taskId,
    p_buyer_id: buyerId,
  });
  if (error) throw new Error(`confirmShareFunding: ${error.message}`);
  const funded = firstRow<{ status: "funded" | "not_fundable"; ready: boolean }>(data);
  if (!funded || funded.status !== "funded") throw new Error("Shared escrow is not fundable");
  if (funded.ready) {
    const context = await loadGroupContext(groupId);
    await Promise.all(context.tasks.map((task) =>
      createNotification(task.buyer_id, "share_funding_ready", {
        task_id: task.id,
        share_group_id: groupId,
      }),
    ));
  }
  return { ready: funded.ready };
}

export async function offerShareToTopCandidate(
  groupId: string,
  ensureHold = false,
): Promise<OfferMatchRow> {
  const { data, error } = await getServiceClient().rpc("offer_next_share_candidate", {
    p_group_id: groupId,
    p_ensure_hold: ensureHold,
  });
  if (error) throw new Error(`offerShareToTopCandidate: ${error.message}`);
  const offered = firstRow<OfferMatchRow>(data);
  if (!offered) throw new Error("offerShareToTopCandidate: RPC returned no result");
  if (offered.status === "offered" && offered.offered_runner_id) {
    await createNotification(offered.offered_runner_id, "share_offer", {
      share_group_id: groupId,
    });
  }
  return offered;
}

export async function declineAndOfferNextShareCandidate(
  groupId: string,
  runnerId: string,
): Promise<OfferMatchRow> {
  const { data, error } = await getServiceClient().rpc(
    "decline_and_offer_next_share_candidate",
    { p_group_id: groupId, p_runner_id: runnerId },
  );
  if (error) throw new Error(`declineAndOfferNextShareCandidate: ${error.message}`);
  const outcome = firstRow<OfferMatchRow>(data);
  if (!outcome) throw new Error("declineAndOfferNextShareCandidate: RPC returned no result");
  if (outcome.status === "offered" && outcome.offered_runner_id) {
    await createNotification(outcome.offered_runner_id, "share_offer", {
      share_group_id: groupId,
    });
  }
  return outcome;
}

export async function acceptShareOffer(groupId: string, runnerId: string): Promise<void> {
  await statusRpc("accept_share_offer", { p_group_id: groupId, p_runner_id: runnerId }, "accepted");
}

export async function startShareGroup(groupId: string, runnerId: string): Promise<void> {
  await statusRpc("start_share_group", { p_group_id: groupId, p_runner_id: runnerId }, "started");
}

export async function dissolveShareGroupForCancellation(groupId: string, taskId: string) {
  const { data, error } = await getServiceClient().rpc("dissolve_share_group_for_cancellation", {
    p_group_id: groupId,
    p_task_id: taskId,
  });
  if (error) throw new Error(`dissolveShareGroupForCancellation: ${error.message}`);
  const result = firstRow<{
    status: string;
    surviving_task_id: string | null;
    surviving_share_state: "waiting" | "released" | null;
  }>(data);
  if (!result || result.status !== "dissolved") throw new Error("Shared group is not dissolvable");
  return {
    survivingTaskId: result.surviving_task_id,
    survivingShareState: result.surviving_share_state,
  };
}

async function statusRpc(name: string, args: Record<string, unknown>, expected: string) {
  const { data, error } = await getServiceClient().rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  const result = firstRow<ShareRpcStatus>(data);
  if (result?.status !== expected) throw new Error(`${name}: ${result?.status ?? "no result"}`);
}

export async function syncShareMemberCompletion(
  taskId: string,
  completedAt: Date,
): Promise<boolean> {
  const db = getServiceClient();
  const { data: task, error: taskError } = await db
    .from("tasks")
    .select("id, buyer_id, share_group_id")
    .eq("id", taskId)
    .maybeSingle<{ id: string; buyer_id: string; share_group_id: string | null }>();
  if (taskError) throw new Error(`syncShareMemberCompletion: ${taskError.message}`);
  if (!task?.share_group_id) return false;
  const { data, error } = await db.rpc("complete_share_member", {
    p_group_id: task.share_group_id,
    p_task_id: taskId,
    p_completed_at: completedAt.toISOString(),
  });
  if (error) throw new Error(`syncShareMemberCompletion: ${error.message}`);
  const result = firstRow<{ status: string; group_completed: boolean }>(data);
  if (!result || !["member_completed", "completed"].includes(result.status)) {
    throw new Error("syncShareMemberCompletion: invalid response");
  }
  const context = await loadGroupContext(task.share_group_id);
  await Promise.allSettled(context.tasks.map((member) =>
    createNotification(
      member.buyer_id,
      result.group_completed ? "share_completed" : "share_member_delivered",
      { task_id: member.id, share_group_id: task.share_group_id },
    ),
  ));
  return result.group_completed;
}

export async function cancelShareGroupByRunner(
  groupId: string,
  runnerId: string,
): Promise<{ buyerIds: string[] }> {
  const { data, error } = await getServiceClient().rpc("cancel_share_group_by_runner", {
    p_group_id: groupId,
    p_runner_id: runnerId,
  });
  if (error) throw new Error(`cancelShareGroupByRunner: ${error.message}`);
  const result = firstRow<{ status: string; buyer_ids: string[] }>(data);
  if (!result || result.status !== "cancelled") throw new Error("Shared group is not cancellable");
  return { buyerIds: result.buyer_ids };
}

export async function processDueShareWindows(
  limit = 25,
  now: Date = new Date(),
): Promise<{ claimed: number; matched: number; failed: number }> {
  // PostgreSQL remains authoritative for expiry; this parameter makes callers/tests explicit.
  void now;
  const db = getServiceClient();
  const boundedLimit = Math.max(1, Math.min(25, Math.trunc(limit)));
  const { data: expired, error: expireError } = await db.rpc(
    "expire_due_errand_share_groups",
    { p_limit: boundedLimit },
  );
  if (expireError) throw new Error(`processDueShareWindows: ${expireError.message}`);
  const expiredRows = (expired ?? []) as {
    group_id: string;
    task_ids: string[];
    task_share_states: ("waiting" | "released")[];
  }[];
  const releasedIds: string[] = [];
  for (const row of expiredRows) {
    row.task_ids.forEach((taskId, index) => {
      if (row.task_share_states[index] === "released") releasedIds.push(taskId);
    });
  }

  const expiredTaskIds = [...new Set(expiredRows.flatMap((row) => row.task_ids))];
  if (expiredTaskIds.length > 0) {
    try {
      const { data: owners, error } = await db
        .from("tasks")
        .select("id, buyer_id")
        .in("id", expiredTaskIds)
        .returns<{ id: string; buyer_id: string }[]>();
      if (!error) {
        const stateByTask = new Map<string, "waiting" | "released">();
        for (const row of expiredRows) {
          row.task_ids.forEach((taskId, index) => {
            stateByTask.set(taskId, row.task_share_states[index]);
          });
        }
        await Promise.allSettled((owners ?? []).map((owner) =>
          createNotification(
            owner.buyer_id,
            stateByTask.get(owner.id) === "released"
              ? "share_continuing_alone"
              : "share_dissolved",
            { task_id: owner.id },
          ),
        ));
      }
    } catch {
      // Release and rematching are authoritative; notification is best effort.
    }
  }

  const { data: claimed, error: claimError } = await db.rpc("claim_due_errand_share_tasks", {
    p_limit: boundedLimit,
  });
  if (claimError) throw new Error(`processDueShareWindows: ${claimError.message}`);
  for (const row of (claimed ?? []) as { task_id: string }[]) releasedIds.push(row.task_id);

  let matched = 0;
  let failed = 0;
  const uniqueReleasedIds = [...new Set(releasedIds)];
  for (const releasedTaskId of uniqueReleasedIds) {
    try {
      const outcome = await generateMatchRun(releasedTaskId, "automatic");
      if (outcome.status === "matched") matched += 1;
    } catch {
      failed += 1;
    }
  }
  return { claimed: uniqueReleasedIds.length, matched, failed };
}
