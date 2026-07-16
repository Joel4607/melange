import Link from "next/link";
import { PackageCheck, Plus, Users, ArrowRight, Clock, CircleCheck, type LucideIcon } from "lucide-react";
import { acceptOffer, declineOffer, markPickedUp, cancelRunnerErrand } from "./actions";
import { MarkDeliveredForm } from "./mark-delivered-form";

export interface DashboardTask {
  id: string;
  title: string;
  status: string;
  price: string;
  fee?: string;
  category: string | null;
}

export interface DashboardErrand {
  id: string;
  title: string;
  status: string;
  price: string;
  category: string | null;
  created_at: string;
}

export const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  posted: { label: "Finding runner", tone: "bg-orange/15 text-orange-deep" },
  matched: { label: "Runner matched", tone: "bg-orange/15 text-orange-deep" },
  accepted: { label: "In progress", tone: "bg-green/10 text-green-deep" },
  in_progress: { label: "In progress", tone: "bg-green/10 text-green-deep" },
  completed: { label: "Delivered", tone: "bg-green text-cream" },
  resolved: { label: "Resolved", tone: "bg-green text-cream" },
  disputed: { label: "In dispute", tone: "bg-orange/15 text-orange-deep" },
  cancelled: { label: "Cancelled", tone: "bg-cream-deep text-muted" },
};

export function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  tone = "green",
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  tone?: "green" | "orange";
}) {
  const bg = tone === "orange" ? "bg-orange/10" : "bg-green/10";
  const text = tone === "orange" ? "text-orange-deep" : "text-green-deep";
  return (
    <div className="rounded-2xl border border-cream-deep bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted">{title}</p>
        <span className={`grid h-9 w-9 place-items-center rounded-full ${bg} ${text}`}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      </div>
      <p className="mt-3 font-display text-2xl font-semibold text-ink">{value}</p>
      {subtitle ? <p className="mt-1 text-xs text-muted">{subtitle}</p> : null}
    </div>
  );
}

export function QuickActions({ role }: { role: "buyer" | "runner" }) {
  if (role === "runner") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/app/feed"
          className="flex items-center justify-between rounded-2xl bg-green p-5 text-cream shadow-sm transition hover:bg-green-deep"
        >
          <span>
            <span className="flex items-center gap-2 font-display text-lg font-semibold">
              <PackageCheck className="h-5 w-5" aria-hidden /> Open errands
            </span>
            <span className="mt-1 block text-sm text-cream/80">Browse and claim nearby jobs.</span>
          </span>
          <ArrowRight className="h-5 w-5" aria-hidden />
        </Link>
        <Link
          href="/app/settings"
          className="flex items-center justify-between rounded-2xl border border-cream-deep bg-white p-5 text-green-deep shadow-sm transition hover:bg-cream/40"
        >
          <span>
            <span className="flex items-center gap-2 font-display text-lg font-semibold">
              <Clock className="h-5 w-5" aria-hidden /> Set hours
            </span>
            <span className="mt-1 block text-sm text-muted">Update availability & capabilities.</span>
          </span>
          <ArrowRight className="h-5 w-5" aria-hidden />
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Link
        href="/app/runners"
        className="flex items-center justify-between rounded-2xl bg-green p-5 text-cream shadow-sm transition hover:bg-green-deep"
      >
        <span>
          <span className="flex items-center gap-2 font-display text-lg font-semibold">
            <Users className="h-5 w-5" aria-hidden /> Browse runners
          </span>
          <span className="mt-1 block text-sm text-cream/80">Pick a trusted runner first.</span>
        </span>
        <ArrowRight className="h-5 w-5" aria-hidden />
      </Link>
      <Link
        href="/app/post"
        className="flex items-center justify-between rounded-2xl border border-cream-deep bg-white p-5 text-green-deep shadow-sm transition hover:bg-cream/40"
      >
        <span>
          <span className="flex items-center gap-2 font-display text-lg font-semibold">
            <Plus className="h-5 w-5" aria-hidden /> Quick match
          </span>
          <span className="mt-1 block text-sm text-muted">We’ll auto-match a runner for you.</span>
        </span>
        <ArrowRight className="h-5 w-5" aria-hidden />
      </Link>
    </div>
  );
}

