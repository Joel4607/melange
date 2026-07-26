/**
 * End-to-end smoke test for the Telegram dispute alert flow.
 *
 * 1. Creates a test buyer, runner, task, and escalated dispute.
 * 2. Notifies linked admins.
 * 3. Simulates a "Release to runner" callback, which should show the confirmation prompt.
 * 4. Simulates cancel to revert back to the original dispute keyboard.
 */
import { getServiceClient } from "@/lib/supabase/service";
import { handleTelegramUpdate } from "@/lib/telegram/webhook";
import { notifyAdminsOfDispute } from "@/lib/telegram/messaging";

const BUYER_EMAIL = "smoke.buyer@melange.app";
const RUNNER_EMAIL = "smoke.runner@melange.app";

async function createUser(email: string, role: "buyer" | "runner") {
  const db = getServiceClient();

  const { data: existing } = await db
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle<{ id: string }>();
  if (existing) return existing.id;

  const { data: auth, error } = await db.auth.admin.createUser({
    email,
    password: "smoke123",
    email_confirm: true,
    user_metadata: { role },
  });
  if (error || !auth.user) throw new Error(`createUser ${email}: ${error?.message ?? "no user"}`);
  return auth.user.id;
}

async function main() {
  const db = getServiceClient();

  const admin = await db
    .from("profiles")
    .select("id, name, telegram_user_id")
    .eq("is_admin", true)
    .not("telegram_user_id", "is", null)
    .maybeSingle<{ id: string; name: string | null; telegram_user_id: string | null }>();
  if (!admin.data || !admin.data.telegram_user_id) {
    console.error("No admin with a linked Telegram account found.");
    process.exit(1);
  }

  const buyerId = await createUser(BUYER_EMAIL, "buyer");
  const runnerId = await createUser(RUNNER_EMAIL, "runner");

  // Ensure runner_profile exists for the runner.
  await db.from("runner_profile").upsert({ user_id: runnerId, updated_at: new Date().toISOString() });

  const { data: task, error: taskErr } = await db
    .from("tasks")
    .insert({
      buyer_id: buyerId,
      selected_runner_id: runnerId,
      title: "Smoke test delivery",
      category: "Other",
      pickup_lat: 5.6037,
      pickup_lng: -0.187,
      dropoff_lat: 5.61,
      dropoff_lng: -0.18,
      urgency: "normal",
      price: 50,
      status: "completed",
    })
    .select("id, title")
    .single<{ id: string; title: string }>();
  if (taskErr || !task) throw new Error(`insert task: ${taskErr?.message ?? "no id"}`);

  const { data: dispute, error: disputeErr } = await db
    .from("disputes")
    .insert({
      task_id: task.id,
      raised_by: buyerId,
      reason: "Smoke: not delivered",
      status: "escalated",
    })
    .select("id")
    .single<{ id: string }>();
  if (disputeErr || !dispute) throw new Error(`insert dispute: ${disputeErr?.message ?? "no id"}`);

  console.log("Created task:", task.id, "dispute:", dispute.id);

  console.log("Sending dispute notification to linked admins...");
  await notifyAdminsOfDispute(dispute.id, task.title);

  const updateIdBase = Date.now();

  console.log("Simulating 'Release to runner' callback (should show confirmation)...");
  await handleTelegramUpdate({
    update_id: updateIdBase,
    callback_query: {
      id: `${updateIdBase}`,
      from: {
        id: Number(admin.data.telegram_user_id),
        first_name: admin.data.name ?? "Admin",
      },
      message: { chat: { id: Number(admin.data.telegram_user_id), type: "private" }, message_id: updateIdBase },
      data: `dr:${dispute.id}`,
    },
  });

  console.log("Simulating cancel to revert to original keyboard...");
  await handleTelegramUpdate({
    update_id: updateIdBase + 1,
    callback_query: {
      id: `${updateIdBase + 1}`,
      from: {
        id: Number(admin.data.telegram_user_id),
        first_name: admin.data.name ?? "Admin",
      },
      message: { chat: { id: Number(admin.data.telegram_user_id), type: "private" }, message_id: updateIdBase },
      data: `dr_cancel:${dispute.id}`,
    },
  });

  // Verify dispute still escalated (resolution was not confirmed).
  const { data: after } = await db
    .from("disputes")
    .select("status")
    .eq("id", dispute.id)
    .maybeSingle<{ status: string }>();
  if (after?.status !== "escalated") {
    console.error("Smoke test FAILED: dispute should still be escalated, got", after?.status);
    process.exit(1);
  }

  console.log("Dispute smoke test PASSED: alert, confirmation prompt, and cancel all worked.");
  console.log("Admin linked:", admin.data.telegram_user_id, admin.data.name);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
