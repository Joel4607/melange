"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import {
  declineAndOfferNextCandidate,
  finalizeSelfClaim,
  generateMatchRun,
  offerToTopCandidate,
  recordMatchOutcomeEvent,
  refreshTrustScore,
} from "@/lib/server/matching";
import {
  acceptShareOffer,
  cancelShareGroupByRunner,
  confirmShareFunding,
  declineAndOfferNextShareCandidate,
  dissolveShareGroupForCancellation,
  enqueueOrPairErrand,
  finalizeShareSelfClaim,
  generateShareMatchRun,
  offerShareToTopCandidate,
  processDueShareWindows,
  startShareGroup,
  syncShareMemberCompletion,
} from "@/lib/server/errand-share";
import {
  cancelTaskWithRefund,
  hasLedgerEntry,
  releaseFunds,
} from "@/lib/server/escrow";
import {
  demoMoneyError,
  type DemoActionState,
} from "@/lib/demo-money";
import { resolveDispute } from "@/lib/server/disputes";
import {
  clearRunnerPresence,
  publishRunnerLocation,
} from "@/lib/server/presence";
import { enforceRateLimit, withinRateLimit } from "@/lib/server/rate-limit";
import { createNotification } from "@/lib/server/notifications";
import { notifyAdminsOfVerification, notifyAdminsOfDispute } from "@/lib/telegram/messaging";
import {
  evaluateCancellationFraud,
  evaluateTaskFraud,
  persistFraudFlags,
} from "@/lib/server/fraud";
import {
  shareWindowEndsAt,
  todayDeadlineAt,
  type TaskStop,
  type Urgency,
} from "@/lib/algorithm";
import { isRunnerAvailable, type TimeRange } from "@/lib/availability";
import { estimateErrandFee } from "@/lib/pricing";
import type { ProofRow, TaskRow } from "@/lib/server/rows";
import { randomUUID } from "node:crypto";

const URGENCIES: readonly Urgency[] = ["low", "normal", "express"];
const RECURRENCE: readonly string[] = ["none", "daily", "weekly", "monthly"];

const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function parseNumber(raw: FormDataEntryValue | null): number {
  const v = typeof raw === "string" ? raw.trim() : "";
  return v === "" ? Number.NaN : Number(v);
}

function isFiniteCoordinate(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function parseStops(raw: string): TaskStop[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Stops must be a valid JSON array");
  }
  if (!Array.isArray(parsed)) throw new Error("Stops must be an array");
  if (parsed.length > 5) throw new Error("You can add up to 5 stops");

  return parsed
    .map((item: unknown, index: number) => {
      const s = typeof item === "object" && item != null ? (item as Record<string, unknown>) : {};
      const lat = Number(s.lat);
      const lng = Number(s.lng);
      const label = String(s.label ?? "").trim();
      if (!isFiniteCoordinate(lat, lng)) {
        throw new Error(`Stop ${index + 1} has an invalid coordinate`);
      }
      return {
        lat,
        lng,
        label: label || null,
        sequence: index + 1,
      };
    });
}

async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user.id;
}

async function requireRunnerId(): Promise<string> {
  return requireUserId();
}

/**
 * Identity verification is runner-only. The admin must approve a runner's
 * Ghana Card submission before they can go available or claim errands.
 */
async function isUserVerified(userId: string): Promise<boolean> {
  const db = getServiceClient();
  const { data: profile } = await db
    .from("profiles")
    .select("verified")
    .eq("id", userId)
    .maybeSingle<{ verified: boolean }>();
  return profile?.verified ?? false;
}

async function requireVerified(userId: string): Promise<void> {
  if (!(await isUserVerified(userId))) {
    redirect("/app/verify");
  }
}

async function requireVerifiedRunner(): Promise<string> {
  const runnerId = await requireRunnerId();
  await requireVerified(runnerId);
  return runnerId;
}

async function requireActiveRunner(runnerId: string): Promise<void> {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("runner_profile")
    .select("status")
    .eq("user_id", runnerId)
    .maybeSingle<{ status: string | null }>();
  if (profile?.status && profile.status !== "active") {
    throw new Error("Runner account is not active");
  }
}

/** Load a task via service-role and assert the caller owns it. */
async function ownedTask(taskId: string, userId: string) {
  const db = getServiceClient();
  const { data: task } = await db
    .from("tasks")
    .select("id, buyer_id, title, price, status, active_match_run_id, selected_runner_id, share_group_id, share_state")
    .eq("id", taskId)
    .maybeSingle<{
      id: string;
      buyer_id: string;
      title: string;
      price: string;
      status: string;
      active_match_run_id: string | null;
      selected_runner_id: string | null;
      share_group_id: string | null;
      share_state: string;
    }>();
  if (!task || task.buyer_id !== userId) {
    throw new Error("Errand not found");
  }
  return task;
}

async function assignedTask(taskId: string, runnerId: string) {
  const db = getServiceClient();
  const { data: task } = await db
    .from("tasks")
    .select("id, buyer_id, title, status, selected_runner_id, declined_runner_ids, share_group_id")
    .eq("id", taskId)
    .maybeSingle<{
      id: string;
      buyer_id: string;
      title: string;
      status: string;
      selected_runner_id: string | null;
      declined_runner_ids: string[];
      share_group_id: string | null;
    }>();
  if (!task || task.selected_runner_id !== runnerId) {
    throw new Error("Errand not found");
  }
  return task;
}

async function ownedShareMember(groupId: string, userId: string) {
  const db = getServiceClient();
  const { data: task } = await db
    .from("tasks")
    .select("id, buyer_id, title, share_group_id")
    .eq("share_group_id", groupId)
    .eq("buyer_id", userId)
    .maybeSingle<{ id: string; buyer_id: string; title: string; share_group_id: string }>();
  if (!task) throw new Error("Shared errand not found");
  return task;
}

async function shareMembers(groupId: string) {
  const { data, error } = await getServiceClient()
    .from("tasks")
    .select("id, buyer_id, title")
    .eq("share_group_id", groupId)
    .returns<{ id: string; buyer_id: string; title: string }[]>();
  if (error || !data || data.length !== 2) throw new Error("Shared errand is incomplete");
  return data;
}

