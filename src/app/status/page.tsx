import { createClient } from "@/lib/supabase/server";

type ConnState =
  | { status: "ok"; greeting: string | null; note?: string }
  | { status: "unconfigured" }
  | { status: "error"; message: string };

async function checkSupabase(): Promise<ConnState> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return { status: "unconfigured" };
  }

  try {
    const supabase = await createClient();

    // Proves the client can reach Supabase Auth with the configured keys
    // (succeeds with no error even when there is no logged-in session).
    const { error: authError } = await supabase.auth.getSession();
    if (authError) return { status: "error", message: authError.message };

    // Optional: read a row from the `greetings` table if it exists.
    const { data, error } = await supabase
      .from("greetings")
      .select("message")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return {
        status: "ok",
        greeting: null,
        note: "Connected. Run supabase/migrations/0001_greetings.sql to see a live row.",
      };
    }

    return { status: "ok", greeting: data?.message ?? null };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

export default async function StatusPage() {
  const conn = await checkSupabase();

  return (
    <main className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-8 px-6 py-20 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-green-deep">
          System status
        </h1>
        <p className="text-muted">
          Mélange — walking skeleton (Next.js + Supabase + Vercel).
        </p>
      </div>

      <div className="w-full rounded-2xl border border-cream-deep bg-white p-5 text-left shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Supabase connection
        </h2>

        {conn.status === "ok" && (
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-2 font-medium text-green-soft">
              <span className="h-2.5 w-2.5 rounded-full bg-green-soft" />
              Connected
            </span>
            {conn.greeting ? (
              <p className="text-ink">
                Message from the database:{" "}
                <strong>&ldquo;{conn.greeting}&rdquo;</strong>
              </p>
            ) : (
              <p className="text-sm text-muted">{conn.note}</p>
            )}
          </div>
        )}

        {conn.status === "unconfigured" && (
          <span className="inline-flex items-center gap-2 font-medium text-orange-deep">
            <span className="h-2.5 w-2.5 rounded-full bg-orange" />
            Not configured — set the Supabase env vars in .env.local
          </span>
        )}

        {conn.status === "error" && (
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-2 font-medium text-red-600">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              Connection error
            </span>
            <p className="text-sm text-muted">{conn.message}</p>
          </div>
        )}
      </div>
    </main>
  );
}
