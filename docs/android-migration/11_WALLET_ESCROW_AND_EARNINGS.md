# 11 — Wallet, Escrow, and Earnings

## Purpose

Rebuild buyer wallet history, simulated top-up, task escrow, refunds, release, runner earnings, and tips without weakening atomic money invariants or implying a real payment rail.

## Current web implementation

- `src/app/app/wallet/page.tsx` shows buyer balance, held funds, and ledger entries.
- `src/app/app/earnings/page.tsx` shows runner payouts/history.
- `wallet-credit-card.tsx` and `wallet/top-up-form.tsx` provide summaries and top-up UI.
- `src/lib/server/escrow.ts` calls atomic functions for top-up, hold, release, refund, and cancellation.
- Migration `0022_atomic_escrow.sql` defines transactional RPCs; `0045_matching_reliability.sql` adds task-scoped idempotent funding/hold.
- Migration `0042_buyer_review_tip.sql` atomically rates and transfers optional tips.
- Current create/offer flow may automatically add simulated balance so a demo can fund an errand.

## Evidence and product boundary

This is simulated wallet/escrow. Every screen and confirmation must say so. Do not collect bank card, mobile-money, CVV, PIN, OTP, or real payment credentials. A future real processor is a separate regulated/security project with webhooks, reconciliation, refunds, and compliance.

## Money model

```kotlin
@JvmInline value class Money(val pesewas: Long)
```

- API: signed 64-bit integer pesewas for commands/projections.
- Database adapter: exact numeric conversion.
- UI input: parse a decimal GHS string to pesewas with at most two fractional digits.
- UI output: locale-aware `GHS 50.00`.
- Never use floating point for balance, hold, refund, payout, or tip.
- Ledger amounts preserve sign and server-defined type.

## Android screens

### `WalletScreen` (buyer)

- simulated-money banner;
- available balance and held total;
- top-up action;
- paginated ledger grouped by date;
- entry labels for top-up, hold, release, refund, tip charge, tip, and payout where applicable;
- empty/offline states.

### `TopUpSheet`

- positive amount input;
- preview and explicit “Add simulated funds” confirmation;
- no payment-instrument fields;
- idempotent command progress/result.

### `EarningsScreen` (runner)

- total earned and recent payout/tip summary from server;
- completed/resolved errand earnings list;
- task budget is not runner earnings: payout is `price - fee`, plus separate tips;
- no cash-out action unless a real payout system is later implemented.

### Task escrow cards

Buyer detail shows own budget, platform fee, available/held state, and confirmation. Runner sees expected payout, not buyer wallet balance. Shared group screens show only the caller's child escrow status to a buyer and combined payout to the runner.

## APIs

```text
GET  /api/mobile/v1/wallet?cursor=&limit=
POST /api/mobile/v1/wallet/top-ups
GET  /api/mobile/v1/earnings?cursor=&limit=
POST /api/mobile/v1/tasks/{taskId}/escrow
POST /api/mobile/v1/share-groups/{groupId}/fund
```

Top-up request uses `amountPesewas` and `Idempotency-Key`. Escrow command needs no client amount; server loads the task price. Return authoritative balances, relevant ledger IDs, and task/group projection.

Cancellation, delivery/review, and dispute endpoints trigger refunds/releases through their domain commands. Do not expose a general `/wallet/adjust` or client-selected ledger type.

## Invariants

- Balance and held never become negative.
- A task hold is task-scoped and idempotent.
- Release/refund cannot both apply twice to one hold.
- Ledger is append-only audit history.
- Cancellation status and refund are one transaction.
- Rating/tip record and both wallet movements are one transaction.
- Each shared member has an independent hold; group offer requires both.
- Android never updates a displayed balance optimistically as final.

## ViewModel and cache

`WalletViewModel` observes cached wallet projection and paginated entries, refreshes on wallet realtime invalidation, and tracks one top-up command. `EarningsViewModel` uses the server total, not a local page sum. Cache entries are user-scoped; amounts are `Long`.

State includes `content`, `isRefreshing`, `isLoadingMore`, `pendingCommand`, `staleSince`, `offline`, and `error`. After a command timeout, retry/query with the same key. Do not offer a second key until the first command is resolved.

## Errors

- Invalid amount: field error.
- Insufficient balance for tip: preserve rating draft and offer simulated top-up/back action.
- Already held/released/rated: map idempotent prior result or refresh conflict.
- Task changed: refresh detail; never issue a compensating client transaction.
- Offline: read stale ledger if available, but top-up/fund/review commands require confirmed connectivity.
- Server failure: show request ID and retain idempotency key.

## Security

- `/wallet` and `/earnings` derive user from bearer token.
- Buyers cannot read runner wallet; runners cannot read buyer balance.
- Service-role money functions remain server-only.
- Redact balances only where logs/analytics do not need them; never log full ledger payloads or idempotency keys with user content.
- Android backup policy must not leak wallet cache/session material.

## File plan

```text
feature/wallet/
  data/WalletApi.kt
  data/WalletRepositoryImpl.kt
  domain/Money.kt
  domain/Wallet.kt
  domain/LedgerEntry.kt
  presentation/WalletViewModel.kt
  presentation/WalletScreen.kt
  presentation/TopUpSheet.kt
  presentation/EarningsViewModel.kt
  presentation/EarningsScreen.kt
```

## Tests

- Decimal/pesewa parsing, overflow, rounding rejection, and formatting.
- Idempotent top-up/hold/release/refund after timeout/double tap.
- Atomic cancellation refund and rate/tip transfers.
- Shared group requires two independent holds.
- Earnings total is server-provided; fee and tip labels are correct.
- Simulated-money disclosure is present in wallet, top-up, and escrow confirmation.
- Authorization prevents cross-user wallet access.

## Done criteria

- Money is exact and every mutation is authoritative, atomic, and retry-safe.
- No screen or copy suggests real funds, cash-out, or buyer savings that do not exist.
