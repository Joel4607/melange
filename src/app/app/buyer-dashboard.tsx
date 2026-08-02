import { Clock } from "lucide-react";
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
  BuyerErrandList,
  Section,
  type DashboardErrand,
} from "./dashboard-widgets";

export function BuyerDashboard({
  errands,
  wallet,
  profile,
  verificationRequest,
}: {
  errands: DashboardErrand[];
  wallet: { balance: string; held: string } | null;
  profile: { name: string | null; verified: boolean } | null;
  verificationRequest: { id: string; status: "pending" | "approved" | "rejected"; created_at: string } | null;
}) {
  const activeCount = errands.filter((e) =>
    ["posted", "matched", "accepted", "in_progress", "disputed"].includes(e.status),
  ).length;
  const completedCount = errands.filter((e) => ["completed", "resolved"].includes(e.status)).length;
  const firstName = (profile?.name ?? "there").split(" ")[0];

  const totalSpentCalculated = errands
    .filter((e) => ["completed", "resolved"].includes(e.status))
    .reduce((sum, e) => sum + Number(e.price ?? 0), 0);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* 1. Hero Greeting Banner (Reference Top Bar) */}
      <HeroGreetingBanner
        firstName={firstName}
        role="buyer"
        primaryActionLabel="Post new errand"
        primaryActionHref="/app/post"
      />

      {/* 2. Top Bento Row (Reference Mid Row) */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Card 1: VISA-style Wallet Card (4 cols) */}
        <div className="lg:col-span-4">
          <VisaStyleWalletCard wallet={wallet} name={profile?.name} />
        </div>

        {/* Card 2: Income & Paid Stat KPI Card (4 cols) */}
        <div className="lg:col-span-4">
          <IncomePaidKpiCard
            mainTitle="Total Spent"
            mainValue={`GHS ${totalSpentCalculated.toFixed(2)}`}
            subTitle="Active & Escrow"
            subValue={`GHS ${wallet ? Number(wallet.held).toFixed(2) : "0.00"}`}
          />
        </div>

        {/* Card 3 & 4: Donut Ring + SLA Matrix & Wavy Stock Trend Card (4 cols) */}
        <div className="grid gap-5 sm:grid-cols-2 lg:col-span-4">
          <SystemLockDonutCard
            lockLabel="Buyer Protection"
            percentage={94}
            rateLabel="Match Rate"
          />
          <SlaTimerDotCard
            daysText={`${activeCount} Active`}
            hoursText={`${completedCount} completed errands`}
            chartValue={`GHS ${wallet ? Number(wallet.balance).toFixed(2) : "0.00"}`}
            chartLabel="Wallet Trend"
            chartGrowth="+ 12.4%"
          />
        </div>
      </div>

      {/* 3. Bottom Bento Row (Reference Bottom Row) */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Left Column: Concentric semi-circle category breakdown (4 cols) */}
        <div className="lg:col-span-4">
          <ConcentricDomesCard
            title="Errand breakdown"
            data={[
              { label: "Food 40%", color: "#FDE8E3" },
              { label: "Grocery 30%", color: "#F9C3B7" },
              { label: "Parcel 20%", color: "#F49B86" },
              { label: "Other 10%", color: "#E05638" },
            ]}
          />
        </div>

        {/* Middle Column: Activity Manager with Errand List (5 cols) */}
        <div className="lg:col-span-5">
          <ActivityManagerCard verified={profile?.verified ?? false}>
            <Section title="Your errands" icon={Clock} action={{ href: "/app/post", label: "Post new" }}>
              <BuyerErrandList errands={errands} />
            </Section>
          </ActivityManagerCard>
        </div>

        {/* Right Column: Verification & Satisfaction Feedback (3 cols) */}
        <div className="space-y-5 lg:col-span-3">
          <div className="rounded-[28px] border border-black/[0.06] bg-white p-6 shadow-sm">
            <VerificationCard
              verified={profile?.verified ?? false}
              request={verificationRequest}
            />
          </div>

          <FeedbackRatingCard
            title="How is your errand experience going?"
            ratingLabel="Buyer feedback"
          />
        </div>
      </div>
    </div>
  );
}
