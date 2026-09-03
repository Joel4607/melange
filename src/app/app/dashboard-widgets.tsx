import Link from "next/link";
import { PackageCheck, ArrowRight, type LucideIcon } from "lucide-react";
import { acceptOffer, declineOffer, markPickedUp, cancelRunnerErrand } from "./actions";
import { MarkDeliveredForm } from "./mark-delivered-form";
import { formatDemoMoney } from "@/lib/demo-money";

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

export interface DashboardFocus {
  eyebrow: string;
  title: string;
  description: string;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
  tone?: "green" | "orange";
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
    <div className="min-w-0 rounded-2xl border border-cream-deep bg-white p-3 shadow-sm sm:rounded-3xl sm:p-5">
      <span className={`hidden h-9 w-9 place-items-center rounded-xl sm:grid ${iconBg}`}>
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <p className="font-display text-[clamp(0.95rem,4.3vw,1.875rem)] font-semibold leading-tight tracking-tight text-ink sm:mt-3">
        {value}
      </p>
      <p className="mt-1 text-[11px] font-medium leading-tight text-ink sm:text-sm">{title}</p>
      {subtitle ? <p className="mt-1 hidden text-xs text-muted sm:block">{subtitle}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* State-aware next action                                              */
/* ------------------------------------------------------------------ */

export function NextActionCard({
  eyebrow,
  title,
  description,
  primary,
  secondary,
  icon: Icon,
  tone = "green",
}: DashboardFocus & { icon: LucideIcon }) {
  const background =
    tone === "orange"
      ? "from-orange to-orange-deep"
      : "from-green to-green-deep";
  const primaryText = tone === "orange" ? "text-orange-deep" : "text-green-deep";

  return (
    <section
      aria-label={`${eyebrow}: ${title}`}
      className={`relative isolate overflow-hidden rounded-[1.75rem] bg-linear-to-br ${background} p-5 text-cream shadow-lg sm:p-7`}
    >
      <span
        className="absolute -right-10 -top-12 -z-10 h-40 w-40 rounded-full border-[28px] border-white/10"
        aria-hidden
      />
      <div className="flex items-start gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/12 ring-1 ring-white/20">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cream/70">
            {eyebrow}
          </p>
          <h2 className="mt-2 max-w-2xl font-display text-2xl font-semibold leading-tight sm:text-3xl">
            {title}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-cream/75 sm:text-base">
            {description}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Link
          href={primary.href}
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cream px-5 py-2.5 text-sm font-semibold shadow-sm transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${primaryText}`}
        >
          {primary.label}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        {secondary ? (
          <Link
            href={secondary.href}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/25 bg-white/5 px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {secondary.label}
          </Link>
        ) : null}
      </div>
    </section>
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
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
          <Icon className="h-5 w-5 text-green-soft" aria-hidden /> {title}
        </h2>
        {action ? (
          <Link
            href={action.href}
            className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-green-deep transition hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green"
          >
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
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-cream-deep bg-cream/25 px-5 py-10 text-center">
      {Icon ? <Icon className="h-8 w-8 text-cream-deep" aria-hidden /> : null}
      <p className={`max-w-md text-sm leading-relaxed text-muted ${Icon ? "mt-3" : ""}`}>{children}</p>
      {action ? (
        <Link
          href={action.href}
          className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-green px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-green-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green"
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
    <ul className="space-y-2">
      {errands.map((e) => (
        <li key={e.id}>
          <Link
            href={`/app/errands/${e.id}`}
            className="group flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-cream-deep/80 bg-cream/20 p-3.5 transition hover:border-green/20 hover:bg-cream/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium text-ink group-hover:underline">
                {e.title}
              </span>
              <span className="text-xs text-muted">
                {e.category ?? "Errand"} · {formatDemoMoney(e.price)}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <StatusPill status={e.status} />
              <ArrowRight className="hidden h-4 w-4 text-muted sm:block" aria-hidden />
            </span>
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
      ? Number(task.price) - Number(task.fee)
      : Number(task.price);

  return (
    <div className="rounded-2xl border border-cream-deep bg-white p-4 shadow-sm transition hover:border-green/20">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{task.title}</p>
          <p className="text-xs text-muted">
            {task.category ?? "Errand"} · Demo payout {formatDemoMoney(payout)}
          </p>
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
            className="min-h-11 rounded-xl bg-green px-4 py-2.5 text-sm font-semibold text-cream transition hover:bg-green-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green"
          >
            Accept
          </button>
        </form>
        <form action={declineOffer.bind(null, taskId)}>
          <button
            type="submit"
            className="min-h-11 rounded-xl border border-cream-deep px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-cream/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green"
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
                className="min-h-11 rounded-xl bg-green px-4 py-2.5 text-sm font-semibold text-cream transition hover:bg-green-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green"
              >
                Mark picked up
              </button>
            </form>
          ) : null}
          <form action={cancelRunnerErrand.bind(null, taskId)}>
            <button
              type="submit"
              className="min-h-11 rounded-xl border border-orange/20 px-4 py-2.5 text-sm font-semibold text-orange-deep transition hover:bg-orange/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange"
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
