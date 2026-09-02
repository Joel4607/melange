import Link from "next/link";
import {
  Bike,
  CheckCircle,
  Navigation,
  Star,
  Wallet as WalletIcon,
} from "lucide-react";
import { LiveLocationUpdater } from "./live-location-updater";
import {
  Empty,
  NextActionCard,
  Section,
  StatCard,
  TaskCard,
  TaskActions,
  type DashboardFocus,
  type DashboardTask,
} from "./dashboard-widgets";

interface RunnerDashboardProps {
  profile: {
    is_available: boolean;
    trust_score: number;
    capabilities: string[] | null;
  } | null;
  tasks: DashboardTask[];
  avgRating: number;
  totalEarned: number;
  completedCount: number;
}

export function RunnerDashboard({
  profile,
  tasks,
  avgRating,
  totalEarned,
  completedCount,
}: RunnerDashboardProps) {
  const available = profile?.is_available ?? false;
  const offers    = tasks.filter((t) => t.status === "matched");
  const active    = tasks.filter((t) => t.status === "accepted" || t.status === "in_progress");
  const completed = tasks.filter((t) => t.status === "completed" || t.status === "resolved");
  const focusTask = offers[0] ?? active[0];
  const focus = runnerFocus(focusTask, available, profile !== null);

  const trustStars = profile ? (profile.trust_score * 5).toFixed(1) : "—";

  return (
    <div className="space-y-5 sm:space-y-8">
      <div className="space-y-3">
        <div className="flex min-h-14 items-center justify-between gap-4 rounded-2xl border border-cream-deep bg-white px-4 py-3 shadow-sm">
          <span className="flex min-w-0 items-center gap-3">
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${available ? "bg-green" : "bg-cream-deep ring-1 ring-muted/20"}`}
              aria-hidden
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">
                {available ? "You’re available" : "You’re unavailable"}
              </span>
              <span className="block truncate text-xs text-muted">
                {available ? "Receiving nearby offers" : "Go available when you’re ready to work"}
              </span>
            </span>
          </span>
          <Link
            href="/app/settings"
            className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-green-deep transition hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green"
          >
            Manage
          </Link>
        </div>
        <NextActionCard
          {...focus}
          icon={focusTask?.status === "in_progress" ? Navigation : Bike}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <StatCard
          title="Total earned"
          value={`GHS ${totalEarned.toFixed(2)}`}
          subtitle={`${completedCount} completed errands`}
          icon={WalletIcon}
          tone="green"
        />
        <StatCard
          title="Trust score"
          value={`${trustStars} / 5`}
          subtitle={avgRating > 0 ? `${avgRating.toFixed(1)} avg buyer rating` : "No ratings yet"}
          icon={Star}
          tone="orange"
        />
        <StatCard
          title="Active load"
          value={active.length}
          subtitle={available ? "Available for more jobs" : "Go available to get offers"}
          icon={Bike}
          tone={active.length > 0 ? "orange" : "green"}
        />
      </div>

      {/* Main content + sidebar */}
      <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">

        {/* Job lists — 2/3 */}
        <div className="space-y-6 lg:col-span-2">

          {/* Pending offers */}
          {offers.length > 0 ? (
            <div className="rounded-3xl border border-orange/20 bg-orange/5 p-4 shadow-sm sm:p-6">
              <Section title="New offers" icon={Bike}>
                <div className="space-y-3">
                  {offers.map((task) => (
                    <TaskCard key={task.id} task={task}>
                      <TaskActions taskId={task.id} status={task.status} />
                    </TaskCard>
                  ))}
                </div>
              </Section>
            </div>
          ) : null}

          {/* Active jobs */}
          <div className="rounded-3xl border border-cream-deep bg-white p-4 shadow-sm sm:p-6">
            <Section title="Active jobs" icon={Bike}>
              {active.length === 0 ? (
                <Empty
                  icon={CheckCircle}
                  action={
                    available
                      ? { href: "/app/feed", label: "Browse errands" }
                      : { href: "/app/settings", label: "Set availability" }
                  }
                >
                  {available
                    ? "No active jobs — offers will appear here when matched."
                    : "Go available first to start receiving offers."}
                </Empty>
              ) : (
                <div className="space-y-3">
                  {active.map((task) => (
                    <TaskCard key={task.id} task={task}>
                      <TaskActions taskId={task.id} status={task.status} />
                    </TaskCard>
                  ))}
                </div>
              )}
            </Section>
          </div>

          {/* Completed (last 5) */}
          {completed.length > 0 ? (
            <div className="rounded-3xl border border-cream-deep bg-white p-4 shadow-sm sm:p-6">
              <Section title="Completed" icon={CheckCircle}>
                <div className="space-y-3">
                  {completed.slice(0, 5).map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </div>
              </Section>
            </div>
          ) : null}
        </div>

        {/* Sidebar — 1/3 */}
        <div className="space-y-6 lg:col-span-1">

          {/* Live location tracking */}
          <LiveLocationUpdater enabled={available || active.length > 0} />

          {/* Capabilities */}
          {profile?.capabilities && profile.capabilities.length > 0 ? (
            <div className="hidden rounded-3xl border border-cream-deep bg-white p-6 shadow-sm lg:block">
              <p className="font-display text-base font-semibold text-ink">Capabilities</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {profile.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="rounded-full bg-green/10 px-3 py-1 text-xs font-medium text-green-deep"
                  >
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function runnerFocus(
  task: DashboardTask | undefined,
  available: boolean,
  hasProfile: boolean,
): DashboardFocus {
  if (task?.status === "matched") {
    const payout = Math.max(0, Number(task.price) - Number(task.fee ?? 0)).toFixed(2);
    return {
      eyebrow: "New offer",
      title: task.title,
      description: `${task.category ?? "Errand"} · Payout GHS ${payout}. Review the details before accepting.`,
      primary: { href: `/app/errands/${task.id}`, label: "Review offer" },
      tone: "orange",
    };
  }

  if (task) {
    return {
      eyebrow: task.status === "accepted" ? "Pickup is next" : "Active errand",
      title: task.status === "accepted" ? "Get ready for pickup" : "Keep this errand moving",
      description: `${task.title} · ${task.category ?? "Errand"}. Open the job for the next delivery step.`,
      primary: { href: `/app/errands/${task.id}`, label: "Open active job" },
    };
  }

  if (!hasProfile) {
    return {
      eyebrow: "Finish setup",
      title: "Complete your runner profile",
      description: "Add your availability and capabilities before taking your first errand.",
      primary: { href: "/app/settings", label: "Complete setup" },
    };
  }

  if (available) {
    return {
      eyebrow: "You’re ready",
      title: "Find your next errand",
      description: "There’s nothing active right now. Browse nearby work while matching continues.",
      primary: { href: "/app/feed", label: "Browse open errands" },
      secondary: { href: "/app/settings", label: "Manage availability" },
    };
  }

  return {
    eyebrow: "Start here",
    title: "Ready to start earning?",
    description: "Set your availability and capabilities so buyers can match with you.",
    primary: { href: "/app/settings", label: "Set availability" },
    secondary: { href: "/app/feed", label: "Browse open errands" },
  };
}
