import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Navigation,
  PlusCircle,
  Wallet as WalletIcon,
  type LucideIcon,
} from "lucide-react";
import { WalletCreditCard } from "./wallet-credit-card";
import {
  BuyerErrandList,
  NextActionCard,
  Section,
  StatCard,
  type DashboardErrand,
  type DashboardFocus,
} from "./dashboard-widgets";

export function BuyerDashboard({
  errands,
  wallet,
  name,
}: {
  errands: DashboardErrand[];
  wallet: { balance: string; held: string } | null;
  name: string | null;
}) {
  const activeErrands = errands.filter((e) =>
    ["posted", "matched", "accepted", "in_progress", "disputed"].includes(e.status),
  );
  const active = activeErrands.length;
  const completed = errands.filter((e) =>
    ["completed", "resolved"].includes(e.status),
  ).length;
  const focusErrand =
    activeErrands.find((errand) => errand.status === "disputed") ?? activeErrands[0];
  const focus = buyerFocus(focusErrand);
  const FocusIcon: LucideIcon =
    focusErrand?.status === "disputed"
      ? AlertTriangle
      : focusErrand
        ? Navigation
        : PlusCircle;

  return (
    <div className="space-y-5 sm:space-y-8">
      <NextActionCard {...focus} icon={FocusIcon} />

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
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
      <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
        {/* Errand list — takes up 2/3 */}
        <div className="space-y-8 lg:col-span-2">
          <div className="rounded-3xl border border-cream-deep bg-white p-4 shadow-sm sm:p-6">
            <Section
              title="Your errands"
              icon={Clock}
              action={{ href: "/app/post", label: "Post new" }}
            >
              <BuyerErrandList errands={errands} />
            </Section>
          </div>
        </div>

        {/* Sidebar — wallet only */}
        <div className="hidden space-y-6 lg:col-span-1 lg:block">
          <WalletCreditCard wallet={wallet} name={name} />
        </div>
      </div>
    </div>
  );
}

function buyerFocus(errand: DashboardErrand | undefined): DashboardFocus {
  if (!errand) {
    return {
      eyebrow: "Start here",
      title: "What can we take off your list?",
      description: "Post an errand in a few steps and follow it here from match to delivery.",
      primary: { href: "/app/post", label: "Post an errand" },
      secondary: { href: "/app/runners", label: "Browse runners" },
    };
  }

  const primary = { href: `/app/errands/${errand.id}`, label: "View errand" };
  const description = `${errand.title} · ${errand.category ?? "Errand"}`;

  switch (errand.status) {
    case "posted":
      return {
        eyebrow: "Errand posted",
        title: "We’re finding your runner",
        description: `${description}. We’ll let you know as soon as someone is matched.`,
        primary,
      };
    case "matched":
      return {
        eyebrow: "Runner matched",
        title: "Your runner is ready",
        description: `${description}. Open the errand to review the latest update.`,
        primary,
      };
    case "accepted":
      return {
        eyebrow: "Up next",
        title: "Your errand is ready to start",
        description: `${description}. Your runner has accepted and is preparing for pickup.`,
        primary,
      };
    case "disputed":
      return {
        eyebrow: "Needs attention",
        title: "This errand needs your attention",
        description: `${description}. Review the dispute and the latest activity.`,
        primary: { ...primary, label: "Review errand" },
        tone: "orange",
      };
    default:
      return {
        eyebrow: "In progress",
        title: "Your errand is on the move",
        description: `${description}. Open it to follow progress and contact your runner.`,
        primary: { ...primary, label: "Track errand" },
      };
  }
}
