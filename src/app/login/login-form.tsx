"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AuthShell, Field } from "@/components/auth-shell";

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/app";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Full page navigation so the new session cookies are sent and the
    // Router Cache is cleared, preventing a stale dashboard on account switch.
    window.location.href = next.startsWith("/") ? next : "/app";
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to manage your errands."
      footer={
        <>
          New to Mélange?{" "}
          <Link href="/get-started" className="font-semibold text-green-deep hover:text-orange-deep">
            Get started
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Your password"
        />

        {error ? (
          <p className="rounded-xl bg-orange/10 px-4 py-2.5 text-sm text-orange-deep">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-orange px-6 py-3.5 font-semibold text-white transition hover:bg-orange-deep disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <>
              Log in
              <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </button>
      </form>
    </AuthShell>
  );
}
