import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Bike, Star, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { Logo } from "@/components/brand";

export const metadata: Metadata = {
  title: "Earnings — Mélange",
};

interface CompletedTask {
  id: string;
  title: string;
  category: string | null;
  price: string;
  fee: string;
  status: string;
  completed_at: string | null;
  created_at: string;
}

interface Rating {
  task_id: string;
  stars: number;
  comment: string | null;
  created_at: string;
}

export default async function EarningsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const role = user.user_metadata?.role === "runner" ? "runner" : "buyer";
  if (role !== "runner") redirect("/app");

  const db = getServiceClient();
  const [{ data: tasks }, { data: ratings }] = await Promise.all([
    db
      .from("tasks")
      .select("id, title, category, price, fee, status, completed_at, created_at")
      .eq("selected_runner_id", user.id)
      .in("status", ["completed", "resolved"])
      .order("completed_at", { ascending: false })
      .returns<CompletedTask[]>(),
    db
      .from("ratings")
      .select("task_id, stars, comment, created_at")
      .eq("ratee_id", user.id)
      .returns<Rating[]>(),
  ]);

  const ratingByTask = new Map((ratings ?? []).map((r) => [r.task_id, r]));
  const completed = tasks ?? [];
  const totalEarned = completed.reduce(
    (sum, t) => sum + Math.max(0, Number(t.price) - Number(t.fee)),
    0,
  );
  const averageRating =
    ratings && ratings.length > 0
      ? ratings.reduce((sum, r) => sum + r.stars, 0) / ratings.length
      : 0;

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="border-b border-cream-deep/70 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <Logo />
          <Link
            href="/app"
            className="inline-flex items-center gap-1.5 rounded-full border border-cream-deep px-4 py-2 text-sm font-medium text-green-deep transition hover:bg-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-8 sm:py-10">
        <h1 className="font-display text-fluid-h2 font-semibold text-green-deep">Earnings</h1>
        <p className="mt-2 text-muted">
          A history of completed errands, payouts, and the ratings buyers left you.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <SummaryCard
            icon={<Wallet className="h-5 w-5 text-orange-deep" aria-hidden />}
            label="Total earned"
            value={`GHS ${totalEarned.toFixed(2)}`}
          />
          <SummaryCard
            icon={<Bike className="h-5 w-5 text-orange-deep" aria-hidden />}
            label="Completed errands"
            value={String(completed.length)}
          />
          <SummaryCard
            icon={<Star className="h-5 w-5 text-orange-deep" aria-hidden />}
            label="Average rating"
            value={averageRating > 0 ? `${averageRating.toFixed(1)} / 5` : "No ratings yet"}
          />
        </div>

        {completed.length === 0 ? (
          <div className="mt-8 rounded-[1.5rem] border border-cream-deep bg-white p-8 text-center shadow-sm">
            <p className="font-medium text-green-deep">No completed errands yet</p>
            <p className="mt-1 text-sm text-muted">
              Complete your first errand and your earnings history will show up here.
            </p>
          </div>
        ) : (
          <ul className="mt-8 space-y-4">
            {completed.map((task) => {
              const payout = Math.max(0, Number(task.price) - Number(task.fee));
              const rating = ratingByTask.get(task.id);
              const date = task.completed_at ?? task.created_at;
              return (
                <li
                  key={task.id}
                  className="flex flex-col justify-between gap-4 rounded-[1.5rem] border border-cream-deep bg-white p-6 shadow-sm sm:flex-row sm:items-center"
                >
                  <div>
                    <p className="font-display text-lg font-semibold text-green-deep">
                      {task.title}
                    </p>
                    <p className="text-sm text-muted">
                      {task.category ?? "Errand"} · {new Date(date).toLocaleDateString()}
                    </p>
                    {rating ? (
                      <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-green/10 px-2.5 py-1 text-sm font-medium text-green-deep">
                        <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
                        {rating.stars} / 5
                        {rating.comment ? ` · ${rating.comment}` : null}
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-muted">No rating yet</p>
                    )}
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="font-display text-xl font-semibold text-green-deep">
                      GHS {payout.toFixed(2)}
                    </p>
                    <p className="text-sm text-muted">Fee GHS {Number(task.fee).toFixed(2)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-cream-deep bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-medium text-muted">
        {icon}
        {label}
      </div>
      <p className="mt-2 font-display text-2xl font-semibold text-green-deep">{value}</p>
    </div>
  );
}
