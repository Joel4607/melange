import { Bike, Star, Wallet as WalletIcon, Clock, CheckCircle, PackageCheck } from "lucide-react";
import { WalletCard } from "./wallet-card";
import { VerificationCard } from "./verification-card";
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
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <WalletCard wallet={wallet} name={name ?? null} className="min-h-[180px] md:col-span-2 lg:col-span-1" />
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

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <QuickActions role="runner" />

          <Section title="Offers" icon={Clock}>
            {offers.length === 0 ? (
              <Empty icon={PackageCheck} action={{ href: "/app/feed", label: "Browse errands" }}>
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
              <Empty icon={PackageCheck} action={{ href: "/app/feed", label: "Find jobs" }}>
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

        <div className="space-y-6">
          <RunnerAvailabilityCard available={available}>
            <AvailabilityToggle
              availableManual={profile?.available_manual ?? null}
              scheduledHours={profile?.scheduled_hours ?? null}
              lat={profile?.current_lat ?? null}
              lng={profile?.current_lng ?? null}
              verified={profile?.verified ?? false}
            />
            <LiveLocationUpdater available={available} />
          </RunnerAvailabilityCard>

          <VerificationCard
            verified={profile?.verified ?? false}
            request={verificationRequest ?? null}
          />

          {avgRating > 0 ? (
            <div className="rounded-2xl border border-cream-deep bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Star className="h-5 w-5 text-orange-deep" aria-hidden />
                <p className="font-display font-semibold text-green-deep">Average rating</p>
              </div>
              <p className="mt-2 font-display text-2xl font-semibold text-ink">
                {avgRating.toFixed(1)} / 5
              </p>
            </div>
          ) : null}

          {profile?.capabilities && profile.capabilities.length > 0 ? (
            <div className="rounded-2xl border border-cream-deep bg-white p-5 shadow-sm">
              <p className="font-display font-semibold text-green-deep">Capabilities</p>
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
