"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { generateMatchRun, offerToTopCandidate, refreshTrustScore } from "@/lib/server/matching";
import { hasLedgerEntry, holdFunds, releaseFunds, refund, topUp } from "@/lib/server/escrow";
import { resolveDispute } from "@/lib/server/disputes";
import {
  clearRunnerPresence,
  publishRunnerLocation,
} from "@/lib/server/presence";
import { enforceRateLimit, withinRateLimit } from "@/lib/server/rate-limit";
import { createNotification } from "@/lib/server/notifications";
import {
  evaluateCancellationFraud,
  evaluateTaskFraud,
  persistFraudFlags,
} from "@/lib/server/fraud";
import type { Urgency } from "@/lib/algorithm";
import { isRunnerAvailable, type TimeRange } from "@/lib/availability";
import { estimateErrandFee } from "@/lib/pricing";
import type { ProofRow, TaskRow } from "@/lib/server/rows";
import { randomUUID } from "node:crypto";

const URGENCIES: readonly Urgency[] = ["low", "normal", "express"];

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
 * Identity verification is required for both sides of the marketplace. The
 * admin must approve the user's Ghana Card submission before they can post
 * errands (buyers) or go available/claim errands (runners).
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

/** Load a task via service-role and assert the caller owns it. */
async function ownedTask(taskId: string, userId: string) {
  const db = getServiceClient();
  const { data: task } = await db
    .from("tasks")
    .select("id, buyer_id, title, price, status, selected_runner_id")
    .eq("id", taskId)
    .maybeSingle<{
      id: string;
      buyer_id: string;
      title: string;
      price: string;
      status: string;
      selected_runner_id: string | null;
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
    .select("id, buyer_id, title, status, selected_runner_id, declined_runner_ids")
    .eq("id", taskId)
    .maybeSingle<{
      id: string;
      buyer_id: string;
      title: string;
      status: string;
      selected_runner_id: string | null;
      declined_runner_ids: string[];
    }>();
  if (!task || task.selected_runner_id !== runnerId) {
    throw new Error("Errand not found");
  }
  return task;
}

/**
 * Create an errand for the signed-in buyer (inserted under their own RLS), then
 * run the matcher so a ranked runner is ready when they open the tracking page.
 */
export async function createErrand(formData: FormData) {
  const userId = await requireUserId();
  await requireVerified(userId);
  await enforceRateLimit("post-errand", userId, 5, 300);
  const supabase = await createClient();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const urgencyRaw = String(formData.get("urgency") ?? "normal") as Urgency;
  const urgency: Urgency = URGENCIES.includes(urgencyRaw) ? urgencyRaw : "normal";
  const price = Math.max(0, Number(formData.get("price") ?? 0));
  const pickupLat = Number(formData.get("pickup_lat"));
  const pickupLng = Number(formData.get("pickup_lng"));
  const dropoffLatRaw = String(formData.get("dropoff_lat") ?? "").trim();
  const dropoffLngRaw = String(formData.get("dropoff_lng") ?? "").trim();
  const dropoffLat = dropoffLatRaw ? Number(dropoffLatRaw) : Number.NaN;
  const dropoffLng = dropoffLngRaw ? Number(dropoffLngRaw) : Number.NaN;
  const runnerId = String(formData.get("runner_id") ?? "").trim();
  const paymentReference = String(formData.get("payment_reference") ?? "").trim();

  if (!title || Number.isNaN(pickupLat) || Number.isNaN(pickupLng)) {
    throw new Error("Missing title or pickup location");
  }

  const pickup = { lat: pickupLat, lng: pickupLng };
  const dropoff =
    !Number.isNaN(dropoffLat) && !Number.isNaN(dropoffLng)
      ? { lat: dropoffLat, lng: dropoffLng }
      : null;
  const { fee, runnerPayout } = estimateErrandFee(price, pickup, dropoff, urgency);

  if (price <= fee) {
    throw new Error(`Budget must be greater than the platform fee of GHS ${fee.toFixed(2)}`);
  }
  if (runnerPayout <= 0) {
    throw new Error("Budget is too low to pay the runner");
  }

  // Manual pick: the buyer selected a runner from /app/runners. Create the task
  // already matched, hold funds, and send an offer to the runner.
  if (runnerId) {
    const db = getServiceClient();
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

    const { data: task, error } = await supabase
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
        payment_reference: paymentReference || null,
        status: "matched",
        selected_runner_id: runnerId,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !task) {
      throw new Error(error?.message ?? "Could not create errand");
    }

    const { data: wallet } = await db
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle<{ balance: string }>();
    const balance = wallet ? Number(wallet.balance) : 0;
    if (balance < price) {
      await topUp(userId, price - balance);
    }
    await holdFunds(task.id);
    await createNotification(runnerId, "offer", { task_id: task.id, task_title: title });

    revalidatePath("/app");
    revalidatePath(`/app/errands/${task.id}`);
    redirect(`/app/errands/${task.id}`);
  }

  // Auto-match: create a posted errand and run the matcher.
  const { data: task, error } = await supabase
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
      payment_reference: paymentReference || null,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !task) {
    throw new Error(error?.message ?? "Could not create errand");
  }

  // Matching is best-effort: a transient failure shouldn't lose the errand.
  try {
    await generateMatchRun(task.id);
  } catch {
    /* errand stays "posted"; buyer can re-run matching from the tracking page */
  }

  revalidatePath("/app");
  redirect(`/app/errands/${task.id}`);
}

