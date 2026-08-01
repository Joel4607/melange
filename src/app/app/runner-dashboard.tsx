import { Bike, Star, Wallet as WalletIcon, Clock, CheckCircle } from "lucide-react";
import { WalletCreditCard } from "./wallet-credit-card";
import { AvailabilityToggle } from "./availability-toggle";
import { LiveLocationUpdater } from "./live-location-updater";
import {
  KpiCard,
  QuickActions,
  Section,
  Empty,
  TaskCard,
  TaskActions,
  RunnerAvailabilityCard,
  type DashboardTask,
} from "./dashboard-widgets";

interface RunnerDashboardProps {
  profile: {
    is_available: boolean;
    available_manual: boolean | null;
    scheduled_hours: { day: number; start: string; end: string }[] | null;
    current_lat: number | null;
    current_lng: number | null;
    trust_score: number;
    verified: boolean;
    capabilities: string[] | null;
  } | null;
  tasks: DashboardTask[];
  avgRating: number;
  totalEarned: number;
  completedCount: number;
  verificationRequest: { id: string; status: "pending" | "approved" | "rejected"; created_at: string } | null;
  name: string | null;
  wallet: { balance: string; held: string } | null;
}

export function RunnerDashboard({
  profile,
  tasks,
  avgRating,
  totalEarned,
  completedCount,
  verificationRequest,
  name,
  wallet,
}: RunnerDashboardProps) {
  const available = profile?.is_available ?? false;
  const offers = tasks.filter((t) => t.status === "matched");
  const active = tasks.filter((t) => t.status === "accepted" || t.status === "in_progress");
  const completed = tasks.filter((t) => t.status === "completed" || t.status === "resolved");

  const trustStars = profile ? (profile.trust_score * 5).toFixed(1) : "0.0";

  return (
    <div className="space-y-10">
      <div className="grid gap-10 lg:grid-cols-3">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 lg:col-span-2">
          <KpiCard
            title="Total earned"
            value={`GHS ${totalEarned.toFixed(2)}`}
            subtitle={`${completedCount} completed errands`}
            icon={WalletIcon}
            tone="green"
          />
          <KpiCard title="Trust score" value={`${trustStars} / 5`} icon={Star} tone="orange" />
          <KpiCard
            title="Active load"
            value={active.length}
            subtitle={available ? "Available for more" : "Go available to receive offers"}
            icon={Bike}
            tone="green"
          />
        </div>
        <div className="lg:col-span-1">
          <WalletCreditCard wallet={wallet} name={name ?? null} />
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-3">
        <div className="space-y-10 lg:col-span-2">
          <QuickActions role="runner" />

          <Section title="Offers" icon={Clock}>
            {offers.length === 0 ? (
              <Empty icon={CheckCircle} action={{ href: "/app/feed", label: "Browse errands" }}>
                When a buyer pays, the top-ranked job shows up here.
              </Empty>
            ) : (
              <div className="space-y-3">
                {offers.map((task) => (
                  <TaskCard key={task.id} task={task}>
                    <TaskActions taskId={task.id} status={task.status} />
                  </TaskCard>
                ))}
              </div>
            )}
          </Section>

          <Section title="Active jobs" icon={Bike}>
            {active.length === 0 ? (
              <Empty icon={CheckCircle} action={{ href: "/app/feed", label: "Find jobs" }}>
                No live jobs yet.
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

          {completed.length > 0 ? (
            <Section title="Completed" icon={CheckCircle}>
              <div className="space-y-3">
                {completed.slice(0, 5).map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
              </div>
            </Section>
          ) : null}
        </div>

        <div className="space-y-10 lg:col-span-1">
          <RunnerAvailabilityCard available={available}>
            <AvailabilityToggle
              availableManual={profile?.available_manual ?? null}
              scheduledHours={profile?.scheduled_hours ?? null}
              lat={profile?.current_lat ?? null}
              lng={profile?.current_lng ?? null}
              verified={profile?.verified ?? false}
            />
            <LiveLocationUpdater enabled={available || active.length > 0} />
          </RunnerAvailabilityCard>

          {avgRating > 0 ? (
            <div className="py-2">
              <div className="flex items-center gap-2 mb-2">
                <Star className="h-4 w-4 text-orange-deep" aria-hidden />
                <p className="font-display text-lg font-semibold text-ink">Average rating</p>
              </div>
              <p className="font-display text-3xl font-semibold text-ink">
                {avgRating.toFixed(1)} <span className="text-xl text-muted">/ 5</span>
              </p>
            </div>
          ) : null}

          {profile?.capabilities && profile.capabilities.length > 0 ? (
            <div className="py-2">
              <p className="font-display text-lg font-semibold text-ink">Capabilities</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {profile.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="rounded-full bg-green/10 px-2.5 py-1 text-xs font-medium text-green-deep"
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
