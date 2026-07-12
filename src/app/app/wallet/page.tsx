import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/brand";
import { LedgerRow } from "@/lib/server/rows";
import { TopUpForm } from "./top-up-form";
import { RealtimeStatus } from "../realtime-status";

export const metadata: Metadata = {
  title: "Wallet — Mélange",
};

const LABELS: Record<string, string> = {
  topup: "Top up",
  hold: "Held in escrow",
  release: "Escrow released",
  payout: "Payout",
  refund: "Refund",
};

export default async function WalletPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: wallet } = await supabase
    .from("wallets")
    .select("balance, held")
    .eq("user_id", user.id)
    .maybeSingle<{ balance: string; held: string }>();

  const { data: ledger } = await supabase
    .from("ledger_entries")
    .select("id, task_id, type, amount, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .returns<LedgerRow[]>();

  const taskIds = new Set(
    (ledger ?? [])
      .map((e) => e.task_id)
      .filter((id): id is string => id != null),
  );

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title")
    .in("id", Array.from(taskIds))
    .returns<{ id: string; title: string }[]>();
  const titleById = new Map(tasks?.map((t) => [t.id, t.title]) ?? []);

  const balance = Number(wallet?.balance ?? 0).toFixed(2);
  const held = Number(wallet?.held ?? 0).toFixed(2);

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="border-b border-cream-deep/70 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <Link href="/app" className="inline-flex items-center gap-2 text-sm font-medium text-green-deep">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back
          </Link>
          <Logo />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10">
        <h1 className="font-display text-fluid-h2 font-semibold text-green-deep">Wallet</h1>

        <div className="mt-6 rounded-[1.5rem] border border-cream-deep bg-white p-6 shadow-sm">
          <p className="flex items-center gap-2 font-medium text-green-deep">
            <Wallet className="h-5 w-5 text-orange-deep" aria-hidden /> Balance
          </p>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted">Available</p>
              <p className="font-display text-3xl font-semibold text-green-deep">GHS {balance}</p>
            </div>
            <div>
              <p className="text-sm text-muted">In escrow</p>
              <p className="font-display text-3xl font-semibold text-green-deep">GHS {held}</p>
            </div>
          </div>
          <div className="mt-6">
            <TopUpForm />
          </div>
        </div>

        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold text-green-deep">Transactions</h2>
          {ledger?.length ? (
            <ul className="mt-4 space-y-3">
              {ledger.map((entry) => {
                const amount = Number(entry.amount);
                const isCredit = amount > 0;
                return (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between rounded-[1.25rem] border border-cream-deep bg-white p-4 shadow-sm"
                  >
                    <div>
                      <p className="font-medium text-ink">{LABELS[entry.type] ?? entry.type}</p>
                      {entry.task_id ? (
                        <p className="text-sm text-muted">{titleById.get(entry.task_id) ?? "Errand"}</p>
                      ) : null}
                      <p className="text-xs text-muted">{new Date(entry.created_at).toLocaleString()}</p>
                    </div>
                    <span
                      className={`font-medium ${isCredit ? "text-green-deep" : "text-orange-deep"}`}
                    >
                      {isCredit ? "+" : ""}GHS {amount.toFixed(2)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">No transactions yet.</p>
          )}
        </section>
        <RealtimeStatus userId={user.id} />
      </main>
    </div>
  );
}

