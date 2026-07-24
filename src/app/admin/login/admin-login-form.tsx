"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { AuthShell, Field } from "@/components/auth-shell";
import { loginAdmin } from "./actions";

export function AdminLoginForm() {
  const [state, dispatch, isPending] = useActionState(loginAdmin, { error: null });

  return (
    <AuthShell
      title="Admin sign-in"
      subtitle={
        <span className="inline-flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-orange-deep" aria-hidden />
          Restricted to authorized administrators.
        </span>
      }
      footer={
        <>
          Not an admin?{" "}
          <Link href="/login" className="font-semibold text-green-deep hover:text-orange-deep">
            Buyer / Runner log in
          </Link>
        </>
      }
    >
      <form action={dispatch} className="flex flex-col gap-4">
        <Field
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="admin@melange.test"
        />
        <Field
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          placeholder="Your password"
        />

        {state.error ? (
          <p className="rounded-xl bg-orange/10 px-4 py-2.5 text-sm text-orange-deep">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isPending}
          className="mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-orange px-6 py-3.5 font-semibold text-white transition hover:bg-orange-deep disabled:opacity-60"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <>
              Sign in
              <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </button>
      </form>
    </AuthShell>
  );
}
