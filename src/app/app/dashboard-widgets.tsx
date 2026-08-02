import Link from "next/link";
import {
  PackageCheck,
  Plus,
  Users,
  ArrowRight,
  Clock,
  CircleCheck,
  Lock,
  Mic,
  Calendar,
  Search,
  SlidersHorizontal,
  ChevronDown,
  TrendingUp,
  MoreVertical,
  Maximize2,
  Pencil,
  Activity,
  Sun,
  X,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { acceptOffer, declineOffer, markPickedUp, cancelRunnerErrand } from "./actions";
import { MarkDeliveredForm } from "./mark-delivered-form";

interface EmptyStateProps {
  children: React.ReactNode;
  icon?: LucideIcon;
  action?: { href: string; label: string };
}

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
  posted: { label: "Finding runner", tone: "bg-[#E05638]/10 text-[#E05638]" },
  matched: { label: "Runner matched", tone: "bg-[#E05638]/10 text-[#E05638]" },
  accepted: { label: "In progress", tone: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  in_progress: { label: "In progress", tone: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  completed: { label: "Delivered", tone: "bg-emerald-600 text-white" },
  resolved: { label: "Resolved", tone: "bg-emerald-600 text-white" },
  disputed: { label: "In dispute", tone: "bg-[#E05638]/10 text-[#E05638]" },
  cancelled: { label: "Cancelled", tone: "bg-neutral-100 text-neutral-500" },
};

/* -------------------------------------------------------------------------- */
/* Reference Mockup Inspired Components                                      */
/* -------------------------------------------------------------------------- */

export function HeroGreetingBanner({
  firstName,
  role,
  primaryActionLabel = "Show My Tasks",
  primaryActionHref = "/app",
}: {
  firstName: string;
  role: "buyer" | "runner";
  primaryActionLabel?: string;
  primaryActionHref?: string;
}) {
  const today = new Date();
  const dayNum = String(today.getDate()).padStart(2, "0");
  const dayName = today.toLocaleDateString("en-US", { weekday: "short" });
  const monthName = today.toLocaleDateString("en-US", { month: "long" });

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between py-2">
      {/* Left Date & Action Group */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        {/* Date Circle Widget */}
        <div className="flex items-center gap-3 rounded-full border border-black/10 bg-white px-5 py-2.5 shadow-xs">
          <span className="font-display text-3xl font-bold text-ink">{dayNum}</span>
          <div className="text-xs font-medium text-muted">
            <div>{dayName},</div>
            <div>{monthName}</div>
          </div>
          <div className="h-7 w-[1px] bg-neutral-200" />
        </div>

        {/* Primary Terracotta Action Button */}
        <Link
          href={primaryActionHref}
          className="inline-flex items-center gap-2 rounded-full bg-[#E05638] px-6 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-[#c9492c] active:scale-95"
        >
          <span>{primaryActionLabel}</span>
          <ArrowRight className="h-4 w-4" />
        </Link>

        {/* Calendar Icon Pill */}
        <div className="relative grid h-12 w-12 place-items-center rounded-full border border-black/10 bg-white text-ink shadow-xs">
          <Calendar className="h-5 w-5 text-neutral-700" />
          <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-[#E05638]" />
        </div>
      </div>

      {/* Right Greeting Banner */}
      <div className="flex items-center justify-between gap-6 rounded-3xl border border-black/5 bg-white/80 p-4 pl-6 backdrop-blur-xs lg:justify-end">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Hey, Need help? 👋
          </h2>
          <p className="text-sm font-light text-muted">
            {role === "buyer"
              ? `Just ask me anything! Welcome back, ${firstName}.`
              : `Manage your deliveries & earnings, ${firstName}.`}
          </p>
        </div>
        <button
          type="button"
          className="grid h-13 w-13 shrink-0 place-items-center rounded-full border border-black/10 bg-white text-ink shadow-sm transition hover:bg-neutral-50 active:scale-95"
          aria-label="Voice assistance"
        >
          <Mic className="h-6 w-6 text-neutral-800" />
        </button>
      </div>
    </div>
  );
}

export function VisaStyleWalletCard({
  wallet,
  name,
}: {
  wallet: { balance: string; held: string } | null;
  name?: string | null;
}) {
  const balance = wallet ? Number(wallet.balance).toFixed(2) : "0.00";
  const held = wallet ? Number(wallet.held).toFixed(2) : "0.00";

  return (
    <div className="flex flex-col justify-between rounded-[28px] border border-black/[0.06] bg-white p-6 shadow-sm">
      <div>
        <div className="flex items-center justify-between">
          <span className="font-display text-base font-bold tracking-wider text-ink">MÉLANGE</span>
          <div className="flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-muted">
            <span>Direct Debits</span>
            <ChevronDown className="h-3 w-3" />
          </div>
        </div>

        <div className="mt-4">
          <p className="text-xs text-neutral-400">Linked to main account</p>
          <p className="mt-1 font-mono text-sm font-semibold tracking-widest text-ink">
            •••• 2719 ({name ?? "User"})
          </p>
        </div>

        <div className="mt-5 flex gap-2">
          <Link
            href="/app/wallet"
            className="flex-1 rounded-full bg-black py-2.5 text-center text-xs font-semibold text-white transition hover:bg-neutral-800"
          >
            Receive
          </Link>
          <Link
            href="/app/wallet"
            className="flex-1 rounded-full bg-neutral-100 py-2.5 text-center text-xs font-semibold text-neutral-700 transition hover:bg-neutral-200"
          >
            Top up
          </Link>
        </div>
      </div>

      <div className="mt-6 flex items-end justify-between border-t border-neutral-100 pt-4">
        <div>
          <p className="text-xs text-neutral-400">Available balance</p>
          <p className="font-display text-xl font-bold text-[#E05638]">GHS {balance}</p>
          <p className="text-[11px] text-neutral-400">Escrow: GHS {held}</p>
        </div>
        <Link
          href="/app/wallet"
          className="flex items-center gap-1.5 text-xs font-medium text-muted transition hover:text-ink"
        >
          <Pencil className="h-3.5 w-3.5 text-[#E05638]" />
          <span>Edit limits</span>
        </Link>
      </div>
    </div>
  );
}

export function IncomePaidKpiCard({
  mainTitle,
  mainValue,
  subTitle,
  subValue,
}: {
  mainTitle: string;
  mainValue: string;
  subTitle: string;
  subValue: string;
}) {
  return (
    <div className="flex flex-col justify-between rounded-[28px] border border-black/[0.06] bg-white p-6 shadow-sm">
      <div className="border-b border-neutral-100 pb-5">
        <div className="flex items-center justify-between">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-neutral-100 text-neutral-700">
            <Clock className="h-4 w-4" />
          </div>
          <div className="flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-0.5 text-xs font-medium text-muted">
            <span>Weekly</span>
            <ChevronDown className="h-3 w-3" />
          </div>
        </div>
        <p className="mt-3 text-xs font-medium text-neutral-400">{mainTitle}</p>
        <p className="mt-1 font-display text-2xl font-bold text-ink sm:text-3xl">{mainValue}</p>
      </div>

      <div className="pt-4">
        <div className="flex items-center justify-between">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-neutral-100 text-neutral-700">
            <Clock className="h-4 w-4" />
          </div>
          <div className="flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-0.5 text-xs font-medium text-muted">
            <span>Weekly</span>
            <ChevronDown className="h-3 w-3" />
          </div>
        </div>
        <p className="mt-3 text-xs font-medium text-neutral-400">{subTitle}</p>
        <div className="mt-1 flex items-baseline justify-between">
          <p className="font-display text-xl font-bold text-ink sm:text-2xl">{subValue}</p>
          <Link href="/app/wallet" className="flex items-center gap-1 text-xs font-semibold text-[#E05638] hover:underline">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>View on chart</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export function SystemLockDonutCard({
  lockLabel = "System Lock",
  percentage = 36,
  rateLabel = "Growth rate",
}: {
  lockLabel?: string;
  percentage?: number;
  rateLabel?: string;
}) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-between gap-4">
      <div className="flex w-full flex-col items-center justify-center rounded-[24px] border border-black/[0.06] bg-white p-5 text-center shadow-sm">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-neutral-100 text-ink">
          <Lock className="h-5 w-5" />
        </div>
        <p className="mt-2 text-xs font-bold text-ink">{lockLabel}</p>
      </div>

      <div className="relative flex w-full flex-col items-center justify-center rounded-[24px] border border-black/[0.06] bg-black p-5 text-white shadow-sm">
        <div className="relative flex items-center justify-center">
          <svg className="h-24 w-24 -rotate-90 transform" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r={radius}
              className="stroke-neutral-800"
              strokeWidth="10"
              fill="transparent"
            />
            <circle
              cx="50"
              cy="50"
              r={radius}
              className="stroke-[#E05638]"
              strokeWidth="10"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="font-display text-lg font-bold text-white">{percentage}%</span>
          </div>
        </div>
        <p className="mt-2 text-[11px] font-medium text-neutral-400">{rateLabel}</p>
      </div>
    </div>
  );
}

export function SlaTimerDotCard({
  daysText = "13 Days",
  hoursText = "109 hours, 23 minutes",
  chartValue = "GHS 16,073.49",
  chartLabel = "Main Stocks",
  chartGrowth = "+ 9.3%",
}: {
  daysText?: string;
  hoursText?: string;
  chartValue?: string;
  chartLabel?: string;
  chartGrowth?: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col rounded-[28px] border border-black/[0.06] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-neutral-100 text-ink">
            <Clock className="h-4 w-4" />
          </div>
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-neutral-100 text-neutral-600">
            <Activity className="h-4 w-4" />
          </div>
        </div>

        <div className="mt-3">
          <p className="font-display text-xl font-bold text-ink">{daysText}</p>
          <p className="text-xs text-neutral-400">{hoursText}</p>
        </div>

        <div className="mt-4 grid grid-cols-10 gap-1.5">
          {Array.from({ length: 20 }).map((_, i) => (
            <span
              key={i}
              className={`h-2.5 w-2.5 rounded-full ${
                i < 9 ? "bg-[#E05638]" : "bg-neutral-200"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="rounded-[28px] border border-black/[0.06] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-neutral-100 text-ink">
            <TrendingUp className="h-4 w-4" />
          </div>
          <p className="font-display text-lg font-bold text-ink">{chartValue}</p>
        </div>

        <div className="my-2 h-10 w-full">
          <svg viewBox="0 0 200 40" className="h-full w-full stroke-[#E05638]" fill="none" strokeWidth="2.5" strokeLinecap="round">
            <path d="M0,25 C30,10 60,35 90,15 C120,-5 150,30 180,10 L200,20" />
          </svg>
        </div>

        <div className="flex items-center justify-between border-t border-neutral-100 pt-2">
          <div>
            <p className="text-xs font-bold text-ink">{chartLabel}</p>
            <p className="text-[11px] text-neutral-400">Extended & Limited</p>
          </div>
          <span className="rounded-full bg-[#E05638]/10 px-2.5 py-1 text-xs font-bold text-[#E05638]">
            {chartGrowth}
          </span>
        </div>
      </div>
    </div>
  );
}

export function ConcentricDomesCard({
  title = "Annual profits",
  data = [
    { label: "GHS 14K", color: "#FDE8E3" },
    { label: "GHS 9.3K", color: "#F9C3B7" },
    { label: "GHS 6.8K", color: "#F49B86" },
    { label: "GHS 4K", color: "#E05638" },
  ],
}: {
  title?: string;
  data?: { label: string; color: string }[];
}) {
  return (
    <div className="flex flex-col justify-between rounded-[28px] border border-black/[0.06] bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base font-bold text-ink">{title}</h3>
        <div className="flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-muted">
          <span>2023</span>
          <ChevronDown className="h-3 w-3" />
        </div>
      </div>

      <div className="relative mt-8 flex h-56 items-end justify-center">
        <div className="absolute bottom-0 flex h-52 w-52 items-center justify-center rounded-t-full bg-[#FDE8E3] pt-4 shadow-xs">
          <span className="font-display text-xs font-bold text-neutral-700">{data[0]?.label ?? "GHS 14K"}</span>
        </div>
        <div className="absolute bottom-0 flex h-40 w-40 items-center justify-center rounded-t-full bg-[#F9C3B7] pt-4 shadow-xs">
          <span className="font-display text-xs font-bold text-neutral-800">{data[1]?.label ?? "GHS 9.3K"}</span>
        </div>
        <div className="absolute bottom-0 flex h-28 w-28 items-center justify-center rounded-t-full bg-[#F49B86] pt-3 shadow-xs">
          <span className="font-display text-xs font-bold text-neutral-900">{data[2]?.label ?? "GHS 6.8K"}</span>
        </div>
        <div className="absolute bottom-0 flex h-16 w-16 items-center justify-center rounded-t-full bg-[#E05638] shadow-xs">
          <span className="font-display text-xs font-bold text-white">{data[3]?.label ?? "GHS 4K"}</span>
        </div>
      </div>
    </div>
  );
}

export function ActivityManagerCard({
  children,
  verified,
}: {
  children: React.ReactNode;
  verified?: boolean;
}) {
  return (
    <div className="flex flex-col gap-6 rounded-[28px] border border-black/[0.06] bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-ink">Activity manager</h3>
          <div className="flex items-center gap-2">
            <button type="button" className="grid h-8 w-8 place-items-center rounded-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200">
              <MoreVertical className="h-4 w-4" />
            </button>
            <button type="button" className="grid h-8 w-8 place-items-center rounded-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200">
              <Maximize2 className="h-4 w-4" />
            </button>
            <button type="button" className="flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-ink hover:bg-neutral-100">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Filters</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-1 items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50/70 px-4 py-2 text-sm text-neutral-500">
            <Search className="h-4 w-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search in activities..."
              className="w-full bg-transparent text-xs text-ink outline-none placeholder:text-neutral-400"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium text-ink">
              Team <span className="h-1.5 w-1.5 rounded-full bg-[#E05638]" />
            </span>
            <span className="flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium text-ink">
              Insights <X className="h-3 w-3 text-neutral-400 cursor-pointer" />
            </span>
            <span className="flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium text-ink">
              Today <X className="h-3 w-3 text-neutral-400 cursor-pointer" />
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col justify-between rounded-2xl border border-neutral-100 bg-neutral-50/50 p-4">
          <div>
            <p className="font-display text-xl font-bold text-ink">
              GHS 43.20 <span className="text-xs font-normal text-muted">AVG</span>
            </p>
            <div className="mt-4 flex items-end justify-between gap-1 h-12">
              <span className="h-6 w-2 rounded-full bg-[#E05638]" />
              <span className="h-10 w-2 rounded-full bg-[#E05638]/40" />
              <span className="h-4 w-2 rounded-full bg-[#E05638]" />
              <span className="h-8 w-2 rounded-full bg-[#E05638]/60" />
              <span className="h-12 w-2 rounded-full bg-[#E05638]" />
              <span className="h-5 w-2 rounded-full bg-[#E05638]/30" />
            </div>
          </div>
          <div className="mt-3 flex justify-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-300" />
            <span className="h-1.5 w-3 rounded-full bg-[#E05638]" />
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-300" />
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-neutral-100 bg-neutral-50/50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-ink">Business plans</span>
            <MoreVertical className="h-3.5 w-3.5 text-neutral-400" />
          </div>
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between rounded-xl bg-white p-2 border border-neutral-200/60 shadow-2xs">
              <span className="text-xs font-medium text-ink">Bankloans</span>
              <ChevronDown className="h-3 w-3 text-neutral-400" />
            </div>
            <div className="flex items-center gap-2 px-1 text-xs text-neutral-600">
              <span className="h-2 w-2 rounded-full bg-[#E05638]" />
              <span>Accounting</span>
            </div>
            <div className="flex items-center gap-2 px-1 text-xs text-neutral-600">
              <span className="h-2 w-2 rounded-full bg-neutral-300" />
              <span>HRmanagement</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-neutral-100 bg-neutral-50/50 p-4">
          <div>
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-[#E05638]/10 text-[#E05638]">
              <Sun className="h-4 w-4" />
            </div>
            <p className="mt-2 text-xs font-bold text-ink">Wallet Verification</p>
            <p className="mt-1 text-[11px] leading-tight text-neutral-400">
              {verified ? "Identity verified & secure." : "Enable 2-step verification to secure your wallet."}
            </p>
          </div>
          <Link
            href="/app/verify"
            className="mt-3 block w-full rounded-full bg-[#E05638] py-2 text-center text-xs font-semibold text-white transition hover:bg-[#c9492c]"
          >
            {verified ? "Manage ID" : "Enable"}
          </Link>
        </div>
      </div>

      <div className="mt-2 border-t border-neutral-100 pt-4">
        {children}
      </div>
    </div>
  );
}

export function FeedbackRatingCard({
  title = "How is your business management going?",
  ratingLabel = "Review rating",
}: {
  title?: string;
  ratingLabel?: string;
}) {
  return (
    <div className="flex flex-col justify-between rounded-[28px] border border-black/[0.06] bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-neutral-300" />
          <span className="h-2 w-4 rounded-full bg-black" />
          <span className="h-2 w-2 rounded-full bg-neutral-300" />
        </div>
        <button type="button" className="grid h-7 w-7 place-items-center rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium text-neutral-400">{ratingLabel}</p>
        <p className="mt-1 font-display text-base font-bold text-ink leading-snug">{title}</p>
      </div>

      <div className="mt-6 flex items-center justify-between gap-2 border-t border-neutral-100 pt-4">
        <button type="button" className="grid h-10 w-10 place-items-center rounded-full border border-neutral-200 bg-neutral-50 hover:bg-[#E05638] hover:text-white transition group" aria-label="Very happy">
          <svg className="h-5 w-5 stroke-neutral-700 group-hover:stroke-white" fill="none" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0" />
          </svg>
        </button>

        <button type="button" className="grid h-10 w-10 place-items-center rounded-full border border-neutral-200 bg-neutral-50 hover:bg-[#E05638] hover:text-white transition group" aria-label="Happy">
          <svg className="h-5 w-5 stroke-neutral-700 group-hover:stroke-white" fill="none" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6" />
          </svg>
        </button>

        <button type="button" className="grid h-10 w-10 place-items-center rounded-full border border-neutral-200 bg-neutral-50 hover:bg-[#E05638] hover:text-white transition group" aria-label="Neutral">
          <svg className="h-5 w-5 stroke-neutral-700 group-hover:stroke-white" fill="none" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 15h8" />
          </svg>
        </button>

        <button type="button" className="grid h-10 w-10 place-items-center rounded-full border border-neutral-200 bg-neutral-50 hover:bg-[#E05638] hover:text-white transition group" aria-label="Slightly unhappy">
          <svg className="h-5 w-5 stroke-neutral-700 group-hover:stroke-white" fill="none" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 15.172a4 4 0 015.656 0" />
          </svg>
        </button>

        <button type="button" className="grid h-10 w-10 place-items-center rounded-full border border-neutral-200 bg-neutral-50 hover:bg-[#E05638] hover:text-white transition group" aria-label="Unhappy">
          <svg className="h-5 w-5 stroke-neutral-700 group-hover:stroke-white" fill="none" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function FloatingSideDock() {
  return (
    <div className="hidden xl:flex flex-col items-center justify-center gap-3 rounded-full border border-black/[0.06] bg-white p-2.5 shadow-sm">
      <button type="button" className="grid h-9 w-9 place-items-center rounded-full border border-neutral-200 bg-neutral-50 text-ink hover:bg-neutral-100">
        <Plus className="h-4 w-4" />
      </button>
      <button type="button" className="grid h-9 w-9 place-items-center rounded-full border border-neutral-200 bg-neutral-50 text-ink hover:bg-neutral-100">
        <ArrowUpRight className="h-4 w-4" />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Existing Components (Preserved for compatibility)                          */
/* -------------------------------------------------------------------------- */

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
  const bg = tone === "orange" ? "bg-[#E05638]/10" : "bg-emerald-100/60";
  const text = tone === "orange" ? "text-[#E05638]" : "text-emerald-800";
  return (
    <div className="flex flex-col py-2">
      <div className="flex items-center gap-2">
        <span className={`grid h-8 w-8 place-items-center rounded-full ${bg} ${text}`}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <p className="text-sm font-medium text-muted">{title}</p>
      </div>
      <div className="mt-3">
        <p className="font-display text-3xl font-semibold text-ink">{value}</p>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
    </div>
  );
}

export function QuickActions({ role }: { role: "buyer" | "runner" }) {
  if (role === "runner") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/app/feed"
          className="flex items-center justify-between rounded-2xl bg-[#E05638] p-4 text-white shadow-sm transition hover:bg-[#c9492c]"
        >
          <span>
            <span className="flex items-center gap-2 font-display text-base font-semibold">
              <PackageCheck className="h-5 w-5" aria-hidden /> Open errands
            </span>
            <span className="mt-1 block text-sm text-white/80">Browse and claim nearby jobs.</span>
          </span>
          <ArrowRight className="h-5 w-5" aria-hidden />
        </Link>
        <Link
          href="/app/settings"
          className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4 text-ink shadow-sm transition hover:bg-neutral-50"
        >
          <span>
            <span className="flex items-center gap-2 font-display text-base font-semibold">
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
    <div className="grid gap-3 sm:grid-cols-2">
      <Link
        href="/app/runners"
        className="flex items-center justify-between rounded-2xl bg-[#E05638] p-4 text-white shadow-sm transition hover:bg-[#c9492c]"
      >
        <span>
          <span className="flex items-center gap-2 font-display text-base font-semibold">
            <Users className="h-5 w-5" aria-hidden /> Browse runners
          </span>
          <span className="mt-1 block text-sm text-white/80">Pick a trusted runner first.</span>
        </span>
        <ArrowRight className="h-5 w-5" aria-hidden />
      </Link>
      <Link
        href="/app/post"
        className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4 text-ink shadow-sm transition hover:bg-neutral-50"
      >
        <span>
          <span className="flex items-center gap-2 font-display text-base font-semibold">
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
    <div className="py-2">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
          <Icon className="h-5 w-5 text-[#E05638]" aria-hidden /> {title}
        </p>
        {action ? (
          <Link href={action.href} className="shrink-0 text-sm font-medium text-[#E05638] hover:underline">
            {action.label}
          </Link>
        ) : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function Empty({ children, icon: Icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      {Icon ? <Icon className="h-8 w-8 text-[#E05638]" aria-hidden /> : null}
      <p className={`text-sm text-muted ${Icon ? "mt-3" : ""}`}>{children}</p>
      {action ? (
        <Link
          href={action.href}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#E05638] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#c9492c]"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

export function BuyerErrandList({ errands }: { errands: DashboardErrand[] }) {
  if (errands.length === 0) {
    return (
      <Empty icon={PackageCheck} action={{ href: "/app/post", label: "Post an errand" }}>
        No errands yet. Post one and track it from matched to delivered.
      </Empty>
    );
  }
  return (
    <ul className="divide-y divide-neutral-100">
      {errands.map((e) => {
        const s = STATUS_LABELS[e.status] ?? { label: e.status, tone: "bg-neutral-100 text-muted" };
        return (
          <li key={e.id}>
            <Link
              href={`/app/errands/${e.id}`}
              className="group flex items-center justify-between gap-4 py-3.5 transition-opacity hover:opacity-80"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink group-hover:underline">{e.title}</span>
                <span className="text-xs text-muted">
                  {e.category ?? "Errand"} · GHS {Number(e.price).toFixed(2)}
                </span>
              </span>
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${s.tone}`}>
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
    tone: "bg-neutral-100 text-muted",
  };
  const payout =
    task.fee !== undefined
      ? (Number(task.price) - Number(task.fee)).toFixed(2)
      : Number(task.price).toFixed(2);

  return (
    <div className="border-b border-neutral-100 py-3.5 last:border-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{task.title}</p>
          <p className="text-xs text-muted">
            {task.category ?? "Errand"} · Payout GHS {payout}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${status.tone}`}>
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
            className="rounded-full bg-[#E05638] px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-[#c9492c]"
          >
            Accept
          </button>
        </form>
        <form action={declineOffer.bind(null, taskId)}>
          <button
            type="submit"
            className="rounded-full border border-neutral-200 px-4 py-1.5 text-xs font-semibold text-ink transition hover:bg-neutral-50"
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
                className="rounded-full bg-[#E05638] px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-[#c9492c]"
              >
                Mark picked up
              </button>
            </form>
          ) : null}
          <form action={cancelRunnerErrand.bind(null, taskId)}>
            <button
              type="submit"
              className="rounded-full border border-neutral-200 px-4 py-1.5 text-xs font-semibold text-[#E05638] transition hover:bg-[#E05638]/10"
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
    <div className="py-2">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 font-display font-semibold text-ink">
          <CircleCheck className="h-5 w-5 text-emerald-600" aria-hidden /> Availability
        </p>
        <span
          className={`inline-flex h-2.5 w-2.5 rounded-full ${available ? "bg-emerald-500" : "bg-neutral-300"}`}
          aria-hidden
        />
      </div>
      <p className="mt-1 text-xs text-muted">
        {available ? "You are available for new errands" : "You are currently offline"}
      </p>
      <div className="mt-4">{children}</div>
    </div>
  );
}
