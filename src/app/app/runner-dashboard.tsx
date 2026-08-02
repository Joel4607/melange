import { Bike, Star, Clock, CheckCircle } from "lucide-react";
import { AvailabilityToggle } from "./availability-toggle";
import { LiveLocationUpdater } from "./live-location-updater";
import { VerificationCard } from "./verification-card";
import {
  HeroGreetingBanner,
  VisaStyleWalletCard,
  IncomePaidKpiCard,
  SystemLockDonutCard,
  SlaTimerDotCard,
  ConcentricDomesCard,
  ActivityManagerCard,
  FeedbackRatingCard,
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
  const firstName = (name ?? "there").split(" ")[0];

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* 1. Hero Greeting Banner (Reference Top Bar) */}
      <HeroGreetingBanner
        firstName={firstName}
        role="runner"
        primaryActionLabel="Browse open errands"
        primaryActionHref="/app/feed"
      />

      {/* 2. Top Bento Row (Reference Mid Row) */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Card 1: VISA-style Payout/Wallet Card (4 cols) */}
        <div className="lg:col-span-4">
          <VisaStyleWalletCard wallet={wallet} name={name} />
        </div>

        {/* Card 2: Income & Earnings KPI Card (4 cols) */}
        <div className="lg:col-span-4">
          <IncomePaidKpiCard
            mainTitle="Total Earned"
            mainValue={`GHS ${totalEarned.toFixed(2)}`}
            subTitle="Completed Errands"
            subValue={`${completedCount} Delivered`}
          />
        </div>

        {/* Card 3 & 4: System Lock Donut + Live SLA Matrix & Stock Chart (4 cols) */}
        <div className="grid gap-5 sm:grid-cols-2 lg:col-span-4">
          <SystemLockDonutCard
            lockLabel="Trust Score"
            percentage={profile ? Math.round(profile.trust_score * 100) : 80}
            rateLabel={`${trustStars} / 5.0 Rating`}
          />
          <SlaTimerDotCard
            daysText={`${active.length} Active Load`}
            hoursText={available ? "Online & Ready" : "Offline"}
            chartValue={`GHS ${totalEarned.toFixed(2)}`}
            chartLabel="Payout Growth"
            chartGrowth="+ 18.2%"
          />
        </div>
      </div>

      {/* 3. Bottom Bento Row (Reference Bottom Row) */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Left Column: Concentric semi-circle earnings breakdown (4 cols) */}
        <div className="lg:col-span-4">
          <ConcentricDomesCard
            title="Earnings breakdown"
            data={[
              { label: "Deliveries 50%", color: "#FDE8E3" },
              { label: "Tips 25%", color: "#F9C3B7" },
              { label: "Bonuses 15%", color: "#F49B86" },
              { label: "Fees 10%", color: "#E05638" },
            ]}
          />
        </div>

        {/* Middle Column: Activity Manager with Offers & Active Jobs (5 cols) */}
        <div className="lg:col-span-5">
          <ActivityManagerCard verified={profile?.verified ?? false}>
            <div className="space-y-6">
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
          </ActivityManagerCard>
        </div>

        {/* Right Column: Runner Controls, Capabilities & Feedback (3 cols) */}
        <div className="space-y-5 lg:col-span-3">
          {/* Availability Card */}
          <div className="rounded-[28px] border border-black/[0.06] bg-white p-6 shadow-sm">
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
              <div className="mt-4 border-t border-neutral-100 pt-4">
                <div className="flex items-center gap-2 mb-1">
                  <Star className="h-4 w-4 text-[#E05638]" aria-hidden />
                  <p className="font-display text-sm font-semibold text-ink">Average rating</p>
                </div>
                <p className="font-display text-2xl font-bold text-ink">
                  {avgRating.toFixed(1)} <span className="text-sm font-normal text-muted">/ 5.0</span>
                </p>
              </div>
            ) : null}

            {profile?.capabilities && profile.capabilities.length > 0 ? (
              <div className="mt-4 border-t border-neutral-100 pt-4">
                <p className="font-display text-sm font-semibold text-ink">Capabilities</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {profile.capabilities.map((cap) => (
                    <span
                      key={cap}
                      className="rounded-full bg-[#E05638]/10 px-2.5 py-1 text-xs font-semibold text-[#E05638]"
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* Verification Card */}
          <div className="rounded-[28px] border border-black/[0.06] bg-white p-6 shadow-sm">
            <VerificationCard
              verified={profile?.verified ?? false}
              request={verificationRequest}
            />
          </div>

          {/* Satisfaction Feedback */}
          <FeedbackRatingCard
            title="How is your runner experience going?"
            ratingLabel="Runner feedback"
          />
        </div>
      </div>
    </div>
  );
}
