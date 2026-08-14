// scripts/validate-env.ts
// Simple script to validate required environment variables and Supabase connectivity
import { createClient } from "@supabase/supabase-js";

function checkEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

const requiredVars = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

requiredVars.forEach(checkEnvVar);

// Verify Supabase connection (simple select)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  const { error } = await supabase.from("profiles").select("id").limit(1);
  if (error) {
    console.error(`❌ Supabase connection test failed: ${error.message}`);
    process.exit(1);
  }
  console.log("✅ Environment validation passed.");
})();
