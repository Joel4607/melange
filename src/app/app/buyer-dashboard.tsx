import { Clock, CheckCircle, Wallet as WalletIcon } from "lucide-react";
import { WalletCard } from "./wallet-card";
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <WalletCard wallet={wallet} name={profile?.name ?? null} className="min-h-[180px] md:col-span-1" />
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

        <div className="space-y-6">
          <VerificationCard verified={profile?.verified ?? false} request={verificationRequest} />
          {profile?.verified ? (
            <div className="rounded-2xl border border-green/30 bg-green/5 p-5">
              <p className="flex items-center gap-2 font-medium text-green-deep">
                <WalletIcon className="h-5 w-5" aria-hidden /> Wallet protected
              </p>
              <p className="mt-1 text-sm text-muted">
                Your identity is verified. Transactions are tied to your profile for dispute resolution.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
