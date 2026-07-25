import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Star } from "lucide-react";
import { getServiceClient } from "@/lib/supabase/service";
import { getTrustBreakdown } from "@/lib/server/trust";
import { Logo } from "@/components/brand";
import { requireAdmin } from "../../actions";
import { clearRunnerFraudFlags, recalculateRunnerTrust, updateRunnerStatus } from "../actions";

export const metadata: Metadata = {
  title: "Runner trust detail — Mélange",
};

interface TrustEvent {
  id: string;
  type: string;
  value: number;
  created_at: string;
}

interface FraudFlag {
  id: string;
  rule_type: string;
  severity: number;
  status: string;
  detail: string | null;
  created_at: string;
}

export default async function RunnerTrustDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id: runnerId } = await params;
  const db = getServiceClient();

  const [{ data: profile }, { data: runner }, { data: events }, { data: flags }] = await Promise.all([
    db
      .from("profiles")
      .select("id, name, phone, email, verified, is_admin")
      .eq("id", runnerId)
      .maybeSingle<{ id: string; name: string | null; phone: string | null; email: string | null; verified: boolean; is_admin: boolean }>(),
    db
      .from("runner_profile")
      .select(
        "user_id, trust_score, status, is_available, verified, capabilities, current_lat, current_lng",
      )
      .eq("user_id", runnerId)
      .maybeSingle<{
        user_id: string;
        trust_score: number;
        status: string;
        is_available: boolean;
        verified: boolean;
        capabilities: string[] | null;
        current_lat: number | null;
        current_lng: number | null;
      }>(),
    db
      .from("trust_events")
      .select("id, type, value, created_at")
      .eq("runner_id", runnerId)
      .order("created_at", { ascending: false })
      .returns<TrustEvent[]>(),
    db
      .from("fraud_flags")
      .select("id, rule_type, severity, status, detail, created_at")
      .eq("runner_id", runnerId)
      .order("created_at", { ascending: false })
      .returns<FraudFlag[]>(),
  ]);

  if (!profile || !runner) {
    notFound();
  }

  const activeFlags = (flags ?? []).filter((f) => f.status === "active");
  const hasActiveFlag = activeFlags.length > 0;

  const breakdown = getTrustBreakdown({
    events: (events ?? []).map((e) => ({
      type: e.type as "completed" | "cancelled" | "rating" | "responsiveness" | "dispute_lost",
      value: e.value,
      at: new Date(e.created_at).getTime(),
    })),
    verified: profile.verified,
    fraudRisk: hasActiveFlag ? 1 : 0,
  });

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

  function eventLabel(e: TrustEvent) {
    switch (e.type) {
      case "completed":
        return "Completed a task";
      case "cancelled":
        return "Cancelled a task";
      case "dispute_lost":
        return "Lost a dispute";
      case "rating":
        return `Rated ${e.value} / 5`;
      case "responsiveness":
        return `Responsiveness score ${(e.value * 100).toFixed(0)}%`;
      default:
        return e.type.replace(/_/g, " ");
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="border-b border-cream-deep/70 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <Link
            href="/admin/trust"
            className="inline-flex items-center gap-2 text-sm font-medium text-green-deep"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back to runner oversight
          </Link>
          <Logo />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-fluid-h2 font-semibold text-green-deep">
              {profile.name ?? "Unknown runner"}
            </h1>
            <p className="mt-1 text-sm text-muted">{runner.user_id}</p>
          </div>
          {statusBadge(runner.status)}
        </div>

        <section className="mt-6 rounded-2xl border border-cream-deep bg-white p-5 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-green-deep">Trust summary</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted uppercase">Overall trust score</p>
              <p className="mt-1 inline-flex items-center gap-1 font-display text-2xl font-semibold text-ink">
                <Star className="h-5 w-5 fill-orange text-orange" aria-hidden />
                {(breakdown.trust * 5).toFixed(1)} / 5
              </p>
            </div>
            <div>
              <p className="text-xs text-muted uppercase">Profile verified</p>
              <p className="mt-1 font-medium text-ink">{profile.verified ? "Yes" : "No"}</p>
            </div>
            <div>
              <p className="text-xs text-muted uppercase">Completion rate</p>
              <p className="mt-1 font-medium text-ink">{(breakdown.completionRate * 100).toFixed(0)}%</p>
            </div>
            <div>
              <p className="text-xs text-muted uppercase">Dispute rate</p>
              <p className="mt-1 font-medium text-ink">{(breakdown.disputeRate * 100).toFixed(0)}%</p>
            </div>
            <div>
              <p className="text-xs text-muted uppercase">Average rating</p>
              <p className="mt-1 font-medium text-ink">{(breakdown.ratingNorm * 5 + 1).toFixed(1)} / 5</p>
            </div>
            <div>
              <p className="text-xs text-muted uppercase">Responsiveness</p>
              <p className="mt-1 font-medium text-ink">{(breakdown.responsiveness * 100).toFixed(0)}%</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {runner.status !== "active" && (
              <form action={updateRunnerStatus.bind(null, runnerId, "active")}>
                <button
                  type="submit"
                  className="rounded-full bg-green px-4 py-2 text-sm font-semibold text-cream transition hover:bg-green-deep"
                >
                  Activate
                </button>
              </form>
            )}
            {runner.status !== "quarantined" && (
              <form action={updateRunnerStatus.bind(null, runnerId, "quarantined")}>
                <button
                  type="submit"
                  className="rounded-full bg-orange px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-deep"
                >
                  Quarantine
                </button>
              </form>
            )}
            {runner.status !== "suspended" && (
              <form action={updateRunnerStatus.bind(null, runnerId, "suspended")}>
                <button
                  type="submit"
                  className="rounded-full border border-cream-deep bg-white px-4 py-2 text-sm font-semibold text-green-deep transition hover:bg-cream/40"
                >
                  Suspend
                </button>
              </form>
            )}
            {activeFlags.length > 0 && (
              <form action={clearRunnerFraudFlags.bind(null, runnerId)}>
                <button
                  type="submit"
                  className="rounded-full border border-cream-deep bg-white px-4 py-2 text-sm font-semibold text-green-deep transition hover:bg-cream/40"
                >
                  Clear active flags
                </button>
              </form>
            )}
            <form action={recalculateRunnerTrust.bind(null, runnerId)}>
              <button
                type="submit"
                className="rounded-full border border-cream-deep bg-white px-4 py-2 text-sm font-semibold text-green-deep transition hover:bg-cream/40"
              >
                Recalculate trust
              </button>
            </form>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-cream-deep bg-white p-5 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-green-deep">Profile details</h2>
          <div className="mt-4 space-y-2 text-sm">
            <p>
              <span className="text-muted">Email:</span> {profile.email ?? "—"}
            </p>
            <p>
              <span className="text-muted">Phone:</span> {profile.phone ?? "—"}
            </p>
            <p>
              <span className="text-muted">Available:</span> {runner.is_available ? "Yes" : "No"}
            </p>
            <p>
              <span className="text-muted">Capabilities:</span> {runner.capabilities?.join(", ") ?? "Any Other Errand"}
            </p>
            {runner.current_lat != null && runner.current_lng != null && (
              <p>
                <span className="text-muted">Last location:</span> {runner.current_lat.toFixed(5)},{" "}
                {runner.current_lng.toFixed(5)}
              </p>
            )}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-cream-deep bg-white p-5 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-green-deep">
            Fraud flags ({flags?.length ?? 0})
          </h2>
          {flags?.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No fraud flags for this runner.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {flags?.map((f) => (
                <li
                  key={f.id}
                  className="rounded-xl border border-cream-deep bg-cream/40 p-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-ink">{f.rule_type.replace(/_/g, " ")}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        f.status === "active"
                          ? "bg-orange/10 text-orange-deep"
                          : f.status === "confirmed"
                            ? "bg-red/10 text-red-600"
                            : "bg-green/10 text-green-deep"
                      }`}
                    >
                      {f.status}
                    </span>
                  </div>
                  {f.detail ? <p className="mt-1 text-muted">{f.detail}</p> : null}
                  <p className="mt-1 text-xs text-muted">
                    Severity {f.severity.toFixed(2)} · {new Date(f.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-cream-deep bg-white p-5 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-green-deep">
            Trust events ({events?.length ?? 0})
          </h2>
          {events?.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No trust events recorded.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {events?.map((e) => (
                <li
                  key={e.id}
                  className="flex items-start justify-between rounded-xl border border-cream-deep bg-cream/40 p-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-ink">{eventLabel(e)}</p>
                    <p className="text-xs text-muted">
                      {new Date(e.created_at).toLocaleString()}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
