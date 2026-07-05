import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Bike,
  CircleCheck,
  Clock,
  PackageCheck,
  Plus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { Logo } from "@/components/brand";
import { AvailabilityToggle } from "./availability-toggle";
import { acceptOffer, declineOffer, markDelivered, markPickedUp } from "./actions";

export const metadata: Metadata = {
  title: "Your dashboard — Mélange",
};

type Role = "buyer" | "runner";

interface ErrandSummary {
  id: string;
  title: string;
  status: string;
  price: string;
  category: string | null;
  created_at: string;
}

interface RunnerProfileSummary {
  is_available: boolean;
  current_lat: number | null;
  current_lng: number | null;
  active_load: number;
  status: string;
}

interface RunnerTaskSummary {
  id: string;
  title: string;
  status: string;
  price: string;
  category: string | null;
  pickup_lat: number;
  pickup_lng: number;
}

export default async function AppHome() {
  const supabase = await createClient();
  const db = getServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware guards this route, but never trust that alone.
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, phone, verified")
    .eq("id", user.id)
    .single();

  // Backfill the phone captured at sign-up into the profile if the trigger
  // (which only sets the name) left it empty.
  const metaPhone = (user.user_metadata?.phone as string | undefined) ?? "";
  if (profile && !profile.phone && metaPhone) {
    await supabase.from("profiles").update({ phone: metaPhone }).eq("id", user.id);
  }

  const role: Role = user.user_metadata?.role === "runner" ? "runner" : "buyer";
  const firstName = (profile?.name ?? "there").split(" ")[0];

  const { data: errands } =
    role === "buyer"
      ? await supabase
          .from("tasks")
          .select("id, title, status, price, category, created_at")
          .eq("buyer_id", user.id)
          .order("created_at", { ascending: false })
          .returns<ErrandSummary[]>()
      : { data: null };

  const { data: runnerProfile } =
    role === "runner"
      ? await db
          .from("runner_profile")
          .select("is_available, current_lat, current_lng, active_load, status")
          .eq("user_id", user.id)
          .maybeSingle<RunnerProfileSummary>()
      : { data: null };

  const { data: runnerTasks } =
    role === "runner"
      ? await db
          .from("tasks")
          .select("id, title, status, price, category, pickup_lat, pickup_lng")
          .eq("selected_runner_id", user.id)
          .order("created_at", { ascending: false })
          .returns<RunnerTaskSummary[]>()
      : { data: null };

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="border-b border-cream-deep/70 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <Logo />
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-full border border-cream-deep px-4 py-2 text-sm font-medium text-green-deep transition hover:bg-white"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10">
        <span className="inline-flex items-center gap-2 rounded-full bg-green/10 px-4 py-1.5 text-sm font-medium text-green-deep">
          {role === "runner" ? (
            <Bike className="h-4 w-4" aria-hidden />
          ) : (
            <PackageCheck className="h-4 w-4" aria-hidden />
          )}
          {role === "runner" ? "Runner" : "Customer"}
        </span>

        <h1 className="mt-4 font-display text-fluid-h2 font-semibold text-green-deep">
          Welcome, {firstName} 👋
        </h1>
        <p className="mt-2 max-w-xl text-muted">
          {role === "runner"
            ? "You're all set. Go available to start receiving errand offers near you."
            : "You're all set. Post an errand and a trusted runner will pick it up."}
        </p>

        {role === "buyer" ? (
          <BuyerHome errands={errands ?? []} />
        ) : (
          <RunnerHome profile={runnerProfile ?? null} tasks={runnerTasks ?? []} />
        )}

        <p className="mt-10 text-sm text-muted">
          Signed in as {user.email}
          {profile?.verified ? "" : " · verification pending"}
        </p>
      </main>
    </div>
  );
}

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  posted: { label: "Finding runner", tone: "bg-orange/15 text-orange-deep" },
  matched: { label: "Runner matched", tone: "bg-orange/15 text-orange-deep" },
  accepted: { label: "In progress", tone: "bg-green/10 text-green-deep" },
  in_progress: { label: "In progress", tone: "bg-green/10 text-green-deep" },
  completed: { label: "Delivered", tone: "bg-green text-cream" },
  resolved: { label: "Resolved", tone: "bg-green text-cream" },
  disputed: { label: "In dispute", tone: "bg-orange/15 text-orange-deep" },
  cancelled: { label: "Cancelled", tone: "bg-cream-deep text-muted" },
};

