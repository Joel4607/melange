import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Shield, ShieldCheck } from "lucide-react";
import { getServiceClient } from "@/lib/supabase/service";
import { Logo } from "@/components/brand";
import {
  requireAdmin,
  adminResolveDispute,
  updateFraudFlag,
  approveVerification,
  rejectVerification,
} from "./actions";
import type { DisputeRow, FraudFlagRow, VerificationRequestRow } from "@/lib/server/rows";

async function signedUrl(
  db: ReturnType<typeof getServiceClient>,
  path: string | null,
): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data, error } = await db.storage
    .from("verification")
    .createSignedUrl(path, 60 * 5);
  if (error || !data) return null;
  return data.signedUrl;
}

export const metadata: Metadata = {
  title: "Admin — Mélange",
};

interface DisputeWithTask extends DisputeRow {
  task_title: string | null;
  buyer_id: string | null;
  runner_id: string | null;
  runner_verification: {
    user_id: string;
    front_url: string | null;
    back_url: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  ledger: { user_id: string; type: string; amount: string; created_at: string }[];
  payment_reference: string | null;
}

interface FraudFlagWithNames extends FraudFlagRow {
  runner_name: string | null;
  task_title: string | null;
}

interface VerificationRequestWithNames extends VerificationRequestRow {
  user_name: string | null;
  front_url: string | null;
  back_url: string | null;
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
      .select("id, title, buyer_id, selected_runner_id, payment_reference")
      .in("id", Array.from(taskIds))
      .returns<{ id: string; title: string; buyer_id: string; selected_runner_id: string | null; payment_reference: string | null }[]>();
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
        runner_verification: null,
        ledger: [],
        payment_reference: t?.payment_reference ?? null,
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