async function adjustRunnerLoad(runnerId: string, delta: number) {
  const db = getServiceClient();
  const { data: profile } = await db
    .from("runner_profile")
    .select("active_load")
    .eq("user_id", runnerId)
    .maybeSingle<{ active_load: number }>();
  await db.from("runner_profile").upsert({
    user_id: runnerId,
    active_load: Math.max(0, (profile?.active_load ?? 0) + delta),
    updated_at: new Date().toISOString(),
  });
}

/**
 * Create an errand for the signed-in buyer (inserted by validated service code), then
 * run the matcher so a ranked runner is ready when they open the tracking page.
 */
export async function createErrand(
  _previousState: DemoActionState,
  formData: FormData,
): Promise<DemoActionState> {
  const userId = await requireUserId();
  await enforceRateLimit("post-errand", userId, 5, 300);
  const db = getServiceClient();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const urgencyRaw = String(formData.get("urgency") ?? "normal") as Urgency;
  const urgency: Urgency = URGENCIES.includes(urgencyRaw) ? urgencyRaw : "normal";
  const priceRaw = parseNumber(formData.get("price"));
  const pickupLat = parseNumber(formData.get("pickup_lat"));
  const pickupLng = parseNumber(formData.get("pickup_lng"));
  const dropoffLatRaw = String(formData.get("dropoff_lat") ?? "").trim();
  const dropoffLngRaw = String(formData.get("dropoff_lng") ?? "").trim();
  const dropoffLat = dropoffLatRaw ? parseNumber(formData.get("dropoff_lat")) : Number.NaN;
  const dropoffLng = dropoffLngRaw ? parseNumber(formData.get("dropoff_lng")) : Number.NaN;
  const runnerId = String(formData.get("runner_id") ?? "").trim();
  const stopsRaw = String(formData.get("stops") ?? "[]").trim();
  const stops = parseStops(stopsRaw);

  const recurrenceRaw = String(formData.get("recurrence") ?? "none").trim();
  const recurrence = RECURRENCE.includes(recurrenceRaw) ? recurrenceRaw : "none";
  const recurrenceEndRaw = String(formData.get("recurrence_end_date") ?? "").trim();
  const recurrenceEndDate = recurrence !== "none" && recurrenceEndRaw ? recurrenceEndRaw : null;

  if (!title || !isFiniteCoordinate(pickupLat, pickupLng)) {
    throw new Error("Missing title or valid pickup location");
  }

  if (!Number.isFinite(priceRaw) || priceRaw <= 0) {
    throw new Error("Budget must be a positive number");
  }

  const pickup = { lat: pickupLat, lng: pickupLng };
  const dropoff =
    dropoffLatRaw &&
    dropoffLngRaw &&
    isFiniteCoordinate(dropoffLat, dropoffLng)
      ? { lat: dropoffLat, lng: dropoffLng }
      : null;
  if ((dropoffLatRaw || dropoffLngRaw) && !dropoff) {
    throw new Error("Dropoff location is invalid");
  }

  const { fee, runnerPayout } = estimateErrandFee(priceRaw, pickup, dropoff, urgency, stops);

  const price = priceRaw;
  if (price <= fee) {
    throw new Error(`Budget must be greater than the platform fee of GHS ${fee.toFixed(2)}`);
  }
  if (runnerPayout <= 0) {
    throw new Error("Budget is too low to pay the runner");
  }

  // Manual pick: the buyer selected a runner from /app/runners. Create the task
  // already matched, hold funds, and send an offer to the runner.
  if (runnerId) {
    if (!isUuid(runnerId)) {
      throw new Error("Selected runner is not available");
    }
    const { data: runner, error: runnerError } = await db
      .from("runner_profile")
      .select("user_id, status, available_manual, scheduled_hours")
      .eq("user_id", runnerId)
      .eq("status", "active")
      .maybeSingle<{
        user_id: string;
        status: string;
        available_manual: boolean | null;
        scheduled_hours: { day: number; start: string; end: string }[] | null;
      }>();
    if (
      runnerError ||
      !runner ||
      runner.status !== "active" ||
      !isRunnerAvailable(runner.available_manual, runner.scheduled_hours)
    ) {
      throw new Error("Selected runner is not available");
    }

    const { data, error } = await db.rpc("create_and_hold_direct_demo_errand", {
      p_buyer_id: userId,
      p_runner_id: runnerId,
      p_title: title,
      p_description: description || null,
      p_category: category || null,
      p_urgency: urgency,
      p_price: price,
      p_fee: fee,
      p_pickup_lat: pickupLat,
      p_pickup_lng: pickupLng,
      p_dropoff_lat: dropoff?.lat ?? null,
      p_dropoff_lng: dropoff?.lng ?? null,
      p_stops: stops,
      p_recurrence: recurrence,
      p_recurrence_end_date: recurrenceEndDate,
    });
    const taskId = typeof data === "string" ? data : null;
    if (error || !taskId) {
      return {
        error: demoMoneyError(error ?? new Error("direct task was not created")),
      };
    }

    await createNotification(runnerId, "offer", { task_id: taskId, task_title: title });

    revalidatePath("/app");
    revalidatePath(`/app/errands/${taskId}`);
    redirect(`/app/errands/${taskId}`);
  }

  // Flexible, direct automatic errands enter the sharing window. Express,
  // custom-stop, and pickup-only errands retain immediate ordinary matching.
  const postedAt = new Date();
  const shareEligible = urgency !== "express" && dropoff !== null && stops.length === 0;
  const shareWindow = shareEligible
    ? shareWindowEndsAt(postedAt.getTime(), urgency)
    : null;
  const deliveryDeadline = shareEligible && urgency === "normal"
    ? todayDeadlineAt(postedAt.getTime())
    : null;
  const { data: task, error } = await db
    .from("tasks")
    .insert({
      buyer_id: userId,
      title,
      description: description || null,
      category: category || null,
      urgency,
      price,
      fee,
      pickup_lat: pickupLat,
      pickup_lng: pickupLng,
      dropoff_lat: dropoff?.lat ?? null,
      dropoff_lng: dropoff?.lng ?? null,
      stops,
      recurrence,
      recurrence_end_date: recurrenceEndDate,
      series_number: 1,
      share_state: shareEligible ? "waiting" : "ineligible",
      share_window_ends_at: shareWindow ? new Date(shareWindow).toISOString() : null,
      delivery_deadline_at: deliveryDeadline
        ? new Date(deliveryDeadline).toISOString()
        : null,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !task) {
    throw new Error(error?.message ?? "Could not create errand");
  }

  // Pairing/matching is best-effort: a transient failure never loses the post.
  try {
    if (shareEligible) {
      await enqueueOrPairErrand(task.id);
    } else {
      await generateMatchRun(task.id);
    }
  } catch {
    /* errand stays "posted"; buyer can re-run matching from the tracking page */
  }
  try {
    await processDueShareWindows(5);
  } catch {
    /* request traffic is only a fallback for the protected scheduler */
  }

  revalidatePath("/app");
  redirect(`/app/errands/${task.id}`);
}

/** Re-run the matcher for an errand still waiting on a runner. */
export async function rematch(taskId: string) {
  const userId = await requireUserId();
  const task = await ownedTask(taskId, userId);
  if (task.share_group_id) {
    await generateShareMatchRun(task.share_group_id, "manual");
  } else {
    await generateMatchRun(taskId, "manual");
  }
  revalidatePath(`/app/errands/${taskId}`);
}

/**
 * Buyer confirms the matched runner and places existing demo credits in
 * escrow. The database rejects a shortfall without creating an offer.
 */
export async function payIntoEscrow(
  taskId: string,
  _previousState: DemoActionState,
  _formData: FormData,
): Promise<DemoActionState> {
  const userId = await requireUserId();
  const task = await ownedTask(taskId, userId);
  if (
    task.status !== "matched" ||
    task.selected_runner_id
  ) {
    return { error: null };
  }
  try {
    if (task.share_group_id) {
      const { ready } = await confirmShareFunding(task.share_group_id, taskId, userId);
      if (ready) await offerShareToTopCandidate(task.share_group_id);
      revalidatePath(`/app/errands/${taskId}`);
      revalidatePath("/app");
      return { error: null };
    }
    if (!task.active_match_run_id) throw new Error("No active match is available");

    await offerToTopCandidate(taskId, true);
  } catch (error) {
    return { error: demoMoneyError(error) };
  }

  revalidatePath(`/app/errands/${taskId}`);
  revalidatePath("/app");
  return { error: null };
}

export async function confirmSharedEscrow(
  groupId: string,
  taskId: string,
  _previousState: DemoActionState,
  _formData: FormData,
): Promise<DemoActionState> {
  const userId = await requireUserId();
  const task = await ownedTask(taskId, userId);
  if (task.share_group_id !== groupId) throw new Error("Shared errand not found");
  try {
    const { ready } = await confirmShareFunding(groupId, taskId, userId);
    if (ready) await offerShareToTopCandidate(groupId);
  } catch (error) {
    return { error: demoMoneyError(error) };
  }
  revalidatePath(`/app/errands/${taskId}`);
  revalidatePath("/app");
  return { error: null };
}

export async function rematchSharedGroup(groupId: string) {
  const userId = await requireUserId();
  const member = await ownedShareMember(groupId, userId);
  const outcome = await generateShareMatchRun(groupId, "manual");
  if (outcome.status === "matched") await offerShareToTopCandidate(groupId);
  revalidatePath(`/app/errands/${member.id}`);
  revalidatePath("/app");
}

export async function claimSharedGroup(groupId: string) {
  const runnerId = await requireVerifiedRunner();
  await requireActiveRunner(runnerId);
  const outcome = await finalizeShareSelfClaim(groupId, runnerId);
  if (outcome.status !== "matched") return;
  await acceptSharedOffer(groupId);
  revalidatePath("/app/feed");
  revalidatePath("/app");
}

export async function acceptSharedOffer(groupId: string) {
  const runnerId = await requireVerifiedRunner();
  await requireActiveRunner(runnerId);
  await acceptShareOffer(groupId, runnerId);
  await adjustRunnerLoad(runnerId, 2);
  await Promise.all((await shareMembers(groupId)).map((member) =>
    createNotification(member.buyer_id, "share_accepted", {
      task_id: member.id,
      task_title: member.title,
      share_group_id: groupId,
    }),
  ));
  revalidatePath("/app");
}

export async function declineSharedOffer(groupId: string) {
  const runnerId = await requireRunnerId();
  const outcome = await declineAndOfferNextShareCandidate(groupId, runnerId);
  if (outcome.status === "not_matchable") return;
  const db = getServiceClient();
  await db.from("trust_events").insert({
    runner_id: runnerId,
    type: "responsiveness",
    value: 0,
  });
  await refreshTrustScore(runnerId);
  revalidatePath("/app");
}

export async function startSharedTrip(groupId: string) {
  const runnerId = await requireRunnerId();
  await startShareGroup(groupId, runnerId);
  revalidatePath("/app");
}

export async function setAvailability(
  available: boolean,
  lat: number | null,
  lng: number | null,
) {
  const runnerId = await requireRunnerId();
  if (available) {
    await requireVerified(runnerId);
    if (
      lat == null ||
      lng == null ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      throw new Error("A valid location is required to go available");
    }
  }
  await requireActiveRunner(runnerId);
  if (!available) await clearRunnerPresence(runnerId);
  const supabase = await createClient();
  await supabase.from("runner_profile").upsert({
    user_id: runnerId,
    is_available: available,
    available_manual: available,
    current_lat: lat,
    current_lng: lng,
    updated_at: new Date().toISOString(),
  });

  revalidatePath("/app");
  revalidatePath("/app/settings");
}

/** Clear a manual availability override and return to scheduled hours. */
export async function clearAvailabilityOverride() {
  const runnerId = await requireRunnerId();
  await requireActiveRunner(runnerId);
  const supabase = await createClient();
  const [runner, verified] = await Promise.all([
    supabase
      .from("runner_profile")
      .select("scheduled_hours")
      .eq("user_id", runnerId)
      .maybeSingle<{ scheduled_hours: TimeRange[] | null }>(),
    isUserVerified(runnerId),
  ]);

  const available = isRunnerAvailable(null, runner?.data?.scheduled_hours ?? null) && verified;
  await supabase
    .from("runner_profile")
    .update({
      available_manual: null,
      is_available: available,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", runnerId);

  revalidatePath("/app");
  revalidatePath("/app/settings");
}

/** Save recurring working hours. Manual override is cleared so the schedule applies. */
export async function updateScheduledHours(formData: FormData) {
  const runnerId = await requireRunnerId();
  const raw = String(formData.get("schedule") ?? "[]");
  let schedule: TimeRange[];
  try {
    schedule = JSON.parse(raw);
  } catch {
    throw new Error("Invalid schedule");
  }
  if (!Array.isArray(schedule)) throw new Error("Invalid schedule");
  for (const entry of schedule) {
    if (
      typeof entry.day !== "number" ||
      typeof entry.start !== "string" ||
      typeof entry.end !== "string"
    ) {
      throw new Error("Invalid schedule entry");
    }
  }

  await requireActiveRunner(runnerId);
  const [verified] = await Promise.all([isUserVerified(runnerId)]);
  const available = isRunnerAvailable(null, schedule) && verified;
  const supabase = await createClient();
  await supabase.from("runner_profile").upsert({
    user_id: runnerId,
    scheduled_hours: schedule,
    available_manual: null,
    is_available: available,
    updated_at: new Date().toISOString(),
  });

  revalidatePath("/app");
  revalidatePath("/app/settings");
}

export async function acceptOffer(taskId: string) {
  const runnerId = await requireVerifiedRunner();
  await requireActiveRunner(runnerId);
  const db = getServiceClient();
  const task = await assignedTask(taskId, runnerId);
  if (task.status !== "matched") return;
  if (task.share_group_id) {
    await acceptSharedOffer(task.share_group_id);
    return;
  }
  const acceptedAt = new Date();

  const { data: updated } = await db
    .from("tasks")
    .update({
      status: "accepted",
      accepted_at: acceptedAt.toISOString(),
    })
    .eq("id", taskId)
    .eq("status", "matched")
    .eq("selected_runner_id", runnerId)
    .select("id")
    .maybeSingle<{ id: string }>();
  if (!updated) return;
  await recordMatchOutcomeEvent(taskId, runnerId, "accepted", { occurredAt: acceptedAt });
  await db.from("trust_events").insert({
    runner_id: runnerId,
    type: "responsiveness",
    value: 1,
  });
  await refreshTrustScore(runnerId);
  await createNotification(task.buyer_id, "offer_accepted", {
    task_id: taskId,
    task_title: task.title,
  });

  const { data: profile } = await db
    .from("runner_profile")
    .select("active_load")
    .eq("user_id", runnerId)
    .maybeSingle<{ active_load: number }>();
  await db.from("runner_profile").upsert({
    user_id: runnerId,
    active_load: (profile?.active_load ?? 0) + 1,
    updated_at: new Date().toISOString(),
  });

  revalidatePath(`/app/errands/${taskId}`);
  revalidatePath("/app");
}

export async function claimTask(taskId: string) {
  const runnerId = await requireVerifiedRunner();
  const db = getServiceClient();

  const { data: runner } = await db
    .from("runner_profile")
    .select("status, available_manual, scheduled_hours, capabilities")
    .eq("user_id", runnerId)
    .maybeSingle<{
      status: string;
      available_manual: boolean | null;
      scheduled_hours: TimeRange[] | null;
      capabilities: string[] | null;
    }>();
  if (!runner || runner.status !== "active") {
    throw new Error("Runner account is not active");
  }

  const { data: task } = await db
    .from("tasks")
    .select("id, buyer_id, title, price, category, status, selected_runner_id")
    .eq("id", taskId)
    .maybeSingle<{
      id: string;
      buyer_id: string;
      title: string;
      price: string;
      category: string | null;
      status: string;
      selected_runner_id: string | null;
    }>();
  if (!task || task.status !== "posted" || task.selected_runner_id) return;
  if (task.buyer_id === runnerId) throw new Error("You cannot claim your own errand");

  const available = isRunnerAvailable(runner.available_manual, runner.scheduled_hours);
  if (!available) {
    throw new Error("You must be available to claim errands");
  }

  if (
    task.category &&
    runner.capabilities &&
    runner.capabilities.length > 0 &&
    !runner.capabilities.includes(task.category)
  ) {
    throw new Error("This errand is outside your capabilities");
  }

  const outcome = await finalizeSelfClaim(taskId, runnerId);
  if (outcome.status !== "matched") return;

  await acceptOffer(taskId);

  revalidatePath("/app/feed");
  revalidatePath(`/app/errands/${taskId}`);
  revalidatePath("/app");
}

export async function declineOffer(taskId: string) {
  const runnerId = await requireRunnerId();
  const db = getServiceClient();
  const task = await assignedTask(taskId, runnerId);
  if (task.status !== "matched") return;
  if (task.share_group_id) {
    await declineSharedOffer(task.share_group_id);
    return;
  }

  const decline = await declineAndOfferNextCandidate(taskId, runnerId);
  if (decline.status === "not_matchable") return;

  await db.from("trust_events").insert({
    runner_id: runnerId,
    type: "responsiveness",
    value: 0,
  });
  await refreshTrustScore(runnerId);

  revalidatePath(`/app/errands/${taskId}`);
  revalidatePath("/app");
}

export async function markPickedUp(taskId: string) {
  const runnerId = await requireRunnerId();
  const db = getServiceClient();
  const task = await assignedTask(taskId, runnerId);
  if (task.status !== "accepted") return;
  if (task.share_group_id) {
    await startSharedTrip(task.share_group_id);
    return;
  }
  const pickedUpAt = new Date();

  const { data: updated } = await db
    .from("tasks")
    .update({ status: "in_progress" })
    .eq("id", taskId)
    .eq("status", "accepted")
    .eq("selected_runner_id", runnerId)
    .select("id")
    .maybeSingle<{ id: string }>();
  if (!updated) return;
  await recordMatchOutcomeEvent(taskId, runnerId, "picked_up", {
    occurredAt: pickedUpAt,
  });

  await createNotification(task.buyer_id, "picked_up", {
    task_id: taskId,
    task_title: task.title,
  });

  revalidatePath(`/app/errands/${taskId}`);
  revalidatePath("/app");
}

export async function markDelivered(taskId: string, formData: FormData) {
  const runnerId = await requireRunnerId();
  const db = getServiceClient();
  const task = await assignedTask(taskId, runnerId);
  if (task.status !== "accepted" && task.status !== "in_progress") return;
  const completedAt = new Date();

  const photo = assertImageFile(formData.get("photo"), "delivery");
  const gpsLatRaw = formData.get("gps_lat");
  const gpsLngRaw = formData.get("gps_lng");
  const gpsLat =
    typeof gpsLatRaw === "string" && gpsLatRaw.trim() !== ""
      ? Number(gpsLatRaw.trim())
      : Number.NaN;
  const gpsLng =
    typeof gpsLngRaw === "string" && gpsLngRaw.trim() !== ""
      ? Number(gpsLngRaw.trim())
      : Number.NaN;
  const gps =
    Number.isFinite(gpsLat) &&
    Number.isFinite(gpsLng) &&
    isFiniteCoordinate(gpsLat, gpsLng)
      ? { lat: gpsLat, lng: gpsLng }
      : null;

  const photoPath = `${runnerId}/${randomUUID()}.${fileExtension(photo)}`;
  const { error: uploadError } = await db.storage
    .from("proofs")
    .upload(photoPath, await photo.arrayBuffer(), {
      contentType: photo.type,
      upsert: false,
    });
  if (uploadError) throw new Error(uploadError.message);

  await db.from("proofs").insert({
    task_id: taskId,
    runner_id: runnerId,
    photo_path: photoPath,
    gps_lat: gps?.lat ?? null,
    gps_lng: gps?.lng ?? null,
  });

  const { data: updated } = await db
    .from("tasks")
    .update({
      status: "completed",
      completed_at: completedAt.toISOString(),
    })
    .eq("id", taskId)
    .in("status", ["accepted", "in_progress"])
    .eq("selected_runner_id", runnerId)
    .select("id")
    .maybeSingle<{ id: string }>();
  if (!updated) return;
  await recordMatchOutcomeEvent(taskId, runnerId, "completed", {
    occurredAt: completedAt,
  });
  await syncShareMemberCompletion(taskId, completedAt);

  // Run fraud detection on the delivery proof before the completed event is
  // folded into the runner's trust score.
  const { data: fullTask } = await db
    .from("tasks")
    .select(
      "id, buyer_id, title, description, category, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, stops, recurrence, recurrence_end_date, parent_task_id, series_number, urgency, price, fee, status, selected_runner_id, accepted_at, completed_at",
    )
    .eq("id", taskId)
    .single<TaskRow>();
  if (fullTask) {
    const proof: ProofRow = {
      gps_lat: gps?.lat ?? null,
      gps_lng: gps?.lng ?? null,
    };
    const fraud = await evaluateTaskFraud(db, fullTask, proof, Date.now());
    if (fullTask.selected_runner_id) {
      await persistFraudFlags(db, fullTask.selected_runner_id, taskId, fraud);
    }
  }

  if (fullTask) {
    await spawnNextRecurrence(db, fullTask);
  }

  await db.from("trust_events").insert({
    runner_id: runnerId,
    type: "completed",
    value: 1,
  });
  await refreshTrustScore(runnerId);
  await createNotification(task.buyer_id, "delivered", {
    task_id: taskId,
    task_title: task.title,
  });

  const { data: profile } = await db
    .from("runner_profile")
    .select("active_load")
    .eq("user_id", runnerId)
    .maybeSingle<{ active_load: number }>();
  await db.from("runner_profile").upsert({
    user_id: runnerId,
    active_load: Math.max(0, (profile?.active_load ?? 0) - 1),
    updated_at: new Date().toISOString(),
  });

  revalidatePath(`/app/errands/${taskId}`);
  revalidatePath("/app");
}

async function spawnNextRecurrence(
  db: ReturnType<typeof getServiceClient>,
  task: TaskRow,
): Promise<string | null> {
  if (
    !task.recurrence ||
    task.recurrence === "none" ||
    !task.recurrence_end_date ||
    !task.completed_at
  ) {
    return null;
  }

  const completedAt = new Date(task.completed_at);
  const next = new Date(completedAt);
  switch (task.recurrence) {
    case "daily":
      next.setUTCDate(completedAt.getUTCDate() + 1);
      break;
    case "weekly":
      next.setUTCDate(completedAt.getUTCDate() + 7);
      break;
    case "monthly":
      next.setUTCMonth(completedAt.getUTCMonth() + 1);
      break;
  }

  const nextDateStr = next.toISOString().split("T")[0];
  if (nextDateStr > task.recurrence_end_date) {
    return null;
  }

  const shareEligible =
    task.urgency !== "express" &&
    task.dropoff_lat != null &&
    task.dropoff_lng != null &&
    (task.stops?.length ?? 0) === 0;
  const createdAt = new Date();
  const shareWindow = shareEligible
    ? shareWindowEndsAt(createdAt.getTime(), task.urgency)
    : null;
  const deliveryDeadline = shareEligible && task.urgency === "normal"
    ? todayDeadlineAt(createdAt.getTime())
    : null;

  const { data: nextTask, error } = await db
    .from("tasks")
    .insert({
      buyer_id: task.buyer_id,
      title: task.title,
      description: task.description,
      category: task.category,
      urgency: task.urgency,
      price: task.price,
      fee: task.fee,
      pickup_lat: task.pickup_lat,
      pickup_lng: task.pickup_lng,
      dropoff_lat: task.dropoff_lat,
      dropoff_lng: task.dropoff_lng,
      stops: task.stops,
      recurrence: task.recurrence,
      recurrence_end_date: task.recurrence_end_date,
      parent_task_id: task.parent_task_id ?? task.id,
      series_number: (task.series_number ?? 1) + 1,
      payment_reference: task.payment_reference,
      status: "posted",
      share_state: shareEligible ? "waiting" : "ineligible",
      share_window_ends_at: shareWindow ? new Date(shareWindow).toISOString() : null,
      delivery_deadline_at: deliveryDeadline
        ? new Date(deliveryDeadline).toISOString()
        : null,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !nextTask) {
    console.error("spawnNextRecurrence: failed to insert next task", error?.message);
    return null;
  }

  try {
    if (shareEligible) {
      await enqueueOrPairErrand(nextTask.id);
    } else {
      await generateMatchRun(nextTask.id);
    }
  } catch {
    /* match is best-effort; task stays posted */
  }

  await createNotification(task.buyer_id, "recurring_scheduled", {
    task_id: nextTask.id,
    task_title: task.title,
  });

  return nextTask.id;
}

/** Buyer rates the runner after delivery; releases escrow, records the review,
 * and transfers an optional tip from the buyer's wallet to the runner. */
export async function rateRunner(taskId: string, stars: number, formData: FormData) {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    throw new Error("Rating must be an integer between 1 and 5 stars");
  }
  const comment = (formData.get("comment")?.toString().trim() ?? null) || null;
  const tipRaw = parseNumber(formData.get("tip"));
  const tipAmount = Number.isNaN(tipRaw) ? 0 : Math.max(0, tipRaw);
  const tipCents = Math.round(tipAmount * 100);
  if (tipAmount > 10000) {
    throw new Error("Tip amount cannot exceed GHS 10,000");
  }

  const userId = await requireUserId();
  const task = await ownedTask(taskId, userId);
  if (!task.selected_runner_id) return;
  if (task.status !== "completed" && task.status !== "resolved") return;

  const db = getServiceClient();

  if (task.status === "completed") {
    await releaseFunds(taskId);
  }

  const { data: ratingId, error: rpcError } = await db.rpc("rate_and_tip", {
    p_task_id: taskId,
    p_rater_id: userId,
    p_stars: stars,
    p_comment: comment,
    p_tip_cents: tipCents,
  });

  if (rpcError) {
    const message = rpcError.message ?? String(rpcError);
    if (message.toLowerCase().includes("already been rated")) return;
    throw new Error(message);
  }

  if (!ratingId) return;

  await db.from("trust_events").insert({
    runner_id: task.selected_runner_id,
    type: "rating",
    value: stars / 5,
  });
  await refreshTrustScore(task.selected_runner_id);
  await createNotification(task.selected_runner_id, "rated", {
    task_id: taskId,
    task_title: task.title,
  });

  if (tipAmount > 0) {
    await createNotification(task.selected_runner_id, "tip_received", {
      task_id: taskId,
      task_title: task.title,
    });
  }

  revalidatePath(`/app/errands/${taskId}`);
}

const CHAT_ALLOWED_STATUSES = new Set([
  "matched",
  "accepted",
  "in_progress",
  "completed",
  "resolved",
]);

/** Buyer or runner sends a message on an active errand. */
export async function sendMessage(
  taskId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  if (!isUuid(taskId)) {
    return { error: "Invalid errand" };
  }

  const userId = await requireUserId();
  const supabase = await createClient();

  const { data: task } = await supabase
    .from("tasks")
    .select("id, buyer_id, title, selected_runner_id, status")
    .eq("id", taskId)
    .maybeSingle<{ id: string; buyer_id: string; title: string; selected_runner_id: string | null; status: string }>();

  if (!task) return { error: "Errand not found" };
  if (!task.selected_runner_id || !CHAT_ALLOWED_STATUSES.has(task.status)) {
    return { error: "Messaging is not available for this errand yet" };
  }
  if (task.buyer_id !== userId && task.selected_runner_id !== userId) {
    return { error: "You are not a participant" };
  }

  const content = String(formData.get("content") ?? "").trim();
  const imageFile = formData.get("image");

  let imagePath: string | null = null;
  if (imageFile instanceof File && imageFile.size > 0) {
    const photo = assertImageFile(imageFile, "chat");
    const photoPath = `${taskId}/${randomUUID()}.${fileExtension(photo)}`;
    const { error: uploadError } = await getServiceClient()
      .storage.from("chat-images")
      .upload(photoPath, await photo.arrayBuffer(), {
        contentType: photo.type,
        upsert: false,
      });
    if (uploadError) return { error: uploadError.message };
    imagePath = photoPath;
  }

  if (content.length === 0 && !imagePath) {
    return { error: "Message cannot be empty" };
  }
  if (content.length > 1000) {
    return { error: "Message must be 1–1000 characters" };
  }

  const { error: insertError } = await supabase.from("messages").insert({
    task_id: taskId,
    sender_id: userId,
    content,
    image_path: imagePath,
  });

  if (insertError) {
    return { error: insertError.message };
  }

  const recipientId = task.buyer_id === userId ? task.selected_runner_id : task.buyer_id;
  await createNotification(recipientId, "new_message", {
    task_id: taskId,
    task_title: task.title,
  });

  revalidatePath(`/app/errands/${taskId}`);
  return {};
}

/** Mark the other party's messages on this errand as read. */
export async function markMessagesRead(taskId: string): Promise<{ error?: string }> {
  if (!isUuid(taskId)) {
    return { error: "Invalid errand" };
  }

  const userId = await requireUserId();
  const supabase = await createClient();

  const { data: task } = await supabase
    .from("tasks")
    .select("buyer_id, selected_runner_id, status")
    .eq("id", taskId)
    .maybeSingle<{ buyer_id: string; selected_runner_id: string | null; status: string }>();

  if (!task) return { error: "Errand not found" };
  if (!task.selected_runner_id || !CHAT_ALLOWED_STATUSES.has(task.status)) {
    return { error: "Messaging is not available" };
  }
  if (task.buyer_id !== userId && task.selected_runner_id !== userId) {
    return { error: "You are not a participant" };
  }

  const db = getServiceClient();
  const { error } = await db
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("task_id", taskId)
    .neq("sender_id", userId)
    .is("read_at", null);

  if (error) {
    return { error: error.message };
  }

  return {};
}

/** Buyer cancels an errand before the runner has accepted. */
export async function cancelErrand(taskId: string) {
  const userId = await requireUserId();
  const task = await ownedTask(taskId, userId);
  if (task.status !== "posted" && task.status !== "matched") return;

  if (task.share_group_id) {
    const dissolved = await dissolveShareGroupForCancellation(task.share_group_id, taskId);
    if (dissolved.survivingTaskId) {
      try {
        if (dissolved.survivingShareState === "waiting") {
          await enqueueOrPairErrand(dissolved.survivingTaskId);
        } else {
          await generateMatchRun(dissolved.survivingTaskId, "automatic");
        }
      } catch {
        /* survivor remains posted and can be manually rematched */
      }
    }
    revalidatePath(`/app/errands/${taskId}`);
    revalidatePath("/app");
    return;
  }

  const cancelled = await cancelTaskWithRefund(taskId, userId, "buyer");
  if (!cancelled) return;
  if (cancelled.selected_runner_id) {
    await recordMatchOutcomeEvent(taskId, cancelled.selected_runner_id, "cancelled");
    await createNotification(cancelled.selected_runner_id, "buyer_cancelled", {
      task_id: taskId,
      task_title: task.title,
    });
  }

  revalidatePath(`/app/errands/${taskId}`);
  revalidatePath("/app");
}

/** Runner cancels an errand they have already accepted. */
export async function cancelRunnerErrand(taskId: string) {
  const runnerId = await requireRunnerId();
  const db = getServiceClient();
  const task = await assignedTask(taskId, runnerId);
  if (task.status !== "accepted" && task.status !== "in_progress") return;

  if (task.share_group_id) {
    const cancelledGroup = await cancelShareGroupByRunner(task.share_group_id, runnerId);
    await db.from("trust_events").insert({
      runner_id: runnerId,
      type: "cancelled",
      value: 1,
    });
    if (cancelledGroup.buyerIds[0]) {
      const cancelFraud = await evaluateCancellationFraud(
        db,
        runnerId,
        cancelledGroup.buyerIds[0],
        Date.now(),
      );
      await persistFraudFlags(db, runnerId, taskId, cancelFraud);
    }
    await refreshTrustScore(runnerId);
    await Promise.all(cancelledGroup.buyerIds.map((buyerId) =>
      createNotification(buyerId, "runner_cancelled", {
        share_group_id: task.share_group_id,
      }),
    ));
    await adjustRunnerLoad(runnerId, -2);
    revalidatePath("/app");
    return;
  }

  const cancelled = await cancelTaskWithRefund(taskId, runnerId, "runner");
  if (!cancelled) return;
  await recordMatchOutcomeEvent(taskId, runnerId, "cancelled");
  await db.from("trust_events").insert({
    runner_id: runnerId,
    type: "cancelled",
    value: 1,
  });

  const cancelFraud = await evaluateCancellationFraud(db, runnerId, cancelled.buyer_id, Date.now());
  await persistFraudFlags(db, runnerId, taskId, cancelFraud);

  await refreshTrustScore(runnerId);
  await createNotification(cancelled.buyer_id, "runner_cancelled", {
    task_id: taskId,
    task_title: cancelled.task_title,
  });

  const { data: profile } = await db
    .from("runner_profile")
    .select("active_load")
    .eq("user_id", runnerId)
    .maybeSingle<{ active_load: number }>();
  await db.from("runner_profile").upsert({
    user_id: runnerId,
    active_load: Math.max(0, (profile?.active_load ?? 0) - 1),
    updated_at: new Date().toISOString(),
  });

  revalidatePath(`/app/errands/${taskId}`);
  revalidatePath("/app");
}

/** Buyer raises a dispute on a completed errand; auto-resolves or escalates. */
export async function raiseDispute(taskId: string, formData: FormData) {
  const userId = await requireUserId();
  const task = await ownedTask(taskId, userId);
  if (task.status !== "completed") return;

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) throw new Error("A reason is required to raise a dispute");

  const db = getServiceClient();

  if (await hasLedgerEntry(db, taskId, ["release", "payout", "refund"])) return;

  const { data: inserted, error: insertError } = await db
    .from("disputes")
    .insert({ task_id: taskId, raised_by: userId, reason })
    .select("id");
  if (insertError) {
    if (insertError.code === "23505") return;
    throw new Error(insertError.message);
  }
  if (!inserted?.length) return;

  if (task.selected_runner_id) {
    await recordMatchOutcomeEvent(taskId, task.selected_runner_id, "disputed");
  }

  const result = await resolveDispute(inserted[0].id);

  if (result.escalate) {
    try {
      await notifyAdminsOfDispute(inserted[0].id, task.title);
    } catch {
      // Notification failure must not block the dispute.
    }
  }

  if (task.selected_runner_id) {
    await createNotification(task.selected_runner_id, "dispute_raised", {
      task_id: taskId,
      task_title: task.title,
    });
  }

  revalidatePath(`/app/errands/${taskId}`);
}

/** Update the runner's accepted task categories. */
export async function updateCapabilities(formData: FormData) {
  const runnerId = await requireRunnerId();
  await requireActiveRunner(runnerId);
  const capabilities = formData.getAll("capabilities").map(String);
  const supabase = await createClient();
  await supabase.from("runner_profile").upsert(
    {
      user_id: runnerId,
      capabilities,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  revalidatePath("/app");
  revalidatePath("/app/settings");
}

/** Mark all notifications read for the signed-in user. */
export async function markAllNotificationsRead() {
  const userId = await requireUserId();
  const db = getServiceClient();
  await db
    .from("notifications")
    .update({ read: true })
    .eq("recipient_id", userId)
    .eq("read", false);

  revalidatePath("/app");
  revalidatePath("/app/notifications");
}

/** Delete a single notification belonging to the signed-in user. */
export async function deleteNotification(notificationId: string) {
  if (!isUuid(notificationId)) {
    throw new Error("Invalid notification");
  }
  const userId = await requireUserId();
  const db = getServiceClient();
  await db
    .from("notifications")
    .delete()
    .eq("id", notificationId)
    .eq("recipient_id", userId);

  revalidatePath("/app");
  revalidatePath("/app/notifications");
}

/** Delete all read notifications for the signed-in user. */
export async function clearReadNotifications() {
  const userId = await requireUserId();
  const db = getServiceClient();
  await db.from("notifications").delete().eq("recipient_id", userId).eq("read", true);

  revalidatePath("/app");
  revalidatePath("/app/notifications");
}

/** Update the signed-in user's notification channel preferences. */
export async function updateNotificationPreferences(formData: FormData) {
  const userId = await requireUserId();
  const db = getServiceClient();

  await db
    .from("profiles")
    .update({
      notify_in_app: formData.has("notify_in_app"),
      notify_push: formData.has("notify_push"),
      notify_email: formData.has("notify_email"),
      notify_telegram: formData.has("notify_telegram"),
    })
    .eq("id", userId);

  revalidatePath("/app/settings");
}

/** Update the signed-in user's profile name and phone. */
export async function updateProfile(formData: FormData) {
  const userId = await requireUserId();
  const db = getServiceClient();
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  const { data: existing } = await db
    .from("profiles")
    .select("name")
    .eq("id", userId)
    .maybeSingle<{ name: string | null }>();

  await db
    .from("profiles")
    .update({
      name: name || existing?.name || "User",
      phone: phone || null,
    })
    .eq("id", userId);

  revalidatePath("/app");
  revalidatePath("/app/settings");
}

/**
 * Update the runner's current position while available. High-frequency pings
 * land in Redis presence; Postgres only gets a periodic durable sync (or every
 * ping when Redis is unavailable). Over-limit pings are dropped silently.
 */
export async function updateLocation(lat: number, lng: number) {
  const runnerId = await requireRunnerId();
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    throw new Error("Invalid location");
  }
  if (!(await withinRateLimit("location-ping", runnerId, 30, 60))) return;

  const { syncToDb } = await publishRunnerLocation(runnerId, lat, lng);
  if (!syncToDb) return;

  const db = getServiceClient();
  await db.from("runner_profile").upsert(
    {
      user_id: runnerId,
      current_lat: lat,
      current_lng: lng,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}

function fileExtension(file: File): string {
  const ext = ALLOWED_IMAGE_TYPES.get(file.type.toLowerCase());
  if (!ext) throw new Error(`Unsupported image type: ${file.type}`);
  return ext;
}

function assertImageFile(value: FormDataEntryValue | null, label: string): File {
  if (!(value instanceof File) || value.size === 0) {
    throw new Error(`Please upload the ${label} photo`);
  }
  if (value.size > MAX_IMAGE_SIZE) {
    throw new Error(`${label} photo is too large (max ${MAX_IMAGE_SIZE / 1024 / 1024} MB)`);
  }
  if (!ALLOWED_IMAGE_TYPES.has(value.type.toLowerCase())) {
    throw new Error(`${label} photo must be a JPEG, PNG, or WebP image`);
  }
  return value;
}

function optionalImageFile(value: FormDataEntryValue | null, label: string): File | null {
  if (!value || !(value instanceof File) || value.size === 0) return null;
  if (value.size > MAX_IMAGE_SIZE) {
    throw new Error(`${label} photo is too large (max ${MAX_IMAGE_SIZE / 1024 / 1024} MB)`);
  }
  if (!ALLOWED_IMAGE_TYPES.has(value.type.toLowerCase())) {
    throw new Error(`${label} photo must be a JPEG, PNG, or WebP image`);
  }
  return value;
}

/** Submit an ID verification request for runners. */
export async function submitVerification(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.user_metadata?.role !== "runner") {
    throw new Error("Only runners can submit identity verification");
  }

  const userId = user.id;
  const db = getServiceClient();

  function requireText(name: string, label: string): string {
    const value = String(formData.get(name) ?? "").trim();
    if (!value) throw new Error(`Please provide your ${label}`);
    return value;
  }

  const front = assertImageFile(formData.get("front"), "front");
  const back = assertImageFile(formData.get("back"), "back");
  const selfie = assertImageFile(formData.get("selfie"), "selfie");
  const vehicleLicense = optionalImageFile(formData.get("vehicle_license"), "vehicle license");
  const phone = requireText("phone", "phone number");
  const email = String(formData.get("email") ?? "").trim() || null;
  const legalName = requireText("legal_name", "full legal name");
  const dateOfBirth = requireText("date_of_birth", "date of birth");
  const ghanaCardNumber = requireText("ghana_card_number", "Ghana Card number");
  const residentialAddress = requireText("residential_address", "residential address");
  const emergencyContactName = requireText("emergency_contact_name", "emergency contact name");
  const emergencyContactPhone = requireText("emergency_contact_phone", "emergency contact phone");
  const nextOfKinName = requireText("next_of_kin_name", "next of kin name");
  const nextOfKinPhone = requireText("next_of_kin_phone", "next of kin phone");

  const { data: existing } = await supabase
    .from("verification_requests")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["pending", "approved"])
    .maybeSingle<{ id: string }>();
  if (existing) {
    throw new Error("You already have a pending or approved verification request");
  }

  const uploadImage = async (file: File, label: string) => {
    const photoPath = `${userId}/${randomUUID()}.${fileExtension(file)}`;
    const buffer = await file.arrayBuffer();
    const { error } = await db.storage.from("verification").upload(photoPath, buffer, {
      contentType: file.type,
      upsert: false,
    });
    if (error) throw new Error(`Failed to upload ${label} photo: ${error.message}`);
    return photoPath;
  };

  const frontPath = await uploadImage(front, "front");
  const backPath = await uploadImage(back, "back");
  const selfiePath = await uploadImage(selfie, "selfie");
  const vehicleLicensePath = vehicleLicense ? await uploadImage(vehicleLicense, "vehicle license") : null;

  const { data: inserted, error } = await supabase
    .from("verification_requests")
    .insert({
      user_id: userId,
      front_photo_path: frontPath,
      back_photo_path: backPath,
      selfie_photo_path: selfiePath,
      vehicle_license_photo_path: vehicleLicensePath,
      phone,
      email,
      legal_name: legalName,
      date_of_birth: dateOfBirth,
      ghana_card_number: ghanaCardNumber,
      residential_address: residentialAddress,
      emergency_contact_name: emergencyContactName,
      emergency_contact_phone: emergencyContactPhone,
      next_of_kin_name: nextOfKinName,
      next_of_kin_phone: nextOfKinPhone,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !inserted) {
    await Promise.all(
      [frontPath, backPath, selfiePath, vehicleLicensePath]
        .filter((p): p is string => p != null)
        .map((p) => db.storage.from("verification").remove([p])),
    );
    throw new Error(error?.message ?? "Failed to submit verification request");
  }

  try {
    await notifyAdminsOfVerification(inserted.id, userId);
  } catch {
    // Notification failure must not block the submission.
  }

  revalidatePath("/app");
  redirect("/app");
}

/** Mark a notification as read for the signed-in user. */
export async function markNotificationRead(notificationId: string) {
  const userId = await requireUserId();
  const db = getServiceClient();
  await db
    .from("notifications")
    .update({ read: true })
    .eq("id", notificationId)
    .eq("recipient_id", userId);

  revalidatePath("/app");
  revalidatePath("/app/notifications");
}
