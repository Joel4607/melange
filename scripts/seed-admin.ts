/**
 * Promote an existing user to admin by email or user id.
 *
 * Run with: npm run seed:admin -- user@example.com
 *          or npm run seed:admin -- <uuid>
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { getServiceClient } from "@/lib/supabase/service";

const input = process.argv[2];
if (!input) {
  console.error("Usage: npm run seed:admin -- <email-or-user-id>");
  process.exit(1);
}

const db = getServiceClient();

async function resolveUserId(): Promise<string | null> {
  if (!input.includes("@")) {
    // Treat as a Supabase user id.
    return input;
  }

  let page = 0;
  while (true) {
    const { data, error } = await db.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (error) throw new Error(`auth listUsers: ${error.message}`);

    const user = data.users.find((u) => u.email === input);
    if (user) return user.id;
    if (data.users.length < 100) break;
    page++;
  }
  return null;
}

async function main() {
  const userId = await resolveUserId();
  if (!userId) {
    console.error(`No user found for ${input}`);
    process.exit(1);
  }

  const { error } = await db
    .from("profiles")
    .update({ is_admin: true })
    .eq("id", userId);

  if (error) {
    console.error(`Failed to promote ${input}: ${error.message}`);
    process.exit(1);
  }

  console.log(`Admin flag set for ${input} (${userId})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
