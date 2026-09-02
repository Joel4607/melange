# SEC-011: Demo Wallet Safety Boundary

Date: 2026-09-02

## Status

Approved design. This specification covers SEC-011 only.

## Context

Mélange is a prototype that demonstrates an errand marketplace. Its wallet,
escrow, refund, payout, and tip flows simulate transactions; they do not move
real money. The current implementation does not make that boundary strong
enough:

- A signed-in user can add an arbitrary wallet amount through the top-up form.
- Matching functions automatically credit any shortfall before placing a hold.
- A buyer can enter an unverified payment reference while posting an errand.
- Several screens describe balances and payouts as GHS without consistently
  saying that they are simulated and non-redeemable.

These behaviours would be unsafe if anyone treated a displayed balance as real
money. SEC-011 will preserve the prototype transaction flow while making demo
credits a clearly isolated, database-enforced simulation.

## Goals

- Give every account one fixed GHS 1,000 demo-credit allocation.
- Preserve the complete simulated hold, release, refund, payout, dispute, and
  tip lifecycle.
- Remove every user-controlled or automatic arbitrary-credit path.
- Make insufficient demo credits fail without a partial financial or matching
  transition.
- Clearly identify all displayed money as simulated and non-redeemable.
- Replace the current rating form with an explicit star-and-tip submission
  flow.
- Reset existing displayed wallet balances and transaction history without
  deleting profiles, errands, ratings, or other application records.
- Keep the design unable to become a real-money system through a configuration
  change alone.

## Non-goals

- Integrating a payment provider, checkout, webhook, bank, or mobile-money
  transfer.
- Supporting deposits, withdrawals, cash-out, redemption, or real payouts.
- Designing a future provider-neutral payment abstraction.
- Changing pricing, platform-fee calculations, matching rankings, or dispute
  policy except where required to keep demo-credit mutations consistent.

## Chosen approach

Use an explicit demo-credit mode enforced by PostgreSQL and reflected in the
application language. The database owns allocation and balance invariants. The
application may request holds, releases, refunds, and tips, but it may not mint
credits.

The alternatives were rejected:

- UI-only restrictions leave callable server and database credit paths behind.
- A fake implementation of a future provider interface adds complexity before
  a provider and its verified event model have been selected.

## Database design

### Fixed allocation

The next migration will define the allocation as GHS 1,000.00 and provision one
wallet for every profile. A `profiles` `after insert` trigger will provision new
accounts. Its security-definer function will:

1. Insert a wallet with a GHS 1,000.00 available balance.
2. Insert one taskless `topup` ledger row representing the initial demo
   allocation.
3. Do nothing if the account has already been provisioned.

A partial unique index on taskless `topup` rows per user will enforce that an
account cannot receive a second initial allocation. The trigger function and
all mutation functions remain unavailable to `anon` and `authenticated`; only
the trigger owner and `service_role` may execute the required operations.

The existing `topup` enum value remains as the internal representation of the
single initial allocation. In user-facing text it is called "Initial demo
credits," never a deposit or real top-up.

### Reset and legacy task consistency

The migration will take a transaction-local snapshot of every unsettled hold:
a task with a `hold` entry and no `release`, `payout`, or `refund` entry. It will
then clear wallets and ledger entries, provision each existing profile with a
fresh GHS 1,000.00 available balance, and recreate the snapshot's hold entries
and corresponding `wallets.held` totals.

Reconstructed holds are legacy commitments in addition to the fresh available
allocation. This explicit exception preserves active errand state without
changing task rows. Settled historical transactions disappear from the wallet
view as approved for this prototype reset.

The migration must be atomic. Any invalid snapshot or failed reconstruction
rolls back the entire reset.

### Removing credit creation

- Drop `public.top_up_wallet(uuid, bigint)` after removing its application
  caller.
- Rewrite `public.fund_and_hold_task(uuid)` so it locks the task and wallet and
  delegates to `hold_funds` without inserting a shortfall `topup` entry.
- A balance below the task price raises a stable insufficient-demo-credits
  error. It does not alter the task, wallet, ledger, match run, or offer.
- Retain the atomic and idempotent `hold_funds`, `release_funds`,
  `refund_funds`, cancellation/refund, and `rate_and_tip` operations.
- Keep wallet and ledger client access read-only through RLS.

Legitimate simulated payouts and tips may raise a runner's balance above GHS
1,000. The cap applies to minted initial credits, not to credits transferred
through recorded demo transactions.

### Demo references

The application will no longer accept `payment_reference` from form data. When
a hold succeeds, trusted database code will populate the existing column with
a deterministic `DEMO-` reference derived from the task identifier. The
column remains for schema compatibility, but no value supplied by a browser is
stored as proof of payment.

## Application design

### Shared language

A small server/client-safe module will centralize:

