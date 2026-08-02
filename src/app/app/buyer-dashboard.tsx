import { Clock, CheckCircle, Wallet as WalletIcon } from "lucide-react";
import { WalletCreditCard } from "./wallet-credit-card";
import { VerificationCard } from "./verification-card";
import { StatCard, QuickActions, Section, BuyerErrandList, type DashboardErrand } from "./dashboard-widgets";

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
  const active = errands.filter((e) =>
    ["posted", "matched", "accepted", "in_progress", "disputed"].includes(e.status),
  ).length;
  const completed = errands.filter((e) =>
    ["completed", "resolved"].includes(e.status),
  ).length;

  return (
    <div className="space-y-8">
      {/* Quick actions */}
      <QuickActions role="buyer" />

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title="Active errands"
          value={active}
          subtitle={active === 0 ? "Nothing running right now" : `${active} in progress`}
          icon={Clock}
          tone="orange"
        />
        <StatCard
          title="Completed"
          value={completed}
          subtitle="All-time delivered errands"
          icon={CheckCircle}
          tone="green"
        />
        <StatCard
          title="Wallet balance"
          value={wallet ? `GHS ${Number(wallet.balance).toFixed(2)}` : "GHS 0.00"}
          subtitle={wallet ? `GHS ${Number(wallet.held).toFixed(2)} in escrow` : "No funds yet"}
          icon={WalletIcon}
          tone="green"
        />
      </div>

      {/* Main content + sidebar */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Errand list — takes up 2/3 */}
        <div className="space-y-8 lg:col-span-2">
          <div className="rounded-[2rem] border border-cream-deep bg-white p-6 shadow-sm">
            <Section
              title="Your errands"
              icon={Clock}
              action={{ href: "/app/post", label: "Post new" }}
            >
              <BuyerErrandList errands={errands} />
            </Section>
          </div>
        </div>

        {/* Sidebar — wallet + verification */}
        <div className="space-y-6 lg:col-span-1">
          <WalletCreditCard wallet={wallet} name={profile?.name} />
          <div className="rounded-[2rem] border border-cream-deep bg-white p-6 shadow-sm">
            <VerificationCard
              verified={profile?.verified ?? false}
              request={verificationRequest}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
