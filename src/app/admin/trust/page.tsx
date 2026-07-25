import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getServiceClient } from "@/lib/supabase/service";
import { Logo } from "@/components/brand";
import { requireAdmin } from "../actions";
import { RunnerTrustRow } from "./runner-trust-row";

export const metadata: Metadata = {
  title: "Trust & safety — Runner oversight — Mélange",
};

interface RunnerSummary {
  user_id: string;
  name: string | null;
  trust_score: number;
  status: string;
  verified: boolean;
  active_flags: number;
}

export default async function TrustDashboardPage() {
  await requireAdmin();
  const db = getServiceClient();

  const { data: runners } = await db
    .from("runner_profile")
    .select(
      "user_id, trust_score, status, is_available, verified, profiles(name, verified)",
    )
    .order("trust_score", { ascending: false })
    .returns<
      {
        user_id: string;
        trust_score: number;
        status: string;
        is_available: boolean;
        verified: boolean;
        profiles: { name: string | null; verified: boolean } | null;
      }[]
    >();

  const runnerIds = (runners ?? []).map((r) => r.user_id);
  const { data: flags } = runnerIds.length
    ? await db
        .from("fraud_flags")
        .select("runner_id, status")
        .in("runner_id", runnerIds)
        .eq("status", "active")
        .returns<{ runner_id: string; status: string }[]>()
    : { data: [] };

  const activeFlagsByRunner = new Map<string, number>();
  for (const f of flags ?? []) {
    activeFlagsByRunner.set(f.runner_id, (activeFlagsByRunner.get(f.runner_id) ?? 0) + 1);
  }

  const rows: RunnerSummary[] = (runners ?? []).map((r) => ({
    user_id: r.user_id,
    name: r.profiles?.name ?? null,
    trust_score: r.trust_score,
    status: r.status,
    verified: r.profiles?.verified ?? r.verified,
    active_flags: activeFlagsByRunner.get(r.user_id) ?? 0,
  }));

  const statusSummary = {
    active: rows.filter((r) => r.status === "active").length,
    quarantined: rows.filter((r) => r.status === "quarantined").length,
    suspended: rows.filter((r) => r.status === "suspended").length,
    flagged: rows.filter((r) => r.active_flags > 0).length,
  };

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="border-b border-cream-deep/70 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-sm font-medium text-green-deep"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back to Trust & safety
          </Link>
          <Logo />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">
        <h1 className="font-display text-fluid-h2 font-semibold text-green-deep">
          Runner oversight
        </h1>
        <p className="mt-2 text-muted">
          Review runner trust scores, statuses, and active fraud flags in one place.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-cream-deep bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-muted uppercase">Active</p>
            <p className="mt-1 font-display text-2xl font-semibold text-green-deep">
              {statusSummary.active}
            </p>
          </div>
          <div className="rounded-2xl border border-cream-deep bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-muted uppercase">Quarantined</p>
            <p className="mt-1 font-display text-2xl font-semibold text-orange-deep">
              {statusSummary.quarantined}
            </p>
          </div>
          <div className="rounded-2xl border border-cream-deep bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-muted uppercase">Suspended</p>
            <p className="mt-1 font-display text-2xl font-semibold text-orange-deep">
              {statusSummary.suspended}
            </p>
          </div>
          <div className="rounded-2xl border border-cream-deep bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-muted uppercase">Active flags</p>
            <p className="mt-1 font-display text-2xl font-semibold text-orange-deep">
              {statusSummary.flagged}
            </p>
          </div>
        </div>

        <section className="mt-8 rounded-2xl border border-cream-deep bg-white p-5 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-green-deep">Runners</h2>
          {rows.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No runners found.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-cream/40">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-green-deep">Runner</th>
                    <th className="px-4 py-3 text-left font-medium text-green-deep">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-green-deep">Trust</th>
                    <th className="px-4 py-3 text-left font-medium text-green-deep">Flags</th>
                    <th className="px-4 py-3 text-left font-medium text-green-deep">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-deep">
                  {rows.map((row) => (
                    <RunnerTrustRow key={row.user_id} runner={row} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
