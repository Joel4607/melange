import Link from "next/link";
import {
  PackageCheck,
  Plus,
  Users,
  ArrowRight,
  Clock,
  CircleCheck,
  type LucideIcon,
} from "lucide-react";
import { acceptOffer, declineOffer, markPickedUp, cancelRunnerErrand } from "./actions";
import { MarkDeliveredForm } from "./mark-delivered-form";

/* ------------------------------------------------------------------ */
/* Shared types                                                         */
/* ------------------------------------------------------------------ */

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
  posted:      { label: "Finding runner",  tone: "bg-orange/10 text-orange-deep" },
  matched:     { label: "Runner matched",  tone: "bg-orange/10 text-orange-deep" },
  accepted:    { label: "In progress",     tone: "bg-green/10 text-green-deep" },
  in_progress: { label: "In progress",     tone: "bg-green/10 text-green-deep" },
  completed:   { label: "Delivered",       tone: "bg-green text-cream" },
  resolved:    { label: "Resolved",        tone: "bg-green text-cream" },
  disputed:    { label: "In dispute",      tone: "bg-orange/10 text-orange-deep" },
  cancelled:   { label: "Cancelled",       tone: "bg-cream-deep text-muted" },
};

/* ------------------------------------------------------------------ */
/* Stat card — single metric with icon                                  */
/* ------------------------------------------------------------------ */

