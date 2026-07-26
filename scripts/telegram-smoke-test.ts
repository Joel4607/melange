/**
 * End-to-end smoke test for the Telegram admin bot flow.
 *
 * 1. Creates (or reuses) a test user and submits a verification request.
 * 2. Notifies linked admins (requires a linked admin Telegram ID in DB).
 * 3. Simulates a Telegram "Reject" callback.
 * 4. Asserts the verification request becomes "rejected".
 */
import { getServiceClient } from "@/lib/supabase/service";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { handleTelegramUpdate } from "@/lib/telegram/webhook";
import { notifyAdminsOfVerification } from "@/lib/telegram/messaging";

const TEST_EMAIL = "smoke.test@melange.app";
const TEST_PASSWORD = "smoke123";

async function createOrGetUser(): Promise<string> {
  const db = getServiceClient();

  const { data: existing } = await db
    .from("profiles")
    .select("id")
    .eq("email", TEST_EMAIL)
    .maybeSingle<{ id: string }>();
  if (existing) return existing.id;

  const { data: auth, error: authError } = await db.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { role: "runner" },
  });
  if (authError || !auth.user) throw new Error(`createUser: ${authError?.message ?? "no user"}`);

  return auth.user.id;
}

async function uploadTestImage(userId: string, label: string): Promise<string> {
  const db = getServiceClient();
  const sourcePath = path.join(process.cwd(), "public", "icon-192x192.png");
  const buffer = fs.readFileSync(sourcePath);
  const photoPath = `${userId}/${label}-${randomUUID()}.png`;

  const { error } = await db.storage.from("verification").upload(photoPath, buffer, {
    contentType: "image/png",
    upsert: false,
  });
  if (error) throw new Error(`upload ${label}: ${error.message}`);
  return photoPath;
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
    console.error("No admin with a linked Telegram account found. Skipping notification delivery test.");
    console.error("Link an admin in /admin/telegram-link first.");
    process.exit(1);
  }

  const userId = await createOrGetUser();
  console.log("Test user:", userId);

  const frontPath = await uploadTestImage(userId, "front");
  const backPath = await uploadTestImage(userId, "back");

  // Remove any existing pending request for this test user.
  await db.from("verification_requests").delete().eq("user_id", userId).eq("status", "pending");

  const { data: request, error } = await db
    .from("verification_requests")
    .insert({
      user_id: userId,
      front_photo_path: frontPath,
      back_photo_path: backPath,
      phone: "+233 20 000 0000",
      email: TEST_EMAIL,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !request) throw new Error(`insert verification request: ${error?.message ?? "no id"}`);

  console.log("Created verification request:", request.id);

  console.log("Sending notification to linked admins...");
  await notifyAdminsOfVerification(request.id, userId);

  console.log("Simulating Telegram Reject callback...");
  const updateId = Date.now();
  await handleTelegramUpdate({
    update_id: updateId,
    callback_query: {
      id: `${updateId}`,
      from: {
        id: Number(admin.data.telegram_user_id),
        first_name: admin.data.name ?? "Admin",
      },
      data: `vr:${request.id}`,
    },
  });

  const { data: after } = await db
    .from("verification_requests")
    .select("status")
    .eq("id", request.id)
    .maybeSingle<{ status: string }>();

  if (after?.status !== "rejected") {
    console.error("Smoke test FAILED: expected status 'rejected', got", after?.status);
    process.exit(1);
  }

  console.log("Smoke test PASSED: verification request was rejected via Telegram callback.");
  console.log("Admin linked:", admin.data.telegram_user_id, admin.data.name);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
