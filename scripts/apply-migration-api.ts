import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
const migrationName = process.argv[2];

if (!ref || !token || !migrationName) {
  console.error(
    "Usage: SUPABASE_PROJECT_REF=<ref> SUPABASE_ACCESS_TOKEN=<token> npx tsx scripts/apply-migration-api.ts <migration-file-name>",
  );
  process.exit(1);
}

async function main() {
  const filePath = path.join(__dirname, "..", "supabase", "migrations", migrationName);
  const query = fs.readFileSync(filePath, "utf8");

  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/migrations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, name: migrationName }),
  });

  const body = (await res.json()) as unknown;
  if (!res.ok) {
    console.error("Migration failed:", res.status, body);
    process.exit(1);
  }
  console.log("Migration applied:", body);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
