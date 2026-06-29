"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AuthShell, Field } from "@/components/auth-shell";

type Role = "buyer" | "runner";

function roleFrom(value: string | null): Role {
  return value === "runner" ? "runner" : "buyer";
}

export function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const role = roleFrom(params.get("role"));

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, phone, role },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/app`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Email-confirmation off → session is live immediately; on → confirm first.
    if (data.session) {
      router.push("/app");
      router.refresh();
    } else {
      setSent(true);
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <AuthShell
        title="Check your inbox"
        subtitle="We sent a confirmation link to finish creating your account."
      >
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-green/10 text-green">
            <MailCheck className="h-7 w-7" aria-hidden />
          </span>
          <p className="text-muted">
            Tap the link in the email sent to{" "}
            <span className="font-medium text-ink">{email}</span>, then come back
            and log in.
          </p>
          <Link
            href="/login"
            className="mt-2 inline-flex w-full items-center justify-center rounded-full bg-green px-6 py-3 font-semibold text-cream transition hover:bg-green-deep"
          >
            Go to log in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={role === "runner" ? "Become a runner" : "Create your account"}
      subtitle={
        role === "runner"
          ? "Sign up to start earning on errands near you."
          : "Sign up to post your first errand in minutes."
      }
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-green-deep hover:text-orange-deep">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex items-center justify-between rounded-xl bg-cream px-4 py-2.5 text-sm">
          <span className="text-muted">
            Signing up as{" "}
            <span className="font-semibold text-green-deep">
              {role === "runner" ? "a runner" : "a customer"}
            </span>
          </span>
          <Link
            href={`/signup?role=${role === "runner" ? "buyer" : "runner"}`}
            className="font-medium text-orange-deep hover:underline"
          >
            Switch
          </Link>
        </div>

        <Field
          label="Full name"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ama Mensah"
        />
        <Field
          label="Phone number"
          type="tel"
          autoComplete="tel"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="055 764 4244"
        />
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
          autoComplete="new-password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 6 characters"
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
              Create account
              <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </button>
      </form>
    </AuthShell>
  );
}
