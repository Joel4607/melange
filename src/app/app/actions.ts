"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { generateMatchRun } from "@/lib/server/matching";
import { holdFunds, releaseFunds, topUp } from "@/lib/server/escrow";
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

/** Load a task via service-role and assert the caller owns it. */
async function ownedTask(taskId: string, userId: string) {
  const db = getServiceClient();
  const { data: task } = await db
    .from("tasks")
    .select("id, buyer_id, price, status, selected_runner_id")
    .eq("id", taskId)
    .maybeSingle<{
      id: string;
      buyer_id: string;
      price: string;
      status: string;
      selected_runner_id: string | null;
    }>();
  if (!task || task.buyer_id !== userId) {
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

  if (!title || Number.isNaN(pickupLat) || Number.isNaN(pickupLng)) {
    throw new Error("Missing title or pickup location");
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
      pickup_lat: pickupLat,
      pickup_lng: pickupLng,
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
  if (task.status !== "posted" && task.status !== "matched") return;

  const db = getServiceClient();

  let runnerId = task.selected_runner_id;
  if (!runnerId) {
    const { data: run } = await db
      .from("match_runs")
      .select("id")
      .eq("task_id", taskId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (run) {
      const { data: top } = await db
        .from("match_candidates")
        .select("runner_id")
        .eq("match_run_id", run.id)
        .order("rank", { ascending: true })
        .limit(1)
        .maybeSingle<{ runner_id: string }>();
      runnerId = top?.runner_id ?? null;
    }
  }
  if (!runnerId) throw new Error("No runner matched yet");

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

  await db
    .from("tasks")
    .update({
      selected_runner_id: runnerId,
      status: "accepted",
      accepted_at: new Date().toISOString(),
    })
    .eq("id", taskId);
  await holdFunds(taskId);

  revalidatePath(`/app/errands/${taskId}`);
  revalidatePath("/app");
}

/** Buyer confirms delivery: releases escrow to the runner and closes the task. */
export async function confirmDelivery(taskId: string) {
  const userId = await requireUserId();
  const task = await ownedTask(taskId, userId);
  if (task.status !== "accepted" && task.status !== "in_progress") return;

  const db = getServiceClient();
  await releaseFunds(taskId);
  await db
    .from("tasks")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", taskId);
  if (task.selected_runner_id) {
    await db.from("trust_events").insert({
      runner_id: task.selected_runner_id,
      type: "completed",
      value: 1,
    });
  }

  revalidatePath(`/app/errands/${taskId}`);
  revalidatePath("/app");
}

/** Buyer rates the runner after delivery; feeds the trust framework. */
export async function rateRunner(taskId: string, stars: number) {
  const userId = await requireUserId();
  const task = await ownedTask(taskId, userId);
  if (!task.selected_runner_id) return;

  const db = getServiceClient();
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

  revalidatePath(`/app/errands/${taskId}`);
}
