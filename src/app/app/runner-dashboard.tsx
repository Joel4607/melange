import { Bike, Star, Wallet as WalletIcon, CheckCircle } from "lucide-react";
import { WalletCreditCard } from "./wallet-credit-card";
import { LiveLocationUpdater } from "./live-location-updater";
import {
  StatCard,
  QuickActions,
  Section,
  Empty,
  TaskCard,
  TaskActions,
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
  name: string | null;
  wallet: { balance: string; held: string } | null;
}

export function RunnerDashboard({
  profile,
  tasks,
  avgRating,
  totalEarned,
  completedCount,
  name,
  wallet,
}: RunnerDashboardProps) {
  const available = profile?.is_available ?? false;
  const offers    = tasks.filter((t) => t.status === "matched");
  const active    = tasks.filter((t) => t.status === "accepted" || t.status === "in_progress");
  const completed = tasks.filter((t) => t.status === "completed" || t.status === "resolved");

  const trustStars = profile ? (profile.trust_score * 5).toFixed(1) : "—";

  return (
    <div className="space-y-8">
      {/* Quick actions */}
      <QuickActions role="runner" />

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-3">
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
      <div className="grid gap-8 lg:grid-cols-3">

        {/* Job lists — 2/3 */}
        <div className="space-y-6 lg:col-span-2">

          {/* Pending offers */}
          {offers.length > 0 ? (
            <div className="rounded-[2rem] border border-orange/20 bg-orange/5 p-6 shadow-sm">
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
          <div className="rounded-[2rem] border border-cream-deep bg-white p-6 shadow-sm">
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
            <div className="rounded-[2rem] border border-cream-deep bg-white p-6 shadow-sm">
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

          {/* Wallet */}
          <WalletCreditCard wallet={wallet} name={name} />

          {/* Capabilities */}
          {profile?.capabilities && profile.capabilities.length > 0 ? (
            <div className="rounded-[2rem] border border-cream-deep bg-white p-6 shadow-sm">
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
