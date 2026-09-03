import { getServiceClient } from "@/lib/supabase/service";

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

export interface CancelledTask {
  selected_runner_id: string | null;
  buyer_id: string;
  task_title: string;
}

/** Lock, authorize, cancel, and refund a task in one database transaction. */
export async function cancelTaskWithRefund(
  taskId: string,
  actorId: string,
  actorKind: "buyer" | "runner",
): Promise<CancelledTask | null> {
  const db = getServiceClient();
  const { data, error } = await db.rpc("cancel_task_with_refund", {
    p_task_id: taskId,
    p_actor_id: actorId,
    p_actor_kind: actorKind,
  });
  if (error) throw new Error(`escrow: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as
    | (CancelledTask & { status: "cancelled" | "not_cancellable" })
    | null;
  return row?.status === "cancelled" ? row : null;
}