  const { data: verificationRequests } = await db
    .from("verification_requests")
    .select(
      "id, user_id, front_photo_path, back_photo_path, phone, email, status, created_at",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .returns<VerificationRequestRow[]>();

  for (const v of verificationRequests ?? []) {
    userIds.add(v.user_id);
  }

  const { data: allVerifications } = await db
    .from("verification_requests")
    .select(
      "user_id, front_photo_path, back_photo_path, phone, email, status, created_at",
    )
    .in("user_id", Array.from(userIds))
    .order("created_at", { ascending: false })
    .returns<
      {
        user_id: string;
        front_photo_path: string;
        back_photo_path: string | null;
        phone: string | null;
        email: string | null;
        status: string;
        created_at: string;
      }[]
    >();

  const latestVerificationByUser = new Map<
    string,
    {
      user_id: string;
      front_photo_path: string;
      back_photo_path: string | null;
      phone: string | null;
      email: string | null;
      status: string;
      created_at: string;
    }
  >();
  for (const v of allVerifications ?? []) {
    if (!latestVerificationByUser.has(v.user_id)) latestVerificationByUser.set(v.user_id, v);
  }

  const { data: ledgerRows } = await db
    .from("ledger_entries")
    .select("task_id, user_id, type, amount, created_at")
    .in("task_id", Array.from(taskIds))
    .order("created_at", { ascending: false })
    .returns<
      { task_id: string; user_id: string; type: string; amount: string; created_at: string }[]
    >();

  const ledgerByTask = new Map<string, { user_id: string; type: string; amount: string; created_at: string }[]>();
  for (const row of ledgerRows ?? []) {
    const list = ledgerByTask.get(row.task_id) ?? [];
    list.push(row);
    ledgerByTask.set(row.task_id, list);
  }

  const { data: profiles } = await db
    .from("profiles")
    .select("id, name")
    .in("id", Array.from(userIds))
    .returns<{ id: string; name: string }[]>();
  const nameById = new Map(profiles?.map((p) => [p.id, p.name]) ?? []);

  for (const d of disputesWithTasks) {
    const v = d.runner_id ? latestVerificationByUser.get(d.runner_id) : undefined;
    if (v) {
      d.runner_verification = {
        user_id: v.user_id,
        front_url: await signedUrl(db, v.front_photo_path),
        back_url: await signedUrl(db, v.back_photo_path),
        phone: v.phone,
        email: v.email,
      };
    }
    d.ledger = ledgerByTask.get(d.task_id) ?? [];
  }

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

  const verificationRequestsWithNames: VerificationRequestWithNames[] = await Promise.all(
    (verificationRequests ?? []).map(async (v) => ({
      ...v,
      user_name: nameById.get(v.user_id) ?? null,
      front_url: await signedUrl(db, v.front_photo_path),
      back_url: await signedUrl(db, v.back_photo_path),
    })),
  );

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

        <section className="mt-6 rounded-2xl border border-cream-deep bg-white p-5 shadow-sm">
          <p className="font-medium text-green-deep">Telegram Mini App</p>
          <p className="mt-1 text-sm text-muted">
            Manage verifications and disputes from Telegram. Link your Telegram account first.
          </p>
          <Link
            href="/app/admin/telegram-link"
            className="mt-3 inline-block rounded-full bg-green px-4 py-2 text-sm font-semibold text-cream transition hover:bg-green-deep"
          >
            Link Telegram
          </Link>
        </section>

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
                  {d.payment_reference ? (
                    <p className="mt-1 text-xs text-muted">
                      Payment reference: {d.payment_reference}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted">
                    {new Date(d.created_at).toLocaleString()}
                  </p>

                  {d.runner_verification ? (
                    <div className="mt-4 rounded-xl border border-cream-deep bg-cream/40 p-3 text-sm">
                      <p className="font-medium text-green-deep">Runner identity</p>
                      <p className="text-muted">
                        Phone: {d.runner_verification.phone ?? "—"} · Email:{" "}
                        {d.runner_verification.email ?? "—"}
                      </p>
                      <div className="mt-2 flex gap-3">
                        {d.runner_verification.front_url ? (
                          <a
                            href={d.runner_verification.front_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-green-soft underline"
                          >
                            Ghana Card front
                          </a>
                        ) : null}
                        {d.runner_verification.back_url ? (
                          <a
                            href={d.runner_verification.back_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-green-soft underline"
                          >
                            Ghana Card back
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {d.ledger.length > 0 ? (
                    <div className="mt-3 rounded-xl border border-cream-deep bg-cream/40 p-3 text-sm">
                      <p className="font-medium text-green-deep">Transaction ledger</p>
                      <ul className="mt-1 space-y-1 text-muted">
                        {d.ledger.map((entry, i) => (
                          <li key={i} className="flex justify-between">
                            <span>
                              {entry.type} · {nameById.get(entry.user_id) ?? "Unknown"}
                            </span>
                            <span>GHS {Number(entry.amount).toFixed(2)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
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

        <section className="mt-10">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-green-deep">
            <ShieldCheck className="h-5 w-5 text-orange-deep" aria-hidden />
            Verification requests
          </h2>
          {verificationRequestsWithNames.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No pending verification requests.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {verificationRequestsWithNames.map((v) => (
                <li
                  key={v.id}
                  className="rounded-[1.25rem] border border-cream-deep bg-white p-5 shadow-sm"
                >
                  <p className="font-medium text-ink">{v.user_name ?? "Unknown user"}</p>
                  <p className="mt-1 text-xs text-muted">
                    {new Date(v.created_at).toLocaleString()}
                  </p>
                  {v.phone ? (
                    <p className="mt-1 text-sm text-ink">Phone: {v.phone}</p>
                  ) : null}
                  {v.email ? (
                    <p className="mt-1 text-sm text-ink">Email: {v.email}</p>
                  ) : null}
                  <div className="mt-2 flex gap-3">
                    {v.front_url ? (
                      <a
                        href={v.front_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-green-soft underline"
                      >
                        View front
                      </a>
                    ) : null}
                    {v.back_url ? (
                      <a
                        href={v.back_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-green-soft underline"
                      >
                        View back
                      </a>
                    ) : null}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <form action={approveVerification.bind(null, v.id)}>
                      <button
                        type="submit"
                        className="rounded-full bg-green px-4 py-2 text-sm font-semibold text-cream transition hover:bg-green-deep"
                      >
                        Approve
                      </button>
                    </form>
                    <form action={rejectVerification.bind(null, v.id)}>
                      <button
                        type="submit"
                        className="rounded-full bg-orange px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-deep"
                      >
                        Reject
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
