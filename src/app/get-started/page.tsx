import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, PackageCheck, Bike } from "lucide-react";
import { Logo } from "@/components/brand";

export const metadata: Metadata = {
  title: "Get started — Mélange",
  description: "Tell us how you'd like to use Mélange.",
};

const roles = [
  {
    role: "buyer",
    icon: PackageCheck,
    title: "I need errands run",
    blurb:
      "Post a market run, grocery list, pharmacy pickup or delivery — a trusted runner handles it and shares photo proof.",
    cta: "Continue as a customer",
  },
  {
    role: "runner",
    icon: Bike,
    title: "I want to earn as a runner",
    blurb:
      "Pick up errands near you, build your trust score, and get paid for every run you complete.",
    cta: "Continue as a runner",
  },
] as const;

export default function GetStarted() {
  return (
    <main className="flex min-h-dvh flex-col bg-cream">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <Logo />
        <Link
          href="/login"
          className="text-sm font-medium text-green-deep hover:text-orange-deep"
        >
          Log in
        </Link>
      </header>

      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-5 py-10">
        <div className="mx-auto max-w-xl text-center">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-orange">
            Welcome to Mélange
          </p>
          <h1 className="mt-3 font-display text-fluid-h2 font-semibold text-green-deep">
            Which one are you?
          </h1>
          <p className="mt-3 text-muted">
            You can always do both later — this just sets up the right home
            screen for you.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {roles.map((r) => (
            <Link
              key={r.role}
              href={`/signup?role=${r.role}`}
              className="group flex flex-col rounded-[1.75rem] border border-cream-deep bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:border-green-soft hover:shadow-lg"
            >
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-green text-cream transition group-hover:bg-orange">
                <r.icon className="h-7 w-7" aria-hidden />
              </span>
              <h2 className="mt-5 font-display text-2xl font-semibold text-green-deep">
                {r.title}
              </h2>
              <p className="mt-2 flex-1 text-muted">{r.blurb}</p>
              <span className="mt-6 inline-flex items-center gap-2 font-semibold text-orange-deep">
                {r.cta}
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden />
              </span>
            </Link>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-green-deep hover:text-orange-deep">
            Log in
          </Link>
        </p>
      </section>
    </main>
  );
}
