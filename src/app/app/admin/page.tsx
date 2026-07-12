import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Shield } from "lucide-react";
import { getServiceClient } from "@/lib/supabase/service";
import { Logo } from "@/components/brand";
import { requireAdmin, adminResolveDispute, updateFraudFlag } from "./actions";
import type { DisputeRow, FraudFlagRow } from "@/lib/server/rows";

export const metadata: Metadata = {
  title: "Admin — Mélange",
};

interface DisputeWithTask extends DisputeRow {
  task_title: string | null;
  buyer_id: string | null;
  runner_id: string | null;
}

interface FraudFlagWithNames extends FraudFlagRow {
  runner_name: string | null;
  task_title: string | null;
}

export default async function AdminPage() {
  await requireAdmin();
  const db = getServiceClient();

  const { data: disputes } = await db
    .from("disputes")
    .select("id, task_id, reason, status, created_at")
    .eq("status", "escalated")
    .order("created_at", { ascending: false })
    .returns<DisputeRow[]>();

  const taskIds = new Set<string>();
  const userIds = new Set<string>();

  const disputesWithTasks: DisputeWithTask[] = [];
  if (disputes) {
    for (const d of disputes) {
      taskIds.add(d.task_id);
    }
    const { data: tasks } = await db
      .from("tasks")
      .select("id, title, buyer_id, selected_runner_id")
      .in("id", Array.from(taskIds))
      .returns<{ id: string; title: string; buyer_id: string; selected_runner_id: string | null }[]>();
    const taskById = new Map(tasks?.map((t) => [t.id, t]) ?? []);
    for (const d of disputes) {
      const t = taskById.get(d.task_id);
      if (t?.buyer_id) userIds.add(t.buyer_id);
      if (t?.selected_runner_id) userIds.add(t.selected_runner_id);
      disputesWithTasks.push({
        ...d,
        task_title: t?.title ?? null,
        buyer_id: t?.buyer_id ?? null,
        runner_id: t?.selected_runner_id ?? null,
      });
    }
  }

  const { data: fraudFlags } = await db
    .from("fraud_flags")
    .select("id, runner_id, task_id, rule_type, severity, status, detail, created_at")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .returns<FraudFlagRow[]>();

  const fraudFlagTaskIds = new Set<string>();
  if (fraudFlags) {
    for (const f of fraudFlags) {
      if (f.task_id) fraudFlagTaskIds.add(f.task_id);
      if (f.runner_id) userIds.add(f.runner_id);
    }
  }

  const { data: profiles } = await db
    .from("profiles")
    .select("id, name")
    .in("id", Array.from(userIds))
    .returns<{ id: string; name: string }[]>();
  const nameById = new Map(profiles?.map((p) => [p.id, p.name]) ?? []);

  const { data: tasks } = await db
    .from("tasks")
    .select("id, title")
    .in("id", Array.from(fraudFlagTaskIds))
    .returns<{ id: string; title: string }[]>();
  const taskTitleById = new Map(tasks?.map((t) => [t.id, t.title]) ?? []);

  const fraudFlagsWithNames: FraudFlagWithNames[] = (fraudFlags ?? []).map((f) => ({
    ...f,
    runner_name: nameById.get(f.runner_id) ?? null,
    task_title: f.task_id ? taskTitleById.get(f.task_id) ?? null : null,
  }));

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="border-b border-cream-deep/70 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <Logo />
          <Link
            href="/app"
            className="rounded-full border border-cream-deep px-4 py-2 text-sm font-medium text-green-deep transition hover:bg-white"
          >
            Back to dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10">
        <span className="inline-flex items-center gap-2 rounded-full bg-orange/15 px-4 py-1.5 text-sm font-medium text-orange-deep">
          <Shield className="h-4 w-4" aria-hidden /> Admin
        </span>

        <h1 className="mt-4 font-display text-fluid-h2 font-semibold text-green-deep">
          Trust & safety
        </h1>

        <section className="mt-8">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-green-deep">
            <AlertTriangle className="h-5 w-5 text-orange-deep" aria-hidden />
            Escalated disputes
          </h2>
          {disputesWithTasks.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No escalated disputes.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {disputesWithTasks.map((d) => (
                <li
                  key={d.id}
                  className="rounded-[1.25rem] border border-cream-deep bg-white p-5 shadow-sm"
                >
                  <p className="font-medium text-ink">{d.task_title ?? "Unknown errand"}</p>
                  <p className="mt-1 text-sm text-muted">
                    Buyer: {nameById.get(d.buyer_id ?? "") ?? "Unknown"} · Runner:{" "}
                    {nameById.get(d.runner_id ?? "") ?? "Unknown"}
                  </p>
                  <p className="mt-2 text-sm text-ink">{d.reason}</p>
                  <p className="mt-1 text-xs text-muted">
                    {new Date(d.created_at).toLocaleString()}
                  </p>
                  <div className="mt-4 flex gap-2">
                    <form action={adminResolveDispute.bind(null, d.id, "refund")}>
                      <button
                        type="submit"
                        className="rounded-full bg-orange px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-deep"
                      >
                        Refund buyer
                      </button>
                    </form>
                    <form action={adminResolveDispute.bind(null, d.id, "release")}>
                      <button
                        type="submit"
                        className="rounded-full bg-green px-4 py-2 text-sm font-semibold text-cream transition hover:bg-green-deep"
                      >
                        Release to runner
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-10">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-green-deep">
            <AlertTriangle className="h-5 w-5 text-orange-deep" aria-hidden />
            Active fraud flags
          </h2>
          {fraudFlagsWithNames.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No active fraud flags.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {fraudFlagsWithNames.map((f) => (
                <li
                  key={f.id}
                  className="rounded-[1.25rem] border border-cream-deep bg-white p-5 shadow-sm"
                >
                  <p className="font-medium text-ink">
                    {f.rule_type.replace(/_/g, " ")}
                    <span className="ml-2 rounded-full bg-orange/15 px-2 py-0.5 text-xs text-orange-deep">
                      {f.severity.toFixed(2)}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Runner: {f.runner_name ?? "Unknown"}
                    {f.task_title ? ` · ${f.task_title}` : ""}
                  </p>
                  {f.detail ? <p className="mt-2 text-sm text-ink">{f.detail}</p> : null}
                  <p className="mt-1 text-xs text-muted">
                    {new Date(f.created_at).toLocaleString()}
                  </p>
                  <div className="mt-4 flex gap-2">
                    <form action={updateFraudFlag.bind(null, f.id, "confirmed")}>
                      <button
                        type="submit"
                        className="rounded-full bg-orange px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-deep"
                      >
                        Confirm
                      </button>
                    </form>
                    <form action={updateFraudFlag.bind(null, f.id, "cleared")}>
                      <button
                        type="submit"
                        className="rounded-full border border-cream-deep px-4 py-2 text-sm font-semibold text-green-deep transition hover:bg-cream/40"
                      >
                        Clear
                      </button>
                    </form>
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
