import { getServiceClient } from "@/lib/supabase/service";
import type { WalletRow } from "./rows";

/**
 * Simulated escrow. Every wallet/ledger mutation goes through this server-only
 * module (service-role) — clients have read-only RLS access and can never move
 * money. The `ledger_entries` table is the append-only audit trail behind every
 * `wallets` balance change.
 *
 * Mutations are performed inside PostgreSQL functions so the wallet update and
 * ledger insert share a single transaction and are not subject to read-modify-write
 * races.
 */
type Db = ReturnType<typeof getServiceClient>;

export async function hasLedgerEntry(
  db: Db,
  taskId: string,
  types: string[],
): Promise<boolean> {
  const { data, error } = await db
    .from("ledger_entries")
    .select("id")
    .eq("task_id", taskId)
    .in("type", types)
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (error) throw new Error(`escrow: ${error.message}`);
  return data != null;
}

async function loadWallet(db: Db, userId: string): Promise<WalletRow> {
  const existing = await db
    .from("wallets")
    .select("user_id, balance, held")
    .eq("user_id", userId)
    .maybeSingle<WalletRow>();
  if (existing.error) throw new Error(`escrow: ${existing.error.message}`);
  if (existing.data) return existing.data;

  const created = await db
    .from("wallets")
    .insert({ user_id: userId })
    .select("user_id, balance, held")
    .single<WalletRow>();
  if (created.error || !created.data) {
    throw new Error(`escrow: could not create wallet for ${userId}`);
  }
  return created.data;
}

/**
 * Credit simulated funds to a user's available balance, recording a `topup`
 * ledger entry. There is no real payment rail in this walking skeleton, so this
 * stands in for "the buyer loaded their wallet". Returns the new balance.
 */
export async function topUp(userId: string, amount: number): Promise<number> {
  const db = getServiceClient();
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("escrow: top-up amount must be a positive number");
  }
  const cents = Math.round(amount * 100);
  if (cents <= 0) throw new Error("escrow: top-up amount must be positive");

  const { error } = await db.rpc("top_up_wallet", {
    p_user_id: userId,
    p_amount_cents: cents,
  });
  if (error) throw new Error(`escrow: ${error.message}`);

  const wallet = await loadWallet(db, userId);
  return Number(wallet.balance);
}

/**
 * Move a task's price from the buyer's available balance into escrow (`held`),
 * recording a `hold` ledger entry. Throws if the buyer has insufficient funds.
 */
export async function holdFunds(taskId: string): Promise<void> {
  const db = getServiceClient();
  const { error } = await db.rpc("hold_funds", { p_task_id: taskId });
  if (error) throw new Error(`escrow: ${error.message}`);
}

/**
 * Release escrowed funds to the selected runner: clears the buyer's `held` and
 * credits the runner's `balance`, with matching `release` / `payout` ledger
 * entries. Throws if no runner is selected.
 */
export async function releaseFunds(taskId: string): Promise<void> {
  const db = getServiceClient();
  const { error } = await db.rpc("release_funds", { p_task_id: taskId });
  if (error) throw new Error(`escrow: ${error.message}`);
}

/**
 * Return escrowed funds to the buyer: clears `held` back into the buyer's
 * available `balance` and records a `refund` ledger entry.
 */
export async function refund(taskId: string): Promise<void> {
  const db = getServiceClient();
  const { error } = await db.rpc("refund_funds", { p_task_id: taskId });
  if (error) throw new Error(`escrow: ${error.message}`);
}
