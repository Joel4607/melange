import Link from "next/link";
import { ShieldAlert, Star, User } from "lucide-react";
import { updateRunnerStatus } from "./actions";

interface RunnerSummary {
  user_id: string;
  name: string | null;
  trust_score: number;
  status: string;
  verified: boolean;
  active_flags: number;
}

function statusBadge(status: string) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center rounded-full bg-green/10 px-2 py-0.5 text-xs font-medium text-green-deep">
        Active
      </span>
    );
  }
  if (status === "quarantined") {
    return (
      <span className="inline-flex items-center rounded-full bg-orange/10 px-2 py-0.5 text-xs font-medium text-orange-deep">
        Quarantined
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-red/10 px-2 py-0.5 text-xs font-medium text-red-600">
      Suspended
    </span>
  );
}

export function RunnerTrustRow({ runner }: { runner: RunnerSummary }) {
  const trustStars = (runner.trust_score * 5).toFixed(1);

  return (
    <tr>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted" aria-hidden />
          <div>
            <p className="font-medium text-ink">{runner.name ?? "Unknown runner"}</p>
            <p className="text-xs text-muted">{runner.verified ? "Verified" : "Not verified"}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">{statusBadge(runner.status)}</td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1 font-medium text-ink">
          <Star className="h-4 w-4 fill-orange text-orange" aria-hidden />
          {trustStars} / 5
        </span>
      </td>
      <td className="px-4 py-3">
        {runner.active_flags > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-orange/10 px-2 py-0.5 text-xs font-medium text-orange-deep">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
            {runner.active_flags}
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/trust/${runner.user_id}`}
            className="rounded-full border border-cream-deep bg-white px-3 py-1.5 text-xs font-medium text-green-deep transition hover:bg-cream/40"
          >
            View
          </Link>
          {runner.status !== "active" && (
            <form action={updateRunnerStatus.bind(null, runner.user_id, "active")}>
              <button
                type="submit"
                className="rounded-full bg-green px-3 py-1.5 text-xs font-semibold text-cream transition hover:bg-green-deep"
              >
                Activate
              </button>
            </form>
          )}
          {runner.status !== "quarantined" && (
            <form action={updateRunnerStatus.bind(null, runner.user_id, "quarantined")}>
              <button
                type="submit"
                className="rounded-full bg-orange px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-orange-deep"
              >
                Quarantine
              </button>
            </form>
          )}
          {runner.status !== "suspended" && (
            <form action={updateRunnerStatus.bind(null, runner.user_id, "suspended")}>
              <button
                type="submit"
                className="rounded-full border border-cream-deep bg-white px-3 py-1.5 text-xs font-semibold text-green-deep transition hover:bg-cream/40"
              >
                Suspend
              </button>
            </form>
          )}
        </div>
      </td>
    </tr>
  );
}
