/**
 * Seed + end-to-end smoke of the wiring layer against a live Supabase project.
 *
 * Creates a fresh, self-contained scenario each run (emails are timestamped, so
 * runs never collide), then exercises the full happy path:
 *   post task -> generateMatchRun -> holdFunds -> accept -> proof
 *   -> raise dispute -> resolveDispute -> release.
 *
 * Run with:  npm run seed        (needs NEXT_PUBLIC_SUPABASE_URL +
 *                                 SUPABASE_SERVICE_ROLE_KEY in .env.local)
 *
 * It writes through the service-role client, so it bypasses RLS — never point
 * it at a database you care about beyond this project.
 */
import { getServiceClient } from "@/lib/supabase/service";
import { generateMatchRun } from "@/lib/server/matching";
import { holdFunds, releaseFunds } from "@/lib/server/escrow";
import { resolveDispute } from "@/lib/server/disputes";

const db = getServiceClient();
const stamp = Date.now();

// Accra city centre; runners scatter a few hundred metres out.
const CENTER = { lat: 5.6037, lng: -0.187 };

async function createUser(role: string, name: string): Promise<string> {
  const email = `${role}+${stamp}@melange.test`;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: `seed-${stamp}`,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  console.log(`  user ${name} -> ${data.user.id}`);
  return data.user.id;
}

async function main() {
  console.log("seeding scenario", stamp);

  const buyerId = await createUser("buyer", "Buyer Bola");
  const runners = [
    { id: await createUser("runner-a", "Runner Ama"), dLat: 0.002, dLng: 0.001, load: 0, completed: 12 },
    { id: await createUser("runner-b", "Runner Kofi"), dLat: 0.01, dLng: 0.012, load: 2, completed: 5 },
    { id: await createUser("runner-c", "Runner Esi"), dLat: 0.004, dLng: -0.003, load: 1, completed: 30 },
  ];

  // Buyer funds + each runner's operational state and trust history.
  await db.from("wallets").upsert({ user_id: buyerId, balance: 100 });
  for (const r of runners) {
    await db.from("runner_profile").upsert({
      user_id: r.id,
      current_lat: CENTER.lat + r.dLat,
      current_lng: CENTER.lng + r.dLng,
      is_available: true,
      active_load: r.load,
      status: "active",
    });
    const events = Array.from({ length: r.completed }, () => ({
      runner_id: r.id,
      type: "completed",
      value: 1,
    }));
    events.push({ runner_id: r.id, type: "rating", value: 5 });
    await db.from("trust_events").insert(events);
  }

  // Buyer posts a task.
  const { data: task, error: taskErr } = await db
    .from("tasks")
    .insert({
      buyer_id: buyerId,
      title: "Pick up groceries",
      pickup_lat: CENTER.lat,
      pickup_lng: CENTER.lng,
      urgency: "normal",
      price: 20,
      status: "posted",
    })
    .select("id")
    .single<{ id: string }>();
  if (taskErr || !task) throw new Error(`create task: ${taskErr?.message}`);
  console.log("task posted", task.id);

  // 1. Match.
  const ranked = await generateMatchRun(task.id);
  console.log("ranked runners:");
  for (const m of ranked) {
    console.log(
      `  #${m.rank} ${m.runnerId} score=${m.matchScore.toFixed(3)} ` +
        `dist=${m.components.distanceKm.toFixed(2)}km trust=${m.components.trust.toFixed(2)}`,
    );
  }
  const winner = ranked[0];
  if (!winner) throw new Error("no runner matched");

  // 2. Escrow hold + buyer selects the top runner.
  await holdFunds(task.id);
  await db
    .from("tasks")
    .update({
      selected_runner_id: winner.runnerId,
      status: "accepted",
      accepted_at: new Date().toISOString(),
    })
    .eq("id", task.id);
  console.log("held 20.00 and accepted by", winner.runnerId);

  // 3. Runner submits proof at the pickup location.
  await db.from("proofs").insert({
    task_id: task.id,
    runner_id: winner.runnerId,
    photo_url: "https://example.com/proof.jpg",
    gps_lat: CENTER.lat,
    gps_lng: CENTER.lng,
  });

  // 4. Buyer raises a dispute -> arbitration (proof + GPS match -> release).
  const { data: dispute, error: dErr } = await db
    .from("disputes")
    .insert({ task_id: task.id, raised_by: buyerId, reason: "item looked wrong" })
    .select("id")
    .single<{ id: string }>();
  if (dErr || !dispute) throw new Error(`create dispute: ${dErr?.message}`);

  const outcome = await resolveDispute(dispute.id);
  console.log("dispute outcome:", outcome.ruleMatched, "->", outcome.escalate ? "escalated" : outcome.resolution);

  // If the engine escalated instead of resolving, release manually so the demo
  // still shows the full money flow.
  if (outcome.escalate) await releaseFunds(task.id);

  const { data: wallets } = await db
    .from("wallets")
    .select("user_id, balance, held")
    .in("user_id", [buyerId, winner.runnerId])
    .returns<{ user_id: string; balance: string; held: string }[]>();
  console.log("final wallets:", wallets);
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
