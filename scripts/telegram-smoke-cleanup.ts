import { getServiceClient } from "@/lib/supabase/service";

const emails = [
  "smoke.test@melange.app",
  "smoke.buyer@melange.app",
  "smoke.runner@melange.app",
];

async function main() {
  const db = getServiceClient();

  const { data: profiles } = await db
    .from("profiles")
    .select("id, email")
    .in("email", emails)
    .returns<{ id: string; email: string | null }[]>();

  const userIds = profiles?.map((p) => p.id) ?? [];

  for (const userId of userIds) {
    // Delete verification request + storage photos.
    const { data: verifications } = await db
      .from("verification_requests")
      .select("front_photo_path, back_photo_path")
      .eq("user_id", userId)
      .returns<{ front_photo_path: string; back_photo_path: string }[]>();
    const paths = (verifications ?? [])
      .flatMap((v) => [v.front_photo_path, v.back_photo_path])
      .filter(Boolean);
    if (paths.length) {
      await db.storage.from("verification").remove(paths);
    }
    await db.from("verification_requests").delete().eq("user_id", userId);

    // Delete tasks and disputes for this user (buyer or runner).
    const { data: tasks } = await db
      .from("tasks")
      .select("id")
      .or(`buyer_id.eq.${userId},selected_runner_id.eq.${userId}`)
      .returns<{ id: string }[]>();
    const taskIds = tasks?.map((t) => t.id) ?? [];
    if (taskIds.length) {
      await db.from("disputes").delete().in("task_id", taskIds);
      await db.from("tasks").delete().in("id", taskIds);
    }
  }

  // Delete auth users (this cascades to profiles).
  for (const email of emails) {
    const { data: profile } = await db
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle<{ id: string }>();
    if (profile?.id) {
      const { error } = await db.auth.admin.deleteUser(profile.id);
      if (error) console.error(`Failed to delete ${email}:`, error.message);
      else console.log("Deleted user:", email);
    }
  }

  console.log("Cleanup complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