export function Section({
  title,
  icon: Icon,
  children,
  action,
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="rounded-2xl border border-cream-deep bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 font-display font-semibold text-green-deep">
          <Icon className="h-5 w-5 text-orange-deep" aria-hidden /> {title}
        </p>
        {action ? (
          <Link href={action.href} className="text-xs font-medium text-green-deep hover:underline">
            {action.label}
          </Link>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

export function BuyerErrandList({ errands }: { errands: DashboardErrand[] }) {
  if (errands.length === 0) {
    return <Empty>No errands yet. Post one and track it from matched to delivered.</Empty>;
  }
  return (
    <ul className="divide-y divide-cream-deep">
      {errands.map((e) => {
        const s = STATUS_LABELS[e.status] ?? { label: e.status, tone: "bg-cream-deep text-muted" };
        return (
          <li key={e.id}>
            <Link
              href={`/app/errands/${e.id}`}
              className="flex items-center justify-between gap-4 py-3.5 transition hover:opacity-80"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{e.title}</span>
                <span className="text-sm text-muted">
                  {e.category ?? "Errand"} · GHS {Number(e.price).toFixed(2)}
                </span>
              </span>
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${s.tone}`}>
                {s.label}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function TaskCard({
  task,
  children,
}: {
  task: DashboardTask;
  children?: React.ReactNode;
}) {
  const status = STATUS_LABELS[task.status] ?? {
    label: task.status,
    tone: "bg-cream-deep text-muted",
  };
  const payout =
    task.fee !== undefined
      ? (Number(task.price) - Number(task.fee)).toFixed(2)
      : Number(task.price).toFixed(2);

  return (
    <div className="rounded-[1.25rem] border border-cream-deep/70 bg-cream/40 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{task.title}</p>
          <p className="text-sm text-muted">
            {task.category ?? "Errand"} · Payout GHS {payout}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${status.tone}`}>
          {status.label}
        </span>
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

export function TaskActions({ taskId, status }: { taskId: string; status: string }) {
  if (status === "matched") {
    return (
      <div className="flex flex-wrap gap-2">
        <form action={acceptOffer.bind(null, taskId)}>
          <button
            type="submit"
            className="rounded-full bg-green px-4 py-2 text-sm font-semibold text-cream transition hover:bg-green-deep"
          >
            Accept
          </button>
        </form>
        <form action={declineOffer.bind(null, taskId)}>
          <button
            type="submit"
            className="rounded-full border border-cream-deep px-4 py-2 text-sm font-semibold text-green-deep transition hover:bg-cream/40"
          >
            Decline
          </button>
        </form>
      </div>
    );
  }

  if (status === "accepted" || status === "in_progress") {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {status === "accepted" ? (
            <form action={markPickedUp.bind(null, taskId)}>
              <button
                type="submit"
                className="rounded-full bg-green px-4 py-2 text-sm font-semibold text-cream transition hover:bg-green-deep"
              >
                Mark picked up
              </button>
            </form>
          ) : null}
          <form action={cancelRunnerErrand.bind(null, taskId)}>
            <button
              type="submit"
              className="rounded-full border border-cream-deep px-4 py-2 text-sm font-semibold text-orange-deep transition hover:bg-orange/10"
            >
              Cancel
            </button>
          </form>
        </div>
        <MarkDeliveredForm taskId={taskId} />
      </div>
    );
  }

  return null;
}

export function RunnerAvailabilityCard({
  available,
  children,
}: {
  available: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-cream-deep bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 font-display font-semibold text-green-deep">
          <CircleCheck className="h-5 w-5 text-orange-deep" aria-hidden /> Availability
        </p>
        <span
          className={`inline-flex h-2.5 w-2.5 rounded-full ${available ? "bg-green" : "bg-cream-deep"}`}
          aria-hidden
        />
      </div>
      <p className="mt-1 text-sm text-muted">
        {available ? "You are available for new errands" : "You are currently offline"}
      </p>
      <div className="mt-4">{children}</div>
    </div>
  );
}