- the GHS 1,000 allocation;
- the `Demo GHS` currency label; and
- the warning: "Simulation only—no real funds can be deposited, withdrawn, or
  redeemed."

Wallets, dashboards, runner earnings, errand details, posting/payment controls,
tips, and transaction labels will use this language. Existing product wording
may continue to say "escrow" and "payout" only when visibly qualified as demo
credits.

### Wallet and funding

- Remove `TopUpForm`, `topUpWallet`, and the server `topUp` helper.
- Replace the wallet top-up area with the persistent simulation notice and a
  description of the one-time allocation.
- Show `Initial demo credits` for the taskless `topup` ledger entry.
- Do not expose withdrawal or redemption controls.
- Remove the payment-reference input from the post form and ignore forged
  `payment_reference` form fields in the server action.

Automatic and shared matching continue to use their existing transactional
fund-and-hold entry points. Those entry points now require sufficient existing
demo credits. A direct-runner post that is inserted immediately before a hold
failure must be removed before returning the error, because no notification or
runner offer has yet been created. Ordinary unfunded posts may remain posted;
an attempted payment that lacks credits makes no matching transition.

Funding controls will display a specific inline insufficient-credit message,
including the buyer's available demo balance when it can be read safely. Other
database errors use a generic retry message and are logged server-side without
exposing database details.

## Rating and tip interaction

The duplicated rating markup on completed and resolved errands will become one
focused client component. Its flow is:

1. Select one through five stars. Star selection does not submit.
2. Optionally enter a comment.
3. Choose `No tip`, `GHS 5`, `GHS 10`, `GHS 20`, or `Custom`.
4. Show a numeric input only for `Custom`.
5. Show the selected demo tip and a simulation label.
6. Submit once with `Submit rating and demo tip`.

The form will support keyboard navigation, accessible labels, a disabled
pending state, and an inline action result. The server action will parse stars
from submitted form data rather than from the button that was clicked.

The server will convert the tip to integer pesewas and require:

- an integer star value from 1 through 5;
- a finite tip with no more than two decimal places;
- a non-negative tip no greater than GHS 1,000; and
- sufficient available demo credits.

`rate_and_tip` will become the atomic authority for releasing any outstanding
hold, inserting the rating, and moving the optional tip in one database
transaction. The TypeScript action will no longer release funds in a separate
call. The rating uniqueness constraint and idempotent release logic prevent a
repeated rating, release, or tip.

## Error and consistency rules

- Insufficient credits never create a hold, runner offer, release, rating, or
  tip as part of the attempted operation.
- A failed direct-runner hold never leaves a visible matched task behind.
- A refund cannot follow a release; a release cannot follow a refund.
- A hold, release, refund, or tip retry must be idempotent.
- Decimal input is normalized to integer pesewas before an RPC call.
- Browser-supplied user IDs, balances, references, and ledger types are never
  trusted.
- Missing demo-wallet provisioning fails closed rather than minting an
  action-specific shortfall.
- No environment variable or feature flag can reinterpret demo balances as
  redeemable money.

## Verification

### Migration verification

Extend the migration smoke test to prove:

- existing and newly inserted profiles receive one GHS 1,000 allocation;
- concurrent/repeated provisioning cannot create a second allocation;
- `top_up_wallet` is absent;
- `fund_and_hold_task` succeeds with sufficient credits and fails without
  changing state when credits are insufficient;
- no task-scoped automatic `topup` is created;
- reconstructed unsettled holds retain their task linkage and wallet held
  totals;
- settled legacy history is removed; and
- hold, release, refund, cancellation, and tip ledger invariants still balance;
  and
- rating, release, and tip either commit together or all roll back.

### Application tests

Add or update tests for:

- absence of top-up actions and UI;
- rejection/ignoring of a forged payment reference;
- cleanup after a direct-runner hold failure;
- mapped insufficient-credit errors in ordinary and shared funding;
- star selection without immediate submission;
- every preset, custom, and no-tip path;
- malformed, over-precision, negative, over-limit, duplicate, and
  insufficient-balance tips;
- pending and accessible form states; and
- simulation labels on every user-facing monetary surface.

Run the full unit suite, migration verifier, lint, TypeScript checking, and the
production build before committing the implementation.

## Deployment and handoff

This change requires a Supabase migration. Provide the complete migration SQL
to the operator after the implementation commit is ready. The application code
must not be deployed against an older database schema because it will expect
the fixed-allocation and no-shortfall behaviour.

The migration resets prototype wallet state and is intentionally irreversible
through the UI. Repository rollback can restore code, but restoring old demo
wallet history would require a database backup.

Before real payments are introduced, a separate security design must define a
provider, verified webhook events, idempotency keys, reconciliation, refunds,
payout authorization, and a real double-entry ledger. The demo wallet must not
be reused as that ledger.
