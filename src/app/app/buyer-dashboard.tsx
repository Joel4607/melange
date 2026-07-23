import { Clock, CheckCircle } from "lucide-react";
import { WalletCreditCard } from "./wallet-credit-card";
import { VerificationCard } from "./verification-card";
import {
  KpiCard,
  QuickActions,
  Section,
  BuyerErrandList,
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
  const active = errands.filter((e) =>
    ["posted", "matched", "accepted", "in_progress", "disputed"].includes(e.status),
  ).length;
  const completed = errands.filter((e) => ["completed", "resolved"].includes(e.status)).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <KpiCard title="Active errands" value={active} icon={Clock} tone="orange" />
        <KpiCard title="Completed" value={completed} icon={CheckCircle} tone="green" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <QuickActions role="buyer" />
          <Section title="Your errands" icon={Clock} action={{ href: "/app/post", label: "Post new" }}>
            <BuyerErrandList errands={errands} />
          </Section>
        </div>

        <div className="space-y-6 lg:col-span-1">
          <WalletCreditCard wallet={wallet} name={profile?.name ?? null} />
          <VerificationCard
            verified={profile?.verified ?? false}
            request={verificationRequest}
          />
        </div>
      </div>
    </div>
  );
}
