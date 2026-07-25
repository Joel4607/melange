import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getServiceClient } from "@/lib/supabase/service";
import { Logo } from "@/components/brand";
import { requireAdmin } from "../actions";

export const metadata: Metadata = {
  title: "Admin audit log — Mélange",
};

interface AdminAction {
  id: string;
  admin_id: string;
  admin_name: string | null;
  action: string;
  target_id: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const actionLabels: Record<string, string> = {
  verification_approve: "Approved verification",
  verification_reject: "Rejected verification",
  dispute_release: "Released dispute funds to runner",
  dispute_refund: "Refunded dispute funds to buyer",
  dispute_partial: "Resolved dispute with partial payment",
  telegram_link: "Linked Telegram account",
};

export default async function AdminAuditPage() {
  await requireAdmin();
  const db = getServiceClient();

  const { data: actions } = await db
    .from("telegram_admin_actions")
    .select("id, admin_id, action, target_id, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<{
      id: string;
      admin_id: string;
      action: string;
      target_id: string;
      metadata: Record<string, unknown> | null;
      created_at: string;
    }[]>();

  const adminIds = Array.from(new Set((actions ?? []).map((a) => a.admin_id)));
  const { data: profiles } = adminIds.length
    ? await db
        .from("profiles")
        .select("id, name")
        .in("id", adminIds)
        .returns<{ id: string; name: string | null }[]>()
    : { data: [] };

  const nameById = new Map(profiles?.map((p) => [p.id, p.name]) ?? []);

  const rows: AdminAction[] = (actions ?? []).map((a) => ({
    ...a,
    admin_name: nameById.get(a.admin_id) ?? null,
  }));

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="border-b border-cream-deep/70 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-sm font-medium text-green-deep"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back
          </Link>
          <Logo />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10">
        <h1 className="font-display text-fluid-h2 font-semibold text-green-deep">
          Admin audit log
        </h1>
        <p className="mt-2 text-muted">
          Recent actions taken by admins through the web panel or Telegram bot.
        </p>

        {rows.length === 0 ? (
          <p className="mt-6 text-sm text-muted">No admin actions recorded yet.</p>
        ) : (
          <div className="mt-6 overflow-hidden rounded-2xl border border-cream-deep bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-cream/40">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-green-deep">Time</th>
                  <th className="px-4 py-3 text-left font-medium text-green-deep">Admin</th>
                  <th className="px-4 py-3 text-left font-medium text-green-deep">Action</th>
                  <th className="px-4 py-3 text-left font-medium text-green-deep">Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-deep">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 text-muted">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-medium text-ink">
                      {row.admin_name ?? "Unknown"}
                    </td>
                    <td className="px-4 py-3 text-ink">
                      {actionLabels[row.action] ?? row.action.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-muted">#{row.target_id.slice(0, 8)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
