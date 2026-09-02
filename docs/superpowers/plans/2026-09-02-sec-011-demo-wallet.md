# SEC-011 Demo Wallet Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve Mélange's simulated transaction lifecycle while replacing arbitrary and automatic credits with one database-enforced GHS 1,000 demo allocation and a deliberate rating-and-tip interaction.

**Architecture:** PostgreSQL remains authoritative for every demo-credit mutation. A profile trigger grants one initial allocation, matching spends only existing credits, and rating/release/tip commits atomically; the Next.js application only requests those operations and consistently identifies their results as non-redeemable simulation data.

**Tech Stack:** Next.js 16 App Router, React 19 server actions and client components, TypeScript, Supabase/PostgreSQL PL/pgSQL and RLS, Vitest, ESLint.

**Spec:** `docs/superpowers/specs/2026-09-02-sec-011-demo-wallet-design.md`

## Global Constraints

- Every existing and future profile receives one GHS 1,000.00 demo-credit allocation.
- No browser input, application action, matching function, or retry may mint additional credits.
- Demo credits cannot be deposited, withdrawn, cashed out, or redeemed.
- Preserve profiles, errands, ratings, and non-wallet application data during the wallet reset.
- Preserve unsettled legacy holds while clearing settled wallet history.
- Use `Demo GHS`, `Demo credits`, and `Simulation only—no real funds can be deposited, withdrawn, or redeemed.` on monetary surfaces.
- Keep wallet and ledger writes unavailable to `anon` and `authenticated` roles.
- A real payment path cannot be enabled by an environment flag; it requires a separate future design.
- Do not stage or modify the unrelated `.superpowers/` directory.
- Supply the complete `0049` SQL to the user after implementation, before deployment.

---

## File structure

- Create `supabase/migrations/0049_demo_wallet_safety.sql`: atomic wallet reset, one-time provisioning trigger, no-shortfall funding, demo references, and atomic release/rating/tip.
- Create `src/lib/server/__tests__/demo-wallet-migration.test.ts`: static migration security and invariant contract.
- Modify `scripts/verify-migrations.sh`: exercise real PostgreSQL allocation, permissions, insufficient funds, legacy hold reconstruction, and transaction invariants.
- Create `src/lib/demo-money.ts`: shared constants, formatting, exact tip parsing, and safe public error mapping.
- Create `src/lib/__tests__/demo-money.test.ts`: unit tests for formatting, parsing, and error mapping.
- Modify `src/lib/server/escrow.ts`: remove arbitrary credit APIs and expose only escrow operations.
- Modify `src/app/app/actions.ts`: ignore browser payment references, remove top-ups, return funding/rating action states, clean failed direct requests, and use atomic rating RPC.
- Delete `src/app/app/wallet/top-up-form.tsx`: remove the arbitrary-credit UI.
- Modify `src/app/app/wallet/page.tsx`: show a read-only demo wallet and allocation notice.
- Modify `src/app/app/post/post-form.tsx`: remove payment-reference input, identify demo budgets, and surface direct-request funding errors.
- Create `src/app/app/errands/[id]/funding-form.tsx`: reusable ordinary/shared funding action-state UI.
- Create `src/app/app/errands/[id]/rating-tip-form.tsx`: accessible stars, preset/custom demo tip, comment, pending, and error UI.
- Create `src/app/app/__tests__/demo-money-actions.test.ts`: action source/security contracts.
- Create `src/app/app/__tests__/rating-tip-form.test.tsx`: initial rating/tip form rendering and source interaction contracts.
- Modify `src/app/app/errands/[id]/page.tsx`: use the two focused forms and demo wording.
- Modify `src/app/app/__tests__/matching-actions.test.ts`, `errand-share-actions.test.ts`, `errand-share-ui.test.ts`, and `dashboard-experience.test.ts`: update established contracts.
- Modify `src/app/app/buyer-dashboard.tsx`, `runner-dashboard.tsx`, `dashboard-widgets.tsx`, `earnings/page.tsx`, `settings/page.tsx`, and `feed/page.tsx`: qualify wallet, price, payout, and earning values as demo data.
- Modify `src/app/admin/page.tsx`, `src/lib/telegram/messaging.ts`, and `src/lib/telegram/webhook.ts`: qualify administrative and notification payment wording.
- Modify `README.md` and `docs/security-remediation-tracker.md`: document prototype-only money and close SEC-011.