export function StatCard({
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
  const iconBg   = tone === "orange" ? "bg-orange/10 text-orange-deep" : "bg-green/10 text-green-deep";
  return (
    <div className="rounded-[2rem] border border-cream-deep bg-white p-6 shadow-sm">
      <span className={`grid h-10 w-10 place-items-center rounded-2xl ${iconBg}`}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <p className="mt-4 font-display text-3xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-sm font-medium text-ink">{title}</p>
      {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Quick action pair                                                    */
/* ------------------------------------------------------------------ */

export function QuickActions({ role }: { role: "buyer" | "runner" }) {
  const primary =
    role === "runner"
      ? { href: "/app/feed",    label: "Browse open errands", sub: "See jobs near you" }
      : { href: "/app/runners", label: "Browse runners",      sub: "Pick a trusted runner first" };

  const secondary =
    role === "runner"
      ? { href: "/app/settings", label: "Set availability",  sub: "Update hours & capabilities" }
      : { href: "/app/post",     label: "Post an errand",    sub: "Auto-match to a runner" };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Link
        href={primary.href}
        className="flex items-center justify-between rounded-2xl bg-green p-5 text-cream shadow-sm transition hover:bg-green-deep"
      >
        <span>
          <span className="block font-display text-base font-semibold">{primary.label}</span>
          <span className="mt-0.5 block text-sm text-cream/75">{primary.sub}</span>
        </span>
        <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />
      </Link>

      <Link
        href={secondary.href}
        className="flex items-center justify-between rounded-2xl border border-cream-deep bg-white p-5 text-green-deep shadow-sm transition hover:bg-cream/60"
      >
        <span>
          <span className="block font-display text-base font-semibold">{secondary.label}</span>
          <span className="mt-0.5 block text-sm text-muted">{secondary.sub}</span>
        </span>
        <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />
      </Link>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section wrapper — titled list block                                  */
/* ------------------------------------------------------------------ */

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
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
          <Icon className="h-5 w-5 text-green-soft" aria-hidden /> {title}
        </h2>
        {action ? (
          <Link href={action.href} className="text-sm font-medium text-green-deep hover:underline">
            {action.label}
          </Link>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state                                                          */
/* ------------------------------------------------------------------ */

export function Empty({
  children,
  icon: Icon,
  action,
}: {
  children: React.ReactNode;
  icon?: LucideIcon;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-cream-deep py-10 text-center">
      {Icon ? <Icon className="h-8 w-8 text-cream-deep" aria-hidden /> : null}
      <p className={`text-sm text-muted ${Icon ? "mt-3" : ""}`}>{children}</p>
      {action ? (
        <Link
          href={action.href}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-green px-5 py-2 text-sm font-semibold text-cream transition hover:bg-green-deep"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Status pill                                                          */
/* ------------------------------------------------------------------ */

function StatusPill({ status }: { status: string }) {
  const s = STATUS_LABELS[status] ?? { label: status, tone: "bg-cream-deep text-muted" };
  return (
    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${s.tone}`}>
      {s.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Buyer errand list                                                    */
/* ------------------------------------------------------------------ */

export function BuyerErrandList({ errands }: { errands: DashboardErrand[] }) {
  if (errands.length === 0) {
    return (
      <Empty icon={PackageCheck} action={{ href: "/app/post", label: "Post an errand" }}>
        No errands yet — post one and track it from match to delivery.
      </Empty>
    );
  }
  return (
    <ul className="divide-y divide-cream-deep">
      {errands.map((e) => (
        <li key={e.id}>
          <Link
            href={`/app/errands/${e.id}`}
            className="group flex items-center justify-between gap-4 py-3.5 transition-opacity hover:opacity-70"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium text-ink group-hover:underline">
                {e.title}
              </span>
              <span className="text-xs text-muted">
                {e.category ?? "Errand"} · GHS {Number(e.price).toFixed(2)}
              </span>
            </span>
            <StatusPill status={e.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Runner task card + actions                                           */
/* ------------------------------------------------------------------ */

export function TaskCard({
  task,
  children,
}: {
  task: DashboardTask;
  children?: React.ReactNode;
}) {
  const payout =
    task.fee !== undefined
      ? (Number(task.price) - Number(task.fee)).toFixed(2)
      : Number(task.price).toFixed(2);

  return (
    <div className="rounded-2xl border border-cream-deep bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{task.title}</p>
          <p className="text-xs text-muted">{task.category ?? "Errand"} · Payout GHS {payout}</p>
        </div>
        <StatusPill status={task.status} />
      </div>
      {children ? <div className="mt-3 border-t border-cream-deep pt-3">{children}</div> : null}
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
            className="rounded-full bg-green px-4 py-1.5 text-sm font-semibold text-cream transition hover:bg-green-deep"
          >
            Accept
          </button>
        </form>
        <form action={declineOffer.bind(null, taskId)}>
          <button
            type="submit"
            className="rounded-full border border-cream-deep px-4 py-1.5 text-sm font-semibold text-ink transition hover:bg-cream/40"
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
                className="rounded-full bg-green px-4 py-1.5 text-sm font-semibold text-cream transition hover:bg-green-deep"
              >
                Mark picked up
              </button>
            </form>
          ) : null}
          <form action={cancelRunnerErrand.bind(null, taskId)}>
            <button
              type="submit"
              className="rounded-full border border-orange/20 px-4 py-1.5 text-sm font-semibold text-orange-deep transition hover:bg-orange/10"
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

/* ------------------------------------------------------------------ */
/* Runner availability card wrapper                                     */
/* ------------------------------------------------------------------ */

export function RunnerAvailabilityCard({
  available,
  children,
}: {
  available: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[2rem] border border-cream-deep bg-white p-6 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <CircleCheck className="h-5 w-5 text-green-soft" aria-hidden />
        <h2 className="font-display text-lg font-semibold text-ink">Availability</h2>
        <span
          className={`ml-auto inline-flex h-2.5 w-2.5 rounded-full ${available ? "bg-green" : "bg-cream-deep"}`}
          aria-hidden
        />
      </div>
      <p className="mb-4 text-sm text-muted">
        {available ? "You're live and visible to buyers." : "You're offline — buyers can't see you."}
      </p>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Kept for backward-compat (errands/[id]/page.tsx imports this)        */
/* ------------------------------------------------------------------ */

/** @deprecated Use StatCard instead */
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
  return <StatCard title={title} value={value} subtitle={subtitle} icon={Icon} tone={tone} />;
}