/** Re-run the matcher for an errand still waiting on a runner. */
export async function rematch(taskId: string) {
  const userId = await requireUserId();
  await ownedTask(taskId, userId);
  await generateMatchRun(taskId);
  revalidatePath(`/app/errands/${taskId}`);
}

/**
 * Buyer confirms the matched runner and pays the price into escrow. Tops up the
 * buyer's simulated wallet if needed (no real payment rail in the skeleton),
 * assigns the top-ranked runner, and holds the funds.
 */
export async function payIntoEscrow(taskId: string) {
  const userId = await requireUserId();
  const task = await ownedTask(taskId, userId);
  if (
    (task.status !== "posted" && task.status !== "matched") ||
    task.selected_runner_id
  ) {
    return;
  }

  const db = getServiceClient();
  const { data: run } = await db
    .from("match_runs")
    .select("id")
    .eq("task_id", taskId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (!run) throw new Error("No runner matched yet");

  const { data: candidate } = await db
    .from("match_candidates")
    .select("runner_id")
    .eq("match_run_id", run.id)
    .order("rank", { ascending: true })
    .limit(1)
    .maybeSingle<{ runner_id: string }>();
  if (!candidate) throw new Error("No runner matched yet");

  const price = Number(task.price);
  const { data: wallet } = await db
    .from("wallets")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle<{ balance: string }>();
  const balance = wallet ? Number(wallet.balance) : 0;
  if (balance < price) {
    await topUp(userId, price - balance);
  }

  await db.from("tasks").update({ status: "matched" }).eq("id", taskId);
  await holdFunds(taskId);
  await offerToTopCandidate(taskId);

  revalidatePath(`/app/errands/${taskId}`);
  revalidatePath("/app");
}

export async function setAvailability(
  available: boolean,
  lat: number | null,
  lng: number | null,
) {
  const runnerId = await requireRunnerId();
  if (available) await requireVerified(runnerId);
  if (!available) await clearRunnerPresence(runnerId);
  const db = getServiceClient();
  await db.from("runner_profile").upsert({
    user_id: runnerId,
    is_available: available,
    available_manual: available,
    current_lat: lat,
    current_lng: lng,
    status: "active",
    updated_at: new Date().toISOString(),
  });

  revalidatePath("/app");
  revalidatePath("/app/settings");
}

/** Clear a manual availability override and return to scheduled hours. */
export async function clearAvailabilityOverride() {
  const runnerId = await requireRunnerId();
  const db = getServiceClient();
  const [runner, verified] = await Promise.all([
    db
      .from("runner_profile")
      .select("scheduled_hours")
      .eq("user_id", runnerId)
      .maybeSingle<{ scheduled_hours: TimeRange[] | null }>(),
    isUserVerified(runnerId),
  ]);

  const available = isRunnerAvailable(null, runner?.data?.scheduled_hours ?? null) && verified;
  await db
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

  const [verified] = await Promise.all([isUserVerified(runnerId)]);
  const available = isRunnerAvailable(null, schedule) && verified;
  const db = getServiceClient();
  await db.from("runner_profile").upsert({
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
  const db = getServiceClient();
  const task = await assignedTask(taskId, runnerId);
  if (task.status !== "matched") return;

  await db
    .from("tasks")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
    })
    .eq("id", taskId);
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
  const { data: task } = await db
    .from("tasks")
    .select("id, buyer_id, title, price, status, selected_runner_id")
    .eq("id", taskId)
    .maybeSingle<{
      id: string;
      buyer_id: string;
      title: string;
      price: string;
      status: string;
      selected_runner_id: string | null;
    }>();
  if (!task || task.status !== "posted" || task.selected_runner_id) return;

  const price = Number(task.price);
  const { data: wallet } = await db
    .from("wallets")
    .select("balance")
    .eq("user_id", task.buyer_id)
    .maybeSingle<{ balance: string }>();
  const balance = wallet ? Number(wallet.balance) : 0;
  if (balance < price) {
    await topUp(task.buyer_id, price - balance);
  }

  await db
    .from("tasks")
    .update({ status: "matched", selected_runner_id: runnerId })
    .eq("id", taskId);
  await holdFunds(taskId);
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

  await db
    .from("tasks")
    .update({
      declined_runner_ids: Array.from(
        new Set([...(task.declined_runner_ids ?? []), runnerId]),
      ),
    })
    .eq("id", taskId);
  await db.from("trust_events").insert({
    runner_id: runnerId,
    type: "responsiveness",
    value: 0,
  });
  await refreshTrustScore(runnerId);

  await offerToTopCandidate(taskId);

  revalidatePath(`/app/errands/${taskId}`);
  revalidatePath("/app");
}

export async function markPickedUp(taskId: string) {
  const runnerId = await requireRunnerId();
  const db = getServiceClient();
  const task = await assignedTask(taskId, runnerId);
  if (task.status !== "accepted") return;

  await db
    .from("tasks")
    .update({ status: "in_progress" })
    .eq("id", taskId);
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

  const photo = assertImageFile(formData.get("photo"), "delivery");
  const gpsLat = Number(formData.get("gps_lat"));
  const gpsLng = Number(formData.get("gps_lng"));

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
    gps_lat: Number.isNaN(gpsLat) ? null : gpsLat,
    gps_lng: Number.isNaN(gpsLng) ? null : gpsLng,
  });

  await db
    .from("tasks")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", taskId);

  // Run fraud detection on the delivery proof before the completed event is
  // folded into the runner's trust score.
  const { data: fullTask } = await db
    .from("tasks")
    .select(
      "id, buyer_id, category, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, urgency, price, fee, status, selected_runner_id, accepted_at, completed_at",
    )
    .eq("id", taskId)
    .single<TaskRow>();
  if (fullTask) {
    const proof: ProofRow = {
      gps_lat: Number.isNaN(gpsLat) ? null : gpsLat,
      gps_lng: Number.isNaN(gpsLng) ? null : gpsLng,
    };
    const fraud = await evaluateTaskFraud(db, fullTask, proof, Date.now());
    if (fullTask.selected_runner_id) {
      await persistFraudFlags(db, fullTask.selected_runner_id, taskId, fraud);
    }
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

/** Buyer rates the runner after delivery; releases escrow and feeds trust. */
export async function rateRunner(taskId: string, stars: number) {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    throw new Error("Rating must be an integer between 1 and 5 stars");
  }
  const userId = await requireUserId();
  const task = await ownedTask(taskId, userId);
  if (!task.selected_runner_id) return;
  if (task.status !== "completed" && task.status !== "resolved") return;

  const db = getServiceClient();

  const { data: existingRating } = await db
    .from("ratings")
    .select("id")
    .eq("task_id", taskId)
    .eq("rater_id", userId)
    .maybeSingle<{ id: string }>();
  if (existingRating) return;

  if (task.status === "completed") {
    await releaseFunds(taskId);
  }

  await db.from("ratings").insert({
    task_id: taskId,
    rater_id: userId,
    ratee_id: task.selected_runner_id,
    stars,
  });
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

  revalidatePath(`/app/errands/${taskId}`);
}

