import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client authenticated with the **service-role key**,
 * which bypasses Row-Level Security. Use it exclusively in trusted server code
 * (server actions, route handlers, scripts) for privileged writes that clients
 * are intentionally barred from — escrow ledger/wallet mutations, match
 * snapshots, dispute resolutions, fraud flags.
 *
 * Never import this from a Client Component: it reads `SUPABASE_SERVICE_ROLE_KEY`
 * (a non-`NEXT_PUBLIC_` secret), so it cannot — and must not — run in the browser.
 */
let cached: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "getServiceClient requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  cached ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
