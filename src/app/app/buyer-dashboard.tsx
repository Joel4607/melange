import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle,
  Clock,
  Navigation,
  Plus,
  PlusCircle,
  Wallet as WalletIcon,
  type LucideIcon,
} from "lucide-react";
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
}: {
  errands: DashboardErrand[];
  wallet: { balance: string; held: string } | null;
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

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4">
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
        <WalletBalanceCard wallet={wallet} />
      </div>

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
  );
}

function WalletBalanceCard({
  wallet,
}: {
  wallet: { balance: string; held: string } | null;
}) {
  const balance = Number(wallet?.balance ?? 0).toFixed(2);
  const held = Number(wallet?.held ?? 0).toFixed(2);

  return (
    <section
      aria-label="Wallet balance"
      className="col-span-2 min-w-0 rounded-2xl border border-cream-deep bg-white p-4 shadow-sm sm:col-span-1 sm:rounded-3xl sm:p-5"
    >
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-green/10 text-green-deep">
          <WalletIcon className="h-4 w-4" aria-hidden />
        </span>
        <p className="text-sm font-medium text-ink">Wallet balance</p>
      </div>
      <p className="mt-3 font-display text-2xl font-semibold leading-tight tracking-tight text-ink sm:text-3xl">
        GHS {balance}
      </p>
      <p className="mt-1 text-xs text-muted">GHS {held} in escrow</p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link
          href="/app/wallet"
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-green px-3 py-2.5 text-sm font-semibold text-cream transition hover:bg-green-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Top up
        </Link>
        <Link
          href="/app/wallet"
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-cream-deep bg-cream/30 px-3 py-2.5 text-sm font-semibold text-green-deep transition hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green"
        >
          Wallet
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
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
