import { getServiceClient } from "@/lib/supabase/service";
import type { TaskRow, WalletRow } from "./rows";

/**
 * Simulated escrow. Every wallet/ledger mutation goes through this server-only
 * module (service-role) — clients have read-only RLS access and can never move
 * money. The `ledger_entries` table is the append-only audit trail behind every
 * `wallets` balance change.
 *
 * Money is handled in integer cents internally to avoid floating-point drift,
 * then written back as a decimal. These are read-modify-write updates without
 * row locking, which is acceptable for this single-writer simulated ledger.
 */
type Db = ReturnType<typeof getServiceClient>;

const toCents = (v: string | number): number => Math.round(Number(v) * 100);
const fromCents = (cents: number): number => cents / 100;

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

async function loadTask(db: Db, taskId: string): Promise<TaskRow> {
  const { data, error } = await db
    .from("tasks")
    .select(
      "id, buyer_id, category, pickup_lat, pickup_lng, urgency, price, status, selected_runner_id, accepted_at, completed_at",
    )
    .eq("id", taskId)
    .single<TaskRow>();
  if (error || !data) throw new Error(`escrow: task ${taskId} not found`);
  return data;
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
  const cents = toCents(amount);
  if (cents <= 0) throw new Error("escrow: top-up amount must be positive");

  const wallet = await loadWallet(db, userId);
  const balance = toCents(wallet.balance) + cents;

  await db.from("wallets").update({ balance: fromCents(balance) }).eq("user_id", userId);
  await db.from("ledger_entries").insert({
    user_id: userId,
    type: "topup",
    amount: fromCents(cents),
  });
  return fromCents(balance);
}

/**
 * Move a task's price from the buyer's available balance into escrow (`held`),
 * recording a `hold` ledger entry. Throws if the buyer has insufficient funds.
 */
export async function holdFunds(taskId: string): Promise<void> {
  const db = getServiceClient();
  const task = await loadTask(db, taskId);
  const amount = toCents(task.price);

  if (await hasLedgerEntry(db, taskId, ["hold"])) return;

  const wallet = await loadWallet(db, task.buyer_id);
  const balance = toCents(wallet.balance);
  if (balance < amount) {
    throw new Error(`escrow: buyer ${task.buyer_id} has insufficient funds`);
  }

  await db
    .from("wallets")
    .update({
      balance: fromCents(balance - amount),
      held: fromCents(toCents(wallet.held) + amount),
    })
    .eq("user_id", task.buyer_id);

  await db.from("ledger_entries").insert({
    task_id: task.id,
    user_id: task.buyer_id,
    type: "hold",
    amount: fromCents(amount),
  });
}

/**
 * Release escrowed funds to the selected runner: clears the buyer's `held` and
 * credits the runner's `balance`, with matching `release` / `payout` ledger
 * entries. Throws if no runner is selected.
 */
export async function releaseFunds(taskId: string): Promise<void> {
  const db = getServiceClient();
  const task = await loadTask(db, taskId);
  if (!task.selected_runner_id) {
    throw new Error(`escrow: task ${taskId} has no selected runner`);
  }
  const amount = toCents(task.price);

  if (!await hasLedgerEntry(db, taskId, ["hold"])) return;
  if (await hasLedgerEntry(db, taskId, ["release", "payout"])) return;
  if (await hasLedgerEntry(db, taskId, ["refund"])) {
    throw new Error(`escrow: task ${taskId} has already been refunded`);
  }

  const buyer = await loadWallet(db, task.buyer_id);
  const runner = await loadWallet(db, task.selected_runner_id);

  await db
    .from("wallets")
    .update({ held: fromCents(Math.max(0, toCents(buyer.held) - amount)) })
    .eq("user_id", task.buyer_id);
  await db
    .from("wallets")
    .update({ balance: fromCents(toCents(runner.balance) + amount) })
    .eq("user_id", task.selected_runner_id);

  await db.from("ledger_entries").insert([
    { task_id: task.id, user_id: task.buyer_id, type: "release", amount: fromCents(-amount) },
    { task_id: task.id, user_id: task.selected_runner_id, type: "payout", amount: fromCents(amount) },
  ]);
}

/**
 * Return escrowed funds to the buyer: clears `held` back into the buyer's
 * available `balance` and records a `refund` ledger entry.
 */
export async function refund(taskId: string): Promise<void> {
  const db = getServiceClient();
  const task = await loadTask(db, taskId);
  const amount = toCents(task.price);

  if (!await hasLedgerEntry(db, taskId, ["hold"])) return;
  if (await hasLedgerEntry(db, taskId, ["refund"])) return;
  if (await hasLedgerEntry(db, taskId, ["release", "payout"])) {
    throw new Error(`escrow: task ${taskId} has already been released`);
  }

  const buyer = await loadWallet(db, task.buyer_id);
  await db
    .from("wallets")
    .update({
      balance: fromCents(toCents(buyer.balance) + amount),
      held: fromCents(Math.max(0, toCents(buyer.held) - amount)),
    })
    .eq("user_id", task.buyer_id);

  await db.from("ledger_entries").insert({
    task_id: task.id,
    user_id: task.buyer_id,
    type: "refund",
    amount: fromCents(amount),
  });
}