---

### Task 1: Make PostgreSQL authoritative for fixed demo credits

**Files:**
- Create: `src/lib/server/__tests__/demo-wallet-migration.test.ts`
- Create: `supabase/migrations/0049_demo_wallet_safety.sql`
- Modify: `scripts/verify-migrations.sh`

**Interfaces:**
- Produces: `public.provision_demo_wallet_for_profile() returns trigger`.
- Produces: `public.fund_and_hold_task(uuid) returns void` with stable error message `demo_wallet_insufficient_credits`.
- Produces: `public.create_and_hold_direct_demo_errand(uuid, uuid, text, text, text, urgency, numeric, numeric, double precision, double precision, double precision, double precision, jsonb, text, date) returns uuid`, making direct-runner insertion and funding one transaction.
- Produces: `public.rate_and_tip(uuid, uuid, smallint, text, bigint) returns uuid`, atomically releasing an outstanding hold and applying rating/tip.
- Removes: `public.top_up_wallet(uuid, bigint)`.
- Preserves: `hold_funds`, `release_funds`, `refund_funds`, and all matching/share callers.

- [ ] **Step 1: Write the failing migration contract test**

Create a source-level test that normalizes `0049_demo_wallet_safety.sql` and asserts the security boundary:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0049_demo_wallet_safety.sql"),
  "utf8",
).replace(/\s+/g, " ").toLowerCase();

