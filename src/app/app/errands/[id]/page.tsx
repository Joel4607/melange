import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Bike,
  CircleCheck,
  Clock,
  MapPin,
  ShieldCheck,
  Star,
  Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { Logo } from "@/components/brand";
import {
  payIntoEscrow,
  rateRunner,
  rematch,
} from "../../actions";

export const metadata: Metadata = {
  title: "Track your errand — Mélange",
};

type TaskStatus =
  | "posted"
  | "matched"
  | "accepted"
  | "in_progress"
  | "completed"
  | "disputed"
  | "resolved"
  | "cancelled";

const STEPS = ["Posted", "Matched", "Paid", "Delivered"] as const;

function stepIndex(status: TaskStatus, selectedRunnerId: string | null): number {
  switch (status) {
    case "posted":
      return 0;
    case "matched":
      return selectedRunnerId ? 2 : 1;
    case "accepted":
    case "in_progress":
      return 2;
    case "completed":
    case "resolved":
      return 3;
    default:
      return 0;
  }
}

export default async function ErrandPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const db = getServiceClient();
  const { data: task } = await db
    .from("tasks")
    .select(
      "id, buyer_id, title, description, category, urgency, price, status, selected_runner_id, created_at, accepted_at, completed_at",
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      buyer_id: string;
      title: string;
      description: string | null;
      category: string | null;
      urgency: string;
      price: string;
      status: TaskStatus;
      selected_runner_id: string | null;
      created_at: string;
      accepted_at: string | null;
      completed_at: string | null;
    }>();

  if (!task) notFound();
  if (task.buyer_id !== user.id) notFound();

  // Top-ranked candidate from the latest match run.
  const { data: run } = await db
    .from("match_runs")
    .select("id")
    .eq("task_id", task.id)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  let candidate: {
    runner_id: string;
    match_score: number;
    trust: number;
    distance_km: number;
  } | null = null;
  if (run) {
    const { data } = await db
      .from("match_candidates")
      .select("runner_id, match_score, trust, distance_km")
      .eq("match_run_id", run.id)
      .order("rank", { ascending: true })
      .limit(1)
      .maybeSingle<{
        runner_id: string;
        match_score: number;
        trust: number;
        distance_km: number;
      }>();
    candidate = data ?? null;
  }

  const runnerId = task.selected_runner_id ?? candidate?.runner_id ?? null;
  let runnerName = "A trusted runner";
  if (runnerId) {
    const { data: rp } = await db
      .from("profiles")
      .select("name")
      .eq("id", runnerId)
      .maybeSingle<{ name: string | null }>();
    if (rp?.name) runnerName = rp.name;
  }

  const { data: wallet } = await db
    .from("wallets")
    .select("balance, held")
    .eq("user_id", user.id)
    .maybeSingle<{ balance: string; held: string }>();

  const { data: existingRating } = await db
    .from("ratings")
    .select("stars")
    .eq("task_id", task.id)
    .eq("rater_id", user.id)
    .maybeSingle<{ stars: number }>();

  const step = stepIndex(task.status, task.selected_runner_id);
  const price = Number(task.price).toFixed(2);
  const trustStars = candidate ? (candidate.trust * 5).toFixed(1) : null;

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="border-b border-cream-deep/70 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <Logo />
          <Link
            href="/app"
            className="inline-flex items-center gap-1.5 rounded-full border border-cream-deep px-4 py-2 text-sm font-medium text-green-deep transition hover:bg-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Errands
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-8 sm:py-10">
        <div className="flex flex-wrap items-center gap-2">
          {task.category ? (
            <span className="rounded-full bg-green/10 px-3 py-1 text-xs font-medium text-green-deep">
              {task.category}
            </span>
          ) : null}
          <span className="rounded-full bg-orange/15 px-3 py-1 text-xs font-medium text-orange-deep capitalize">
            {task.urgency}
          </span>
        </div>

        <h1 className="mt-3 font-display text-fluid-h2 font-semibold text-green-deep">
          {task.title}
        </h1>
        {task.description ? (
          <p className="mt-2 text-muted">{task.description}</p>
        ) : null}

        <Stepper current={step} status={task.status} />

        {/* Matched runner */}
        {runnerId ? (
          <section className="mt-6 rounded-[1.5rem] border border-cream-deep bg-white p-6 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {task.status === "posted" || task.status === "matched"
                ? "Best match"
                : "Your runner"}
            </p>
            <div className="mt-2 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-green text-cream">
                  <Bike className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="font-display text-lg font-semibold text-green-deep">
                    {runnerName}
                  </p>
                  <p className="flex items-center gap-2 text-sm text-muted">
                    {trustStars ? (
                      <span className="inline-flex items-center gap-1 text-green-soft">
                        <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
                        {trustStars}
                      </span>
                    ) : null}
                    {candidate ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" aria-hidden />
                        {candidate.distance_km.toFixed(1)} km away
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-green/10 px-3 py-1 text-xs font-medium text-green-deep">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Verified
              </span>
            </div>
          </section>
        ) : (
          <section className="mt-6 rounded-[1.5rem] border border-cream-deep bg-white p-6 text-center shadow-sm">
            <Clock className="mx-auto h-6 w-6 text-orange-deep" aria-hidden />
            <p className="mt-2 font-medium text-green-deep">Finding a runner…</p>
            <p className="mt-1 text-sm text-muted">
              No runners were available just now. Try again in a moment.
            </p>
            <form action={rematch.bind(null, task.id)} className="mt-4">
              <button
                type="submit"
                className="rounded-full border border-green-soft px-5 py-2.5 text-sm font-semibold text-green-deep transition hover:bg-cream/40"
              >
                Try matching again
              </button>
            </form>
          </section>
        )}

        {/* Escrow + price */}
        <section className="mt-5 rounded-[1.5rem] border border-cream-deep bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-medium text-green-deep">
              <Wallet className="h-5 w-5 text-orange-deep" aria-hidden /> Budget
            </span>
            <span className="font-display text-2xl font-semibold text-green-deep">
              GHS {price}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted">
            {step >= 3
              ? "Released to your runner on delivery."
              : step === 2
                ? `Held safely in escrow${wallet ? ` (GHS ${Number(wallet.held).toFixed(2)} held)` : ""}. Released when you confirm delivery.`
                : "You'll pay into escrow when you confirm the match. Funds are only released on delivery."}
          </p>
        </section>

        {/* Action */}
        <div className="mt-6">
          {task.status === "matched" && !task.selected_runner_id && candidate ? (
            <form action={payIntoEscrow.bind(null, task.id)}>
              <PrimaryButton>
                Confirm &amp; pay GHS {price} into escrow
              </PrimaryButton>
            </form>
          ) : null}

          {task.status === "matched" && task.selected_runner_id ? (
            <div className="rounded-[1.5rem] border border-cream-deep bg-white p-6 text-center shadow-sm">
              <p className="font-medium text-green-deep">
                Paid — waiting for {runnerName} to accept
              </p>
            </div>
          ) : null}

          {task.status === "accepted" ? (
            <div className="rounded-[1.5rem] border border-cream-deep bg-white p-6 text-center shadow-sm">
              <p className="font-medium text-green-deep">
                {runnerName} accepted — heading to pickup
              </p>
            </div>
          ) : null}

          {task.status === "in_progress" ? (
            <div className="rounded-[1.5rem] border border-cream-deep bg-white p-6 text-center shadow-sm">
              <p className="font-medium text-green-deep">
                {runnerName} is out for delivery
              </p>
            </div>
          ) : null}

          {task.status === "completed" || task.status === "resolved" ? (
            <div className="rounded-[1.5rem] border border-green/30 bg-green/5 p-6 text-center">
              <CircleCheck className="mx-auto h-7 w-7 text-green-soft" aria-hidden />
              <p className="mt-2 font-display text-lg font-semibold text-green-deep">
                Delivered &amp; paid
              </p>
              {existingRating ? (
                <p className="mt-1 text-sm text-muted">
                  You rated {runnerName} {existingRating.stars}★. Thanks!
                </p>
              ) : (
                <>
                  <p className="mt-1 text-sm text-muted">
                    How did {runnerName} do?
                  </p>
                  <div className="mt-3 flex justify-center gap-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <form key={n} action={rateRunner.bind(null, task.id, n)}>
                        <button
                          type="submit"
                          aria-label={`Rate ${n} stars`}
                          className="grid h-10 w-10 place-items-center rounded-full border border-cream-deep text-orange-deep transition hover:bg-orange/10"
                        >
                          <Star className="h-5 w-5" aria-hidden />
                        </button>
                      </form>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function Stepper({
  current,
  status,
}: {
  current: number;
  status: TaskStatus;
}) {
  return (
    <ol className="mt-7 flex items-center">
      {STEPS.map((label, i) => {
        const done = i <= current;
        return (
          <li key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center">
              <span
                className={`grid h-8 w-8 place-items-center rounded-full text-sm font-semibold transition ${
                  done
                    ? "bg-green text-cream"
                    : "border border-cream-deep bg-white text-muted"
                }`}
              >
                {done ? <CircleCheck className="h-4 w-4" aria-hidden /> : i + 1}
              </span>
              <span
                className={`mt-1.5 text-xs ${done ? "font-medium text-green-deep" : "text-muted"}`}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 ? (
              <span
                className={`mx-1.5 h-0.5 flex-1 rounded ${
                  i < current ? "bg-green" : "bg-cream-deep"
                }`}
              />
            ) : null}
          </li>
        );
      })}
      {status === "disputed" ? (
        <span className="ml-3 rounded-full bg-orange/15 px-3 py-1 text-xs font-medium text-orange-deep">
          In dispute
        </span>
      ) : null}
    </ol>
  );
}

function PrimaryButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="flex w-full items-center justify-center gap-2 rounded-full bg-orange px-6 py-3.5 font-semibold text-white shadow-sm transition hover:bg-orange-deep"
    >
      {children}
    </button>
  );
}
