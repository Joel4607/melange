"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { generateMatchRun, offerToTopCandidate, refreshTrustScore } from "@/lib/server/matching";
import { hasLedgerEntry, holdFunds, releaseFunds, refund, topUp } from "@/lib/server/escrow";
import { resolveDispute } from "@/lib/server/disputes";
import { createNotification } from "@/lib/server/notifications";
import type { Urgency } from "@/lib/algorithm";

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

  if (!title || Number.isNaN(pickupLat) || Number.isNaN(pickupLng)) {
    throw new Error("Missing title or pickup location");
  }

  const priceCents = Math.round(price * 100);
  const feeCents = Math.round(priceCents * 0.1);
  const fee = feeCents / 100;

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
      dropoff_lat: Number.isNaN(dropoffLat) ? null : dropoffLat,
      dropoff_lng: Number.isNaN(dropoffLng) ? null : dropoffLng,
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
  const db = getServiceClient();
  await db.from("runner_profile").upsert({
    user_id: runnerId,
    is_available: available,
    current_lat: lat,
    current_lng: lng,
    status: "active",
    updated_at: new Date().toISOString(),
  });

  revalidatePath("/app");
}

export async function acceptOffer(taskId: string) {
  const runnerId = await requireRunnerId();
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

  const photoUrl = String(formData.get("photo_url") ?? "").trim();
  const gpsLat = Number(formData.get("gps_lat"));
  const gpsLng = Number(formData.get("gps_lng"));

  if (!photoUrl) {
    throw new Error("A delivery photo URL is required");
  }

  await db.from("proofs").insert({
    task_id: taskId,
    runner_id: runnerId,
    photo_url: photoUrl,
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
}

/** Update the runner's current latitude and longitude while available. */
export async function updateLocation(lat: number, lng: number) {
  const runnerId = await requireRunnerId();
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

/** Submit an ID verification request for the signed-in user. */
export async function submitVerification(formData: FormData) {
  const userId = await requireUserId();
  const supabase = await createClient();
  const idPhotoUrl = String(formData.get("id_photo_url") ?? "").trim();

  if (!idPhotoUrl) {
    throw new Error("Please provide a photo URL");
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

  const { error } = await supabase.from("verification_requests").insert({
    user_id: userId,
    id_photo_url: idPhotoUrl,
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
}