describe("SEC-011 demo wallet migration", () => {
  it("provisions one fixed allocation and removes arbitrary top-ups", () => {
    expect(sql).toContain("1000.00");
    expect(sql).toContain("function public.provision_demo_wallet_for_profile");
    expect(sql).toContain("create trigger profiles_provision_demo_wallet");
    expect(sql).toContain("ledger_demo_initial_credit_unique");
    expect(sql).toContain("drop function if exists public.top_up_wallet(uuid, bigint)");
    expect(sql).toContain("function public.create_and_hold_direct_demo_errand");
  });

  it("never manufactures a matching shortfall", () => {
    const funding = sql.slice(sql.indexOf("function public.fund_and_hold_task"));
    expect(funding).toContain("demo_wallet_insufficient_credits");
    expect(funding).toContain("perform public.hold_funds(p_task_id)");
    expect(funding).not.toContain("v_shortfall");
    expect(funding).not.toContain("set balance = balance +");
  });

  it("keeps mutations private and makes rating release and tip atomic", () => {
    expect(sql).toContain("revoke all on function public.provision_demo_wallet_for_profile()");
    expect(sql).toContain("grant execute on function public.fund_and_hold_task(uuid) to service_role");
    const rating = sql.slice(sql.indexOf("function public.rate_and_tip"));
    expect(rating).toContain("perform public.release_funds(p_task_id)");
    expect(rating).toContain("demo_wallet_insufficient_credits");
  });
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run: `npm test -- src/lib/server/__tests__/demo-wallet-migration.test.ts`

Expected: FAIL because `0049_demo_wallet_safety.sql` does not exist.

- [ ] **Step 3: Write the migration reset and allocation boundary**

Create `0049_demo_wallet_safety.sql`. Snapshot unsettled holds before clearing wallet data, then rebuild current state:

```sql
create temporary table sec011_unsettled_holds on commit drop as
select h.task_id, h.user_id, h.amount
from public.ledger_entries h
where h.type = 'hold'
  and h.task_id is not null
  and not exists (
    select 1 from public.ledger_entries settled
    where settled.task_id = h.task_id
      and settled.type in ('release', 'payout', 'refund')
  );

delete from public.ledger_entries;
delete from public.wallets;

insert into public.wallets (user_id, balance, held)
select p.id, 1000.00, coalesce(sum(h.amount), 0)
from public.profiles p
left join sec011_unsettled_holds h on h.user_id = p.id
group by p.id;

insert into public.ledger_entries (user_id, type, amount)
select id, 'topup', 1000.00 from public.profiles;

insert into public.ledger_entries (task_id, user_id, type, amount)
select task_id, user_id, 'hold', amount from sec011_unsettled_holds;

update public.tasks t
set payment_reference = 'DEMO-' || upper(substr(replace(t.id::text, '-', ''), 1, 12))
where exists (
  select 1 from sec011_unsettled_holds h where h.task_id = t.id
);

create unique index ledger_demo_initial_credit_unique
  on public.ledger_entries (user_id)
  where task_id is null and type = 'topup';
```

Define the idempotent trigger function and explicit grants:

```sql
create or replace function public.provision_demo_wallet_for_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wallets (user_id, balance, held)
  values (new.id, 1000.00, 0)
  on conflict (user_id) do nothing;

  insert into public.ledger_entries (user_id, type, amount)
  values (new.id, 'topup', 1000.00)
  on conflict (user_id) where task_id is null and type = 'topup' do nothing;
  return new;
end;
$$;

drop trigger if exists profiles_provision_demo_wallet on public.profiles;
create trigger profiles_provision_demo_wallet
after insert on public.profiles
for each row execute function public.provision_demo_wallet_for_profile();

revoke all on function public.provision_demo_wallet_for_profile()
  from public, anon, authenticated;
grant execute on function public.provision_demo_wallet_for_profile()
  to service_role;
```

Drop `top_up_wallet`. Replace `fund_and_hold_task` so it locks the task, rejects a missing/invalid status, checks the locked wallet, raises `demo_wallet_insufficient_credits`, and calls `hold_funds`. On every successful hold, set the deterministic `DEMO-` reference. Revoke execution from `public`, `anon`, and `authenticated`, then grant only `service_role`.

Replace `rate_and_tip` with the current validation and uniqueness logic plus these requirements inside the same PL/pgSQL transaction:

```sql
if v_task_status not in ('completed', 'resolved') then
  raise exception 'task is not ready for rating';
end if;
if p_tip_cents > 100000 then
  raise exception 'demo tip exceeds limit';
end if;

perform public.release_funds(p_task_id);

update public.wallets
set balance = balance - v_tip_amount
where user_id = v_buyer_id and balance >= v_tip_amount;
get diagnostics v_updated = row_count;
if v_tip_amount > 0 and v_updated = 0 then
  raise exception 'demo_wallet_insufficient_credits';
end if;
```

Keep the tip debit, runner credit, two ledger rows, and rating insert after those checks. Revoke the RPC from browser roles and grant it to `service_role`.

Add `create_and_hold_direct_demo_errand` with explicit arguments for every direct-task field currently inserted by `createErrand`: buyer ID, runner ID, title, description, category, urgency, price, fee, pickup/drop-off coordinates, stops, recurrence, and recurrence end date. The function inserts a `matched` task with the selected runner, calls `hold_funds(v_task_id)`, and returns the ID. Both statements share one transaction, so insufficient credits roll back the insertion. Revoke it from browser roles and grant it only to `service_role`.

- [ ] **Step 4: Update the PostgreSQL smoke tests**

In `scripts/verify-migrations.sh`, update old auto-top-up assertions to start from the trigger-provisioned GHS 1,000 balance. After a GHS 50 hold, assert `balance = 950`, `held = 50`, and no task-scoped `topup`. After refund, assert `balance = 1000`, `held = 0`.

Add a dedicated block that verifies:

```sql
if (select balance from public.wallets where user_id = v_buyer_id) <> 1000
   or (select count(*) from public.ledger_entries
       where user_id = v_buyer_id and task_id is null and type = 'topup') <> 1 then
  raise exception 'fixed demo allocation is incorrect';
end if;

if to_regprocedure('public.top_up_wallet(uuid,bigint)') is not null then
  raise exception 'arbitrary top_up_wallet still exists';
end if;

begin
  perform public.fund_and_hold_task(v_over_budget_task_id);
  raise exception 'insufficient demo credits were accepted';
exception
  when others then
    if sqlerrm <> 'demo_wallet_insufficient_credits' then raise; end if;
end;
```

Also assert the over-budget task has no hold, offer, task-scoped top-up, or wallet change. Insert a fresh `auth.users` row after migrations and assert its profile trigger creates exactly one wallet/allocation. Exercise a completed held task with a tip and assert release, payout, rating, tip debit, and tip credit all commit; repeat with an unaffordable tip and assert none commit.

- [ ] **Step 5: Run database tests**

Run: `npm test -- src/lib/server/__tests__/demo-wallet-migration.test.ts src/lib/server/__tests__/matching-migration.test.ts src/lib/server/__tests__/errand-share-migration.test.ts`

Expected: PASS.

Run with the established disposable PostgreSQL `DATABASE_URL`: `bash scripts/verify-migrations.sh`

Expected: every migration and smoke-test block passes.

- [ ] **Step 6: Commit the database boundary**

```bash
git add supabase/migrations/0049_demo_wallet_safety.sql scripts/verify-migrations.sh src/lib/server/__tests__/demo-wallet-migration.test.ts
git commit -m "fix: enforce fixed demo wallet credits"
```

---

### Task 2: Remove application credit and payment-reference inputs

**Files:**
- Create: `src/lib/demo-money.ts`
- Create: `src/lib/__tests__/demo-money.test.ts`
- Create: `src/app/app/__tests__/demo-money-actions.test.ts`
- Modify: `src/lib/server/escrow.ts`
- Modify: `src/app/app/actions.ts`
- Modify: `src/app/app/post/post-form.tsx`
- Modify: `src/app/app/wallet/page.tsx`
- Modify: `src/app/app/buyer-dashboard.tsx`
- Delete: `src/app/app/wallet/top-up-form.tsx`

**Interfaces:**
- Produces: `DEMO_CREDIT_ALLOCATION = 1000`, `DEMO_CURRENCY_LABEL = "Demo GHS"`, and `DEMO_MONEY_NOTICE`.
- Produces: `formatDemoMoney(amount: number | string): string`.
- Removes: `topUp(userId, amount)`, `topUpWallet(formData)`, `TopUpForm`, and browser `payment_reference` handling.

- [ ] **Step 1: Write failing constants and source-contract tests**

Test the shared module:

```ts
import { describe, expect, it } from "vitest";
import {
  DEMO_CREDIT_ALLOCATION,
  DEMO_MONEY_NOTICE,
  formatDemoMoney,
} from "../demo-money";

describe("demo money", () => {
  it("has one explicit non-redeemable allocation", () => {
    expect(DEMO_CREDIT_ALLOCATION).toBe(1000);
    expect(DEMO_MONEY_NOTICE).toContain("no real funds");
    expect(formatDemoMoney("5")).toBe("Demo GHS 5.00");
  });
});
```

In `demo-money-actions.test.ts`, read `actions.ts`, `escrow.ts`, the post form, and wallet page. Assert they contain no exported `topUpWallet`, no exported `topUp`, no `formData.get("payment_reference")`, no `name="payment_reference"`, and no `TopUpForm` import/render.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- src/lib/__tests__/demo-money.test.ts src/app/app/__tests__/demo-money-actions.test.ts`

Expected: FAIL because the module is missing and the prohibited paths remain.

- [ ] **Step 3: Add the shared demo-money module**

```ts
export const DEMO_CREDIT_ALLOCATION = 1000;
export const DEMO_CURRENCY_LABEL = "Demo GHS";
export const DEMO_MONEY_NOTICE =
  "Simulation only—no real funds can be deposited, withdrawn, or redeemed.";

export function formatDemoMoney(amount: number | string): string {
  return `${DEMO_CURRENCY_LABEL} ${Number(amount).toFixed(2)}`;
}
```

- [ ] **Step 4: Delete application minting paths**

Remove `topUp`, its comments, and its import from `escrow.ts`/`actions.ts`. Delete `topUpWallet` and `top-up-form.tsx`. Remove the payment-reference parse and both task-insert assignments in `createErrand`; explicitly omit that column rather than copying browser data.

Remove the mobile-money-reference field from `post-form.tsx`. Change the budget label and fee preview to `Demo GHS`. Add the simulation notice near the budget.

In the wallet page, remove `TopUpForm`, label the taskless `topup` row `Initial demo credits`, label the two balances `Available demo credits` and `Demo credits in escrow`, and render `DEMO_MONEY_NOTICE` where the top-up form was.

In `buyer-dashboard.tsx`, replace the `Top up` link with one `View demo wallet` link and label the card `Demo wallet balance`.

- [ ] **Step 5: Run focused and regression tests**

Run: `npm test -- src/lib/__tests__/demo-money.test.ts src/app/app/__tests__/demo-money-actions.test.ts src/app/app/__tests__/dashboard-experience.test.ts src/app/app/__tests__/matching-actions.test.ts`

Expected: PASS after updating dashboard expectations from `Top up`/plain `GHS` to the approved demo wording.

- [ ] **Step 6: Commit the removed inputs**

```bash
git add src/lib/demo-money.ts src/lib/__tests__/demo-money.test.ts src/lib/server/escrow.ts src/app/app/actions.ts src/app/app/post/post-form.tsx src/app/app/wallet/page.tsx src/app/app/wallet/top-up-form.tsx src/app/app/buyer-dashboard.tsx src/app/app/__tests__/demo-money-actions.test.ts src/app/app/__tests__/dashboard-experience.test.ts src/app/app/__tests__/matching-actions.test.ts
git commit -m "fix: remove arbitrary demo money inputs"
```

---

### Task 3: Fail funding cleanly and show actionable errors

**Files:**
- Modify: `src/lib/demo-money.ts`
- Modify: `src/lib/__tests__/demo-money.test.ts`
- Modify: `src/app/app/actions.ts`
- Modify: `src/app/app/post/post-form.tsx`
- Create: `src/app/app/errands/[id]/funding-form.tsx`
- Modify: `src/app/app/errands/[id]/page.tsx`
- Modify: `src/app/app/__tests__/demo-money-actions.test.ts`
- Modify: `src/app/app/__tests__/matching-actions.test.ts`
- Modify: `src/app/app/__tests__/errand-share-actions.test.ts`
- Modify: `src/app/app/__tests__/errand-share-ui.test.ts`

**Interfaces:**
- Produces: `DemoActionState = { error: string | null }`.
- Produces: `demoMoneyError(error: unknown): string` returning safe public copy.
- Changes: `payIntoEscrow` and `confirmSharedEscrow` to action-state-compatible signatures.
- Consumes: `create_and_hold_direct_demo_errand` for atomic direct-runner creation.
- Consumes: PostgreSQL error `demo_wallet_insufficient_credits` from Task 1.

- [ ] **Step 1: Write failing error-mapping and action-contract tests**

Add tests proving exact database details are not returned:

```ts
expect(demoMoneyError(new Error("demo_wallet_insufficient_credits")))
  .toBe("You do not have enough demo credits for this transaction.");
expect(demoMoneyError(new Error("postgres host secret detail")))
  .toBe("The demo transaction could not be completed. Please try again.");
```

Update source contracts to require `DemoActionState`, `create_and_hold_direct_demo_errand`, and the reusable `FundingForm`. Assert that the direct-runner branch no longer performs a standalone task insert followed by `holdFunds`. Require ordinary and shared funding to return mapped errors rather than leak RPC messages.

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test -- src/lib/__tests__/demo-money.test.ts src/app/app/__tests__/demo-money-actions.test.ts src/app/app/__tests__/matching-actions.test.ts src/app/app/__tests__/errand-share-actions.test.ts src/app/app/__tests__/errand-share-ui.test.ts`

Expected: FAIL on missing mapper, state signatures, cleanup, and form.

- [ ] **Step 3: Add safe action state and error mapping**

Add to `demo-money.ts`:

```ts
export interface DemoActionState {
  error: string | null;
}

export function demoMoneyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("demo_wallet_insufficient_credits")
    ? "You do not have enough demo credits for this transaction."
    : "The demo transaction could not be completed. Please try again.";
}
```

- [ ] **Step 4: Make direct-runner creation and funding atomic**

Change `PostForm` to `useActionState(createErrand, { error: null })` and change `createErrand` to accept previous state before `FormData`. In the direct-runner branch, replace the standalone task insert, balance check, auto-credit, and hold with the service-role RPC from Task 1:

```ts
const directTaskArguments = {
  p_buyer_id: userId,
  p_runner_id: runnerId,
  p_title: title,
  p_description: description || null,
  p_category: category || null,
  p_urgency: urgency,
  p_price: price,
  p_fee: fee,
  p_pickup_lat: pickupLat,
  p_pickup_lng: pickupLng,
  p_dropoff_lat: dropoff?.lat ?? null,
  p_dropoff_lng: dropoff?.lng ?? null,
  p_stops: stops,
  p_recurrence: recurrence,
  p_recurrence_end_date: recurrenceEndDate,
};
const { data: taskId, error: directError } = await db.rpc(
  "create_and_hold_direct_demo_errand",
  directTaskArguments,
);
if (directError || !taskId) {
  return { error: demoMoneyError(directError ?? new Error("direct task was not created")) };
}
```

Construct `directTaskArguments` only from the already validated server values, using the exact RPC parameter names defined in Task 1. Notify the runner only after the RPC succeeds. Render `state.error` with `role="alert"` above the submit button. Do not catch `redirect()` or successful control flow.

- [ ] **Step 5: Add the reusable funding form**

Create a client component accepting an action and label:

```tsx
interface FundingFormProps {
  action: (state: DemoActionState, formData: FormData) => Promise<DemoActionState>;
  children: React.ReactNode;
}

export function FundingForm({ action, children }: FundingFormProps) {
  const [state, dispatch, pending] = useActionState(action, { error: null });
  return (
    <form action={dispatch} className="space-y-2">
      <button type="submit" disabled={pending}>{pending ? "Processing demo credits…" : children}</button>
      {state.error ? <p role="alert">{state.error}</p> : null}
    </form>
  );
}
```

Use the existing primary-button classes in the real component. Replace ordinary and shared raw funding forms on the errand page with `FundingForm` instances bound to their task/group IDs.

- [ ] **Step 6: Return safe errors from funding actions**

Update `payIntoEscrow` and `confirmSharedEscrow` to return `{ error: null }` on no-op/success and `{ error: demoMoneyError(error) }` on funding failure. Keep authorization outside the `try` so unauthenticated/ownership failures retain existing security behavior. Revalidate only after success.

- [ ] **Step 7: Run focused tests**

Run: `npm test -- src/lib/__tests__/demo-money.test.ts src/app/app/__tests__/demo-money-actions.test.ts src/app/app/__tests__/matching-actions.test.ts src/app/app/__tests__/errand-share-actions.test.ts src/app/app/__tests__/errand-share-ui.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit clean funding failures**

```bash
git add src/lib/demo-money.ts src/lib/__tests__/demo-money.test.ts src/app/app/actions.ts src/app/app/post/post-form.tsx src/app/app/errands/[id]/funding-form.tsx src/app/app/errands/[id]/page.tsx src/app/app/__tests__/demo-money-actions.test.ts src/app/app/__tests__/matching-actions.test.ts src/app/app/__tests__/errand-share-actions.test.ts src/app/app/__tests__/errand-share-ui.test.ts
git commit -m "fix: fail demo funding without partial state"
```

---

### Task 4: Add the deliberate rating and demo-tip flow

**Files:**
- Modify: `src/lib/demo-money.ts`
- Modify: `src/lib/__tests__/demo-money.test.ts`
- Modify: `src/app/app/actions.ts`
- Create: `src/app/app/errands/[id]/rating-tip-form.tsx`
- Modify: `src/app/app/errands/[id]/page.tsx`
- Create: `src/app/app/__tests__/rating-tip-form.test.tsx`
- Modify: `src/app/app/__tests__/demo-money-actions.test.ts`

**Interfaces:**
- Produces: `parseDemoTip(raw: FormDataEntryValue | null): number`, returning integer pesewas or throwing a stable validation error.
- Changes: `rateRunner(taskId, previousState, formData): Promise<DemoActionState>`.
- Consumes: atomic `rate_and_tip` from Task 1.

- [ ] **Step 1: Write failing tip parser tests**

```ts
it.each([
  [null, 0],
  ["", 0],
  ["0", 0],
  ["5", 500],
  ["10.25", 1025],
  ["1000.00", 100000],
])("parses %p as %i pesewas", (raw, expected) => {
  expect(parseDemoTip(raw)).toBe(expected);
});

it.each(["-1", "1.001", "1000.01", "Infinity", "not-money"])(
  "rejects invalid demo tip %s",
  (raw) => expect(() => parseDemoTip(raw)).toThrow("Enter a demo tip from GHS 0 to GHS 1,000 with no more than two decimal places."),
);
```

Create a component/source test requiring five preset controls, a custom input, a hidden `stars` value, one submit control, `aria-pressed` selection, and no star `formAction`.

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test -- src/lib/__tests__/demo-money.test.ts src/app/app/__tests__/rating-tip-form.test.tsx src/app/app/__tests__/demo-money-actions.test.ts`

Expected: FAIL because parser/component and new action signature are missing.

- [ ] **Step 3: Implement exact tip parsing**

Use a decimal-string check so binary floating-point rounding cannot accept extra precision:

```ts
const DEMO_TIP_PATTERN = /^(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/;

export function parseDemoTip(raw: FormDataEntryValue | null): number {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value === "") return 0;
  if (!DEMO_TIP_PATTERN.test(value)) {
    throw new Error("Enter a demo tip from GHS 0 to GHS 1,000 with no more than two decimal places.");
  }
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (cents > 100000) {
    throw new Error("Enter a demo tip from GHS 0 to GHS 1,000 with no more than two decimal places.");
  }
  return cents;
}
```

- [ ] **Step 4: Build the rating-tip client component**

Use local `stars`, `tipChoice`, and `customTip` state. Star and preset buttons must be `type="button"`; selected controls use `aria-pressed="true"`. Submit hidden inputs named `stars` and `tip`, with the custom input taking the `tip` name only while Custom is selected. Disable submission until stars are selected and while pending. Render the exact options `No tip`, `GHS 5`, `GHS 10`, `GHS 20`, `Custom`, the optional comment, `DEMO_MONEY_NOTICE`, and `Submit rating and demo tip`.

- [ ] **Step 5: Make rating/release/tip one server action result**

Change `rateRunner` to parse `stars` and `tip` from `FormData`, validate ownership/status as before, and call only `rate_and_tip`; remove the separate `releaseFunds(taskId)` call. Return safe action-state errors. Preserve trust-score and notification work after a successful RPC, then revalidate and return `{ error: null }`.

Replace both duplicated rating forms in the errand page with:

```tsx
<RatingTipForm
  runnerName={runnerName}
  action={rateRunner.bind(null, task.id)}
/>
```

- [ ] **Step 6: Run rating and escrow regression tests**

Run: `npm test -- src/lib/__tests__/demo-money.test.ts src/app/app/__tests__/rating-tip-form.test.tsx src/app/app/__tests__/demo-money-actions.test.ts src/lib/algorithm/__tests__/arbitration.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the tip interaction**

```bash
git add src/lib/demo-money.ts src/lib/__tests__/demo-money.test.ts src/app/app/actions.ts src/app/app/errands/[id]/rating-tip-form.tsx src/app/app/errands/[id]/page.tsx src/app/app/__tests__/rating-tip-form.test.tsx src/app/app/__tests__/demo-money-actions.test.ts
git commit -m "feat: add explicit demo tip selection"
```

---

### Task 5: Qualify every monetary surface and close the tracker item

**Files:**
- Modify: `src/app/app/errands/[id]/page.tsx`
- Modify: `src/app/app/buyer-dashboard.tsx`
- Modify: `src/app/app/runner-dashboard.tsx`
- Modify: `src/app/app/dashboard-widgets.tsx`
- Modify: `src/app/app/earnings/page.tsx`
- Modify: `src/app/app/settings/page.tsx`
- Modify: `src/app/app/feed/page.tsx`
- Modify: `src/app/admin/page.tsx`
- Modify: `src/lib/telegram/messaging.ts`
- Modify: `src/lib/telegram/webhook.ts`
- Modify: `src/app/app/__tests__/dashboard-experience.test.ts`
- Modify: `src/app/app/__tests__/errand-share-ui.test.ts`
- Create: `src/app/app/__tests__/demo-money-copy.test.ts`
- Modify: `README.md`
- Modify: `docs/security-remediation-tracker.md`

**Interfaces:**
- Consumes: `formatDemoMoney` and `DEMO_MONEY_NOTICE` from Task 2.
- Produces: no unqualified wallet, escrow, tip, earning, or payout promise in authenticated UI/admin/Telegram copy.

- [ ] **Step 1: Write the failing copy audit test**

Read each listed TSX/Telegram file and assert the relevant approved phrases. Also assert obsolete phrases are absent:

```ts
for (const source of monetarySources) {
  expect(source).not.toMatch(/\bTop up\b/);
  expect(source).not.toContain("Mobile money reference");
}
expect(wallet).toContain("Simulation only");
expect(runnerDashboard).toContain("Demo payout");
expect(earnings).toContain("Demo earnings");
expect(tracking).toContain("Demo credits in escrow");
expect(telegramMessaging).toContain("Demo runner payout");
```

- [ ] **Step 2: Run copy tests and verify they fail**

Run: `npm test -- src/app/app/__tests__/demo-money-copy.test.ts src/app/app/__tests__/dashboard-experience.test.ts src/app/app/__tests__/errand-share-ui.test.ts`

Expected: FAIL on the old money wording.

- [ ] **Step 3: Update all monetary copy**

Use `formatDemoMoney` where a React component formats a concrete amount. Use text such as `Demo payout`, `Demo earnings`, `Demo credits in escrow`, `Confirm & use Demo GHS 50.00`, and `Initial demo credits`. Add `DEMO_MONEY_NOTICE` to wallet, post, errand details, and earnings views.

For Telegram strings, use explicit `Demo GHS` and append `Simulation only; no real funds are transferred.` to offer/payment summaries. In admin, rename the field label to `Demo transaction reference` and never describe it as proof of mobile-money payment.

- [ ] **Step 4: Update documentation and tracker**

In `README.md`, replace the simulated top-up description with the one-time allocation, no-shortfall rule, non-redeemability, and future-provider warning.

Move SEC-011 from Open to Completed in `docs/security-remediation-tracker.md` with this resolution:

```text
The prototype now grants one database-enforced GHS 1,000 demo allocation per account, removes arbitrary and automatic credits, preserves atomic simulated escrow/tips, and labels every balance as non-redeemable demo data.
```

Leave SEC-012 through SEC-014 unchanged and in order.

- [ ] **Step 5: Run copy and UI tests**

Run: `npm test -- src/app/app/__tests__/demo-money-copy.test.ts src/app/app/__tests__/dashboard-experience.test.ts src/app/app/__tests__/errand-share-ui.test.ts src/app/app/__tests__/rating-tip-form.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit copy and tracker closure**

```bash
git add src/app/app/errands/[id]/page.tsx src/app/app/buyer-dashboard.tsx src/app/app/runner-dashboard.tsx src/app/app/dashboard-widgets.tsx src/app/app/earnings/page.tsx src/app/app/settings/page.tsx src/app/app/feed/page.tsx src/app/admin/page.tsx src/lib/telegram/messaging.ts src/lib/telegram/webhook.ts src/app/app/__tests__/dashboard-experience.test.ts src/app/app/__tests__/errand-share-ui.test.ts src/app/app/__tests__/demo-money-copy.test.ts README.md docs/security-remediation-tracker.md
git commit -m "docs: identify wallet balances as demo credits"
```

---

### Task 6: Run the SEC-011 release gate and prepare operator SQL

**Files:**
- Verify: all SEC-011 files from Tasks 1–5.
- Do not modify: `.superpowers/`.

**Interfaces:**
- Produces: a verified commit range ready to push directly to `origin/main` after user authorization.
- Produces: the exact contents of `supabase/migrations/0049_demo_wallet_safety.sql` for the user to run in Supabase.

- [ ] **Step 1: Run the complete unit suite**

Run: `npm test`

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run static verification**

Run: `npm run lint`

Expected: zero errors; only already-documented pre-existing warnings may remain.

Run: `npm run typecheck`

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: successful Next.js production build.

- [ ] **Step 4: Run migration verification**

Run with the established disposable PostgreSQL `DATABASE_URL`: `bash scripts/verify-migrations.sh`

Expected: all migrations through `0049_demo_wallet_safety.sql` and every smoke test pass.

- [ ] **Step 5: Audit the final diff**

Run:

```bash
git diff --check HEAD~5..HEAD
git status --short
git log --oneline -7
```

Expected: no whitespace errors; only `.superpowers/` remains untracked; the SEC-011 design commit and implementation commits are present.

- [ ] **Step 6: Report and obtain push/deployment approval**

Provide the test totals, commit hashes, migration warning, and complete `0049_demo_wallet_safety.sql`. Ask the user to run the SQL in Supabase and report success before pushing/deploying application code, unless they explicitly choose the opposite order.