/** Buyer cancels an errand before the runner has accepted. */
export async function cancelErrand(taskId: string) {
  const userId = await requireUserId();
  const task = await ownedTask(taskId, userId);
  if (task.status !== "posted" && task.status !== "matched") return;

  await refund(taskId);
  const db = getServiceClient();
  await db
    .from("tasks")
    .update({ status: "cancelled" })
    .eq("id", taskId);
  if (task.selected_runner_id) {
    await createNotification(task.selected_runner_id, "buyer_cancelled", {
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

  await refund(taskId);
  await db
    .from("tasks")
    .update({ status: "cancelled" })
    .eq("id", taskId);
  await db.from("trust_events").insert({
    runner_id: runnerId,
    type: "cancelled",
    value: 1,
  });

  const cancelFraud = await evaluateCancellationFraud(db, runnerId, task.buyer_id, Date.now());
  await persistFraudFlags(db, runnerId, taskId, cancelFraud);

  await refreshTrustScore(runnerId);
  await createNotification(task.buyer_id, "runner_cancelled", {
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

/** Buyer raises a dispute on a completed errand; auto-resolves or escalates. */
export async function raiseDispute(taskId: string, formData: FormData) {
  const userId = await requireUserId();
  const task = await ownedTask(taskId, userId);
  if (task.status !== "completed") return;

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) throw new Error("A reason is required to raise a dispute");

  const db = getServiceClient();

  if (await hasLedgerEntry(db, taskId, ["release", "payout", "refund"])) return;

  const { data: existingDispute } = await db
    .from("disputes")
    .select("id")
    .eq("task_id", taskId)
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (existingDispute) return;

  const { data: dispute, error } = await db
    .from("disputes")
    .insert({ task_id: taskId, raised_by: userId, reason })
    .select("id")
    .single<{ id: string }>();
  if (error || !dispute) {
    throw new Error(error?.message ?? "Could not raise dispute");
  }

  await resolveDispute(dispute.id);

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
  const capabilities = formData.getAll("capabilities").map(String);
  const db = getServiceClient();
  await db.from("runner_profile").upsert(
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

/** Top up the signed-in user's simulated wallet. */
export async function topUpWallet(formData: FormData) {
  const userId = await requireUserId();
  const amount = Math.max(0, Number(formData.get("amount") ?? 0));
  if (amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }
  await topUp(userId, amount);
  revalidatePath("/app");
  revalidatePath("/app/wallet");
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
    .single();

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
  const type = file.type.toLowerCase();
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

function assertImageFile(value: FormDataEntryValue | null, label: string): File {
  if (!(value instanceof File) || value.size === 0) {
    throw new Error(`Please upload the ${label} photo`);
  }
  if (!value.type.startsWith("image/")) {
    throw new Error(`${label} photo must be an image file`);
  }
  return value;
}

/** Submit an ID verification request for the signed-in user. */
export async function submitVerification(formData: FormData) {
  const userId = await requireUserId();
  const supabase = await createClient();
  const db = getServiceClient();

  const front = assertImageFile(formData.get("front"), "front");
  const back = assertImageFile(formData.get("back"), "back");
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim() || null;

  if (!phone) {
    throw new Error("Please provide a phone number");
  }

  const { data: existing } = await supabase
    .from("verification_requests")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["pending", "approved"])
    .maybeSingle<{ id: string }>();
  if (existing) {
    throw new Error("You already have a pending or approved verification request");
  }

  const frontPath = `${userId}/${randomUUID()}.${fileExtension(front)}`;
  const backPath = `${userId}/${randomUUID()}.${fileExtension(back)}`;

  const { error: frontError } = await db.storage
    .from("verification")
    .upload(frontPath, await front.arrayBuffer(), {
      contentType: front.type,
      upsert: false,
    });
  if (frontError) throw new Error(frontError.message);

  const { error: backError } = await db.storage
    .from("verification")
    .upload(backPath, await back.arrayBuffer(), {
      contentType: back.type,
      upsert: false,
    });
  if (backError) throw new Error(backError.message);

  const { error } = await supabase.from("verification_requests").insert({
    user_id: userId,
    front_photo_path: frontPath,
    back_photo_path: backPath,
    phone,
    email,
  });
  if (error) {
    throw new Error(error.message);
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