function BuyerHome({ errands }: { errands: ErrandSummary[] }) {
  return (
    <div className="mt-8 space-y-5">
      <Link
        href="/app/post"
        className="flex items-center justify-between rounded-[1.5rem] bg-green p-6 text-left text-cream shadow-sm transition hover:bg-green-deep"
      >
        <span>
          <span className="flex items-center gap-2 font-display text-xl font-semibold">
            <Plus className="h-5 w-5" aria-hidden /> Post an errand
          </span>
          <span className="mt-1 block text-sm text-cream/80">
            Matched to a trusted runner by distance, rating &amp; availability.
          </span>
        </span>
        <ArrowRight className="h-5 w-5" aria-hidden />
      </Link>

      <div className="rounded-[1.5rem] border border-cream-deep bg-white p-6">
        <p className="flex items-center gap-2 font-display text-lg font-semibold text-green-deep">
          <Clock className="h-5 w-5 text-orange-deep" aria-hidden /> Your errands
        </p>

        {errands.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No errands yet. Once you post one, you&apos;ll track it here from
            matched → delivered.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-cream-deep">
            {errands.map((e) => {
              const s = STATUS_LABELS[e.status] ?? {
                label: e.status,
                tone: "bg-cream-deep text-muted",
              };
              return (
                <li key={e.id}>
                  <Link
                    href={`/app/errands/${e.id}`}
                    className="flex items-center justify-between gap-4 py-3.5 transition hover:opacity-80"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">
                        {e.title}
                      </span>
                      <span className="text-sm text-muted">
                        {e.category ?? "Errand"} · GHS {Number(e.price).toFixed(2)}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${s.tone}`}
                    >
                      {s.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function RunnerHome({
  profile,
  tasks,
}: {
  profile: RunnerProfileSummary | null;
  tasks: RunnerTaskSummary[];
}) {
  const offers = tasks.filter((task) => task.status === "matched");
  const active = tasks.filter(
    (task) => task.status === "accepted" || task.status === "in_progress",
  );
  const completed = tasks.filter(
    (task) => task.status === "completed" || task.status === "resolved",
  );

  return (
    <div className="mt-8 space-y-5">
      <div className="rounded-[1.5rem] border border-cream-deep bg-white p-6 shadow-sm">
        <p className="flex items-center gap-2 font-display text-lg font-semibold text-green-deep">
          <CircleCheck className="h-5 w-5 text-orange-deep" aria-hidden /> Availability
        </p>
        <p className="mt-1 text-sm text-muted">
          {profile?.is_available
            ? `Available${
                profile.current_lat != null && profile.current_lng != null
                  ? ` · ${profile.current_lat.toFixed(4)}, ${profile.current_lng.toFixed(4)}`
                  : ""
              }`
            : "Offline"}
        </p>
        <div className="mt-4">
          <AvailabilityToggle
            available={profile?.is_available ?? false}
            lat={profile?.current_lat ?? null}
            lng={profile?.current_lng ?? null}
          />
        </div>
      </div>

      <Section title="Offers" icon={<Clock className="h-5 w-5 text-orange-deep" aria-hidden />}>
        {offers.length === 0 ? (
          <Empty>When a buyer pays, the top-ranked job shows up here.</Empty>
        ) : (
          <div className="space-y-3">
            {offers.map((task) => (
              <TaskCard key={task.id} task={task}>
                <div className="flex gap-2">
                  <form action={acceptOffer.bind(null, task.id)}>
                    <button
                      type="submit"
                      className="rounded-full bg-green px-4 py-2 text-sm font-semibold text-cream transition hover:bg-green-deep"
                    >
                      Accept
                    </button>
                  </form>
                  <form action={declineOffer.bind(null, task.id)}>
                    <button
                      type="submit"
                      className="rounded-full border border-cream-deep px-4 py-2 text-sm font-semibold text-green-deep transition hover:bg-cream/40"
                    >
                      Decline
                    </button>
                  </form>
                </div>
              </TaskCard>
            ))}
          </div>
        )}
      </Section>

      <Section title="Active jobs" icon={<Bike className="h-5 w-5 text-orange-deep" aria-hidden />}>
        {active.length === 0 ? (
          <Empty>No live jobs yet.</Empty>
        ) : (
          <div className="space-y-3">
            {active.map((task) => (
              <TaskCard key={task.id} task={task}>
                <span className="rounded-full bg-green/10 px-3 py-1 text-xs font-medium text-green-deep">
                  {task.status === "accepted" ? "Accepted" : "In progress"}
                </span>
                <div className="mt-3 flex gap-2">
                  {task.status === "accepted" ? (
                    <form action={markPickedUp.bind(null, task.id)}>
                      <button
                        type="submit"
                        className="rounded-full bg-green px-4 py-2 text-sm font-semibold text-cream transition hover:bg-green-deep"
                      >
                        Mark picked up
                      </button>
                    </form>
                  ) : null}
                  <form action={markDelivered.bind(null, task.id)}>
                    <button
                      type="submit"
                      className="rounded-full border border-cream-deep px-4 py-2 text-sm font-semibold text-green-deep transition hover:bg-cream/40"
                    >
                      Mark delivered
                    </button>
                  </form>
                </div>
              </TaskCard>
            ))}
          </div>
        )}
      </Section>

      {completed.length > 0 ? (
        <Section title="Completed" icon={<PackageCheck className="h-5 w-5 text-orange-deep" aria-hidden />}>
          <div className="space-y-3">
            {completed.slice(0, 3).map((task) => (
              <TaskCard key={task.id} task={task}>
                <span className="rounded-full bg-cream-deep px-3 py-1 text-xs font-medium text-muted">
                  Done
                </span>
              </TaskCard>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[1.5rem] border border-cream-deep bg-white p-6 shadow-sm">
      <p className="flex items-center gap-2 font-display text-lg font-semibold text-green-deep">
        {icon}
        {title}
      </p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

function TaskCard({
  task,
  children,
}: {
  task: RunnerTaskSummary;
  children: React.ReactNode;
}) {
  const status = STATUS_LABELS[task.status] ?? {
    label: task.status,
    tone: "bg-cream-deep text-muted",
  };

  return (
    <div className="rounded-[1.25rem] border border-cream-deep/70 bg-cream/40 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{task.title}</p>
          <p className="text-sm text-muted">
            {task.category ?? "Errand"} · GHS {Number(task.price).toFixed(2)}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${status.tone}`}>
          {status.label}
        </span>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}
