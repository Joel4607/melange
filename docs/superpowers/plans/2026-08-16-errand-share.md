# Errand-Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically pair compatible Today and Whenever errands before runner matching, expose each pair as one runner opportunity, preserve independent buyer/escrow/completion rights, and produce defensible simulated and real-outcome evidence.

**Architecture:** A pure deterministic algorithm evaluates and ranks two-errand routes. A server orchestration layer loads candidates and delegates atomic state transitions to a new migration, while the existing matcher remains the source of runner ranking. Share groups have separate matching telemetry, child tasks retain their existing lifecycle, and an authenticated scheduled sweep releases expired single errands into fresh ordinary matching.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Supabase/PostgreSQL, Vitest 4, ESLint 9

**Spec:** `docs/superpowers/specs/2026-08-16-errand-share-design.md`

## Global Constraints

- ASAP Express and manually selected-runner errands bypass sharing.
- Today waits at most 10 minutes; Whenever waits at most 30 minutes.
- Today and Whenever may pair only when the shared route meets the Today deadline.
- Version one pairs exactly two errands from different buyers and excludes custom-stop errands.
- Pickup separation is at most 1.0 km; drop-off separation is at most 2.0 km.
- Each carried-route detour is at most 20 percent and at most 2.0 km.
- The route must save positive distance versus two direct trips.
- Pair first, then match the group as one opportunity.
- Preserve child-task status, escrow, proof, rating, cancellation, and dispute records.
- Do not modify buyer `price` or `fee`; do not claim buyer cash savings.
- Label all deterministic evaluation results simulated until real outcomes validate them.
- Keep matching eligibility, trust, fraud, presence, and ranking in the existing matching module.
- Deliver the complete feature in one pull request; do not include unrelated refactoring.

---

### Task 1: Pure deterministic pairing and route engine

**Files:**
- Create: `src/lib/algorithm/errand-share.ts`
- Create: `src/lib/algorithm/__tests__/errand-share.test.ts`
- Modify: `src/lib/algorithm/index.ts`

**Interfaces:**
- Consumes: `GeoPoint`, `Urgency`, and `haversineKm` from the existing algorithm package.
- Produces:

```ts
export type ShareRejectionReason =
  | "ineligible_urgency"
  | "manual_runner"
  | "not_waiting"
  | "same_buyer"
  | "custom_stops"
  | "window_expired"
  | "pickup_too_far"
  | "dropoff_too_far"
  | "no_distance_saving"
  | "detour_ratio_exceeded"
  | "detour_distance_exceeded"
  | "deadline_missed";

export interface ShareTask {
  id: string;
  buyerId: string;
  urgency: Urgency;
  pickup: GeoPoint;
  dropoff: GeoPoint;
  category?: string;
  createdAt: number;
  windowEndsAt: number;
  deadlineAt: number | null;
  status: "posted" | "matched" | "accepted" | "in_progress" | "completed" | "disputed" | "resolved" | "cancelled";
  selectedRunnerId: string | null;
  shareState: "ineligible" | "waiting" | "paired" | "released";
  manualRunner: boolean;
  stopCount: number;
}

export interface ErrandShareConfig {
  algorithmVersion: "errand-share-v1";
  configVersion: "accra-v1";
  windowMinutes: { normal: 10; low: 30 };
  maxPickupSeparationKm: 1;
  maxDropoffSeparationKm: 2;
  maxDetourRatio: 0.2;
  maxDetourKm: 2;
  minimumDirectDistanceForRatioKm: 0.1;
  assumedTravelSpeedKmh: 20;
  serviceMinutesPerStop: 5;
  matchingBufferMinutes: 30;
  maxCandidates: 50;
}

export interface ShareRouteStop {
  taskId: string;
  kind: "pickup" | "dropoff";
  point: GeoPoint;
}

export interface ShareDecisionMetrics {
  pickupSeparationKm: number;
  dropoffSeparationKm: number;
  soloDistanceKm: number;
  sharedDistanceKm: number;
  savedDistanceKm: number;
  taskMetrics: Record<string, {
    directDistanceKm: number;
    carriedDistanceKm: number;
    detourKm: number;
    detourRatio: number | null;
    predictedCompletionAt: number;
  }>;
}

export type ShareDecision =
  | { accepted: true; taskIds: [string, string]; route: ShareRouteStop[]; stricterDeadlineAt: number | null; metrics: ShareDecisionMetrics }
  | { accepted: false; taskIds: [string, string]; reason: ShareRejectionReason };

export const DEFAULT_ERRAND_SHARE_CONFIG: ErrandShareConfig;
export function shareWindowEndsAt(createdAt: number, urgency: Urgency, config?: ErrandShareConfig): number | null;
export function todayDeadlineAt(createdAt: number): number;
export function evaluateSharePair(a: ShareTask, b: ShareTask, now: number, config?: ErrandShareConfig): ShareDecision;
export function rankSharePartners(newTask: ShareTask, candidates: ShareTask[], now: number, config?: ErrandShareConfig): ShareDecision[];
```

- [ ] **Step 1: Write the failing pure-algorithm tests**

Create tests with fixed Accra-area coordinates and timestamps. The suite must include these named cases:

```ts
it("enumerates only routes where each pickup precedes its dropoff", () => {});
it("accepts a feasible Today and Whenever pair under the Today deadline", () => {});
it("rejects Express, manual-runner, custom-stop, same-buyer, non-waiting and expired tasks", () => {});
it("enforces pickup and dropoff radii at their exact boundaries", () => {});
it("rejects proportional and absolute detour violations independently", () => {});
it("uses only the absolute cap below the 0.1 km ratio floor", () => {});
it("rejects routes with no positive distance saving", () => {});
it("rejects a route that misses the stricter deadline after service and matching buffers", () => {});
it("ranks by saving, then creation time, then stable task id", () => {});
it("returns the same route and metrics for repeated evaluation", () => {});
it("rejects invalid non-versioned or non-positive configuration", () => {});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run src/lib/algorithm/__tests__/errand-share.test.ts
```

Expected: FAIL because `@/lib/algorithm/errand-share` does not exist.

- [ ] **Step 3: Implement configuration validation and time helpers**

Implement `DEFAULT_ERRAND_SHARE_CONFIG`, `shareWindowEndsAt`, and
`todayDeadlineAt`. Use `Intl.DateTimeFormat` with `Africa/Accra` to derive the
posting calendar date; construct the deadline at 23:59:59.999Z because Accra is
UTC year-round. Return `null` for Express sharing windows.

- [ ] **Step 4: Implement exact precedence-preserving route enumeration**

Generate all permutations of the four stops, retain only routes whose pickup
index is lower than its matching drop-off index, calculate segment distances
with `haversineKm`, and derive carried distance from the route slice beginning
at each pickup and ending at its drop-off.

- [ ] **Step 5: Implement hard constraints and stable rejection reasons**

Apply eligibility before geometry, geometry before detour, and detour before
deadline. Return the first rejection in this stable order so telemetry and
tests are deterministic.

- [ ] **Step 6: Implement deterministic partner ranking**

Evaluate at most `config.maxCandidates` candidates after sorting by
`createdAt`, then task ID. Return accepted decisions before rejected decisions;
accepted decisions sort by saved kilometres descending, candidate creation
time ascending, then candidate ID ascending.

- [ ] **Step 7: Export the module and verify GREEN**

Add `export * from "./errand-share";` to `src/lib/algorithm/index.ts`, then run:

```bash
npx vitest run src/lib/algorithm/__tests__/errand-share.test.ts src/lib/algorithm/__tests__/matching.test.ts
```

Expected: both files pass with no warnings.

- [ ] **Step 8: Commit the pure engine**

```bash
git add src/lib/algorithm/errand-share.ts src/lib/algorithm/__tests__/errand-share.test.ts src/lib/algorithm/index.ts
git commit -m "feat: add deterministic errand sharing"
```

---

### Task 2: Extend runner matching for one multi-capability opportunity

**Files:**
- Modify: `src/lib/algorithm/types.ts`
- Modify: `src/lib/algorithm/matching.ts`
- Modify: `src/lib/algorithm/__tests__/matching.test.ts`

**Interfaces:**
- Consumes: existing `rankRunners()` and `TaskRequest`.
- Produces the backward-compatible additions:

```ts
export interface TaskRequest {
  pickup: GeoPoint;
  category?: string;
  requiredCapabilities?: string[];
  loadUnits?: number;
  urgency: Urgency;
}
```

- [ ] **Step 1: Add failing matcher tests**

Add tests asserting that a runner must contain every value in
`requiredCapabilities`, empty/omitted runner capabilities still mean any, and
`loadUnits: 2` reduces the capacity component relative to `loadUnits: 1`.
Also assert that all legacy single-task fixtures retain their exact ordering.

- [ ] **Step 2: Run the matcher test and verify RED**

Run `npx vitest run src/lib/algorithm/__tests__/matching.test.ts`.

Expected: FAIL because `requiredCapabilities` and `loadUnits` are ignored.

- [ ] **Step 3: Implement capability-union eligibility**

Use `task.requiredCapabilities` when present; otherwise use the existing
single `task.category`. Reject a candidate with a non-empty capability list
unless it contains every required value.

- [ ] **Step 4: Implement load-unit capacity without changing legacy results**

Use `const loadUnits = task.loadUnits ?? 1` and calculate capacity as
`1 / (loadUnits + candidate.activeLoad)`. This equals the current
`1 / (1 + activeLoad)` for all legacy requests.

- [ ] **Step 5: Run focused and evaluation tests**

```bash
npx vitest run src/lib/algorithm/__tests__/matching.test.ts src/lib/algorithm/matching-evaluation/__tests__
```

Expected: PASS with unchanged single-task evaluation behavior.

- [ ] **Step 6: Commit matcher reuse support**

```bash
git add src/lib/algorithm/types.ts src/lib/algorithm/matching.ts src/lib/algorithm/__tests__/matching.test.ts
git commit -m "feat: support shared match requests"
```

---

### Task 3: Add the atomic Errand-Share database model and RPCs

**Files:**
- Create: `supabase/migrations/0046_errand_share.sql`
- Create: `src/lib/server/__tests__/errand-share-migration.test.ts`
- Modify: `scripts/verify-migrations.sh`
- Modify: `src/lib/server/rows.ts`

**Interfaces:**
- Produces these service-role RPCs:

```sql
public.create_errand_share_group(uuid, uuid, jsonb)
  -> table(status text, group_id uuid)
public.finalize_share_match_run(uuid, text, text, text, jsonb, jsonb, uuid)
  -> table(status text, run_id uuid)
public.confirm_share_funding(uuid, uuid, uuid)
  -> table(status text, ready boolean)
public.offer_next_share_candidate(uuid, boolean)
  -> table(status text, offered_runner_id uuid, run_id uuid)
public.decline_and_offer_next_share_candidate(uuid, uuid)
  -> table(status text, offered_runner_id uuid, run_id uuid)
public.accept_share_offer(uuid, uuid)
  -> table(status text)
public.start_share_group(uuid, uuid)
  -> table(status text)
public.complete_share_member(uuid, uuid, timestamptz)
  -> table(status text, group_completed boolean)
public.dissolve_share_group_for_cancellation(uuid, uuid)
  -> table(status text, surviving_task_id uuid, surviving_share_state text)
public.cancel_share_group_by_runner(uuid, uuid)
  -> table(status text, buyer_ids uuid[])
public.expire_due_errand_share_groups(integer)
  -> table(group_id uuid, task_ids uuid[], task_share_states text[])
public.claim_due_errand_share_tasks(integer)
  -> table(task_id uuid)
```

- [ ] **Step 1: Add a source-level failing migration contract test**

The test must read `0046_errand_share.sql`, normalize whitespace/lowercase,
and assert every table, RLS policy, index, lock, RPC, revoke, and service-role
grant listed in this task. Run it and confirm RED because the migration is
missing.

- [ ] **Step 2: Create task sharing fields and constrained group tables**

Add text checks for `share_state` and group status instead of altering the
existing task-status enum. Add:

```sql
alter table public.tasks
  add column share_state text not null default 'ineligible'
    check (share_state in ('ineligible','waiting','paired','released')),
  add column share_window_ends_at timestamptz,
  add column share_released_at timestamptz,
  add column share_group_id uuid,
  add column delivery_deadline_at timestamptz;
```

Create `errand_share_groups`, `errand_share_members`,
`errand_share_decisions`, `errand_share_match_runs`,
`errand_share_match_candidates`, and `errand_share_match_outcomes` with the
columns and timestamps in the design. Add the `tasks.share_group_id` foreign
key after the group table exists. Preserve historical memberships while the
nullable task pointer identifies the current group.

- [ ] **Step 3: Add indexes, two-member enforcement, and RLS**

Index waiting tasks on `(share_state, share_window_ends_at, created_at)`, group
status/deadline, membership task/group IDs, match candidate rank, and outcome
runner/time. Use a deferred constraint trigger to require exactly two members
before commit for every non-dissolved group. RLS allows a buyer through their
member task, the selected runner after assignment, or `public.is_admin()`.
Decision telemetry is admin/service-role readable only.

- [ ] **Step 4: Implement atomic pair creation**

`create_errand_share_group` must sort and lock both task IDs, reject identical
or stale tasks, recheck different buyers, posted/unassigned/waiting/current
window/current-group conditions, insert one group and two members from the
decision JSON, set both tasks to `share_state='paired'`, and return
`created`. Return `conflict` without mutation on stale state.

- [ ] **Step 5: Implement group match finalization and offer rotation**

Persist one run and ranked candidates. A non-empty run changes group status to
`awaiting_funding` and both posted tasks to `matched`; an empty run leaves them
posted. Offer and decline RPCs lock the group, assign/clear the same runner on
both tasks, persist one group outcome, rotate ranks, and reopen the group when
exhausted.

- [ ] **Step 6: Implement funding, acceptance, start, and completion RPCs**

Funding verifies the caller owns the member task, calls
`fund_and_hold_task(task_id)`, stamps that member once, and reports ready only
when both members are funded. Acceptance assigns the same runner and timestamp
to both matched tasks. Start changes both accepted tasks to `in_progress`.
Member completion stamps one member; after both member tasks are completed it
changes the group to `completed`.

- [ ] **Step 7: Implement dissolution and due-window claiming**

Before runner acceptance, cancellation locks the group, dissolves it, clears
the current-group pointer on both tasks, and sets the surviving posted/matched
task to `waiting` only if its original window remains, otherwise `released`.
Runner cancellation after acceptance atomically cancels/refunds both assigned
tasks, dissolves the group, and returns both buyer IDs for safe notifications.
`expire_due_errand_share_groups` uses `FOR UPDATE SKIP LOCKED` to dissolve
groups whose funding confirmation deadline has expired, clear current pointers,
and return each surviving task's recomputed waiting/released state.
`claim_due_errand_share_tasks` uses `FOR UPDATE SKIP LOCKED`, changes due
waiting tasks to released once, and returns at most the requested positive
limit.

- [ ] **Step 8: Lock down function privileges**

Revoke all new mutation RPCs from `public`, `anon`, and `authenticated`; grant
execute only to `service_role`. Keep ordinary authenticated access through
RLS-backed reads and server actions.

- [ ] **Step 9: Extend migration smoke coverage**

Append a smoke block that creates two buyers/tasks, creates one group, proves a
concurrent/stale second group is rejected, finalizes/rotates one group match,
funds both tasks idempotently, accepts/starts/completes both members, and proves
the group completes only after the second task. Add separate expired task and
funding-timeout cases and prove repeated claim/expiry calls return each once.

- [ ] **Step 10: Run migration tests**

```bash
npx vitest run src/lib/server/__tests__/errand-share-migration.test.ts src/lib/server/__tests__/matching-migration.test.ts
```

Expected: PASS. If Docker/Postgres is available, also run the repository's
migration verification command used by CI.

- [ ] **Step 11: Add row types and commit**

Add `ShareState`, `ShareGroupStatus`, `ErrandShareGroupRow`,
`ErrandShareMemberRow`, and sharing fields on `TaskRow`, then commit:

```bash
git add supabase/migrations/0046_errand_share.sql scripts/verify-migrations.sh src/lib/server/rows.ts src/lib/server/__tests__/errand-share-migration.test.ts
git commit -m "feat: persist atomic errand share groups"
```

---

### Task 4: Build server orchestration, group matching, and scheduled release

**Files:**
- Create: `src/lib/server/errand-share.ts`
- Create: `src/lib/server/__tests__/errand-share.test.ts`
- Create: `src/app/api/internal/errand-share/sweep/route.ts`
- Create: `src/app/api/internal/errand-share/sweep/__tests__/route.test.ts`
- Modify: `src/lib/server/matching.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces:

```ts
export async function enqueueOrPairErrand(taskId: string, now?: Date): Promise<{ status: "waiting" | "paired" | "released"; groupId: string | null }>;
export async function generateShareMatchRun(groupId: string, source?: "automatic" | "manual" | "self_claim"): Promise<MatchRunOutcome>;
export async function confirmShareFunding(groupId: string, taskId: string, buyerId: string): Promise<{ ready: boolean }>;
export async function offerShareToTopCandidate(groupId: string): Promise<OfferMatchRow>;
export async function finalizeShareSelfClaim(groupId: string, runnerId: string): Promise<MatchRunOutcome>;
export async function processDueShareWindows(limit?: number, now?: Date): Promise<{ claimed: number; matched: number; failed: number }>;
export async function syncShareMemberCompletion(taskId: string, completedAt: Date): Promise<boolean>;
export async function cancelShareGroupByRunner(groupId: string, runnerId: string): Promise<{ buyerIds: string[] }>;
```

- [ ] **Step 1: Write failing orchestration tests with injected dependencies**

Test Express/manual bypass, waiting insert, best-candidate conflict fallback,
decision telemetry, paired notifications without private payloads, group
request capability union/load two/stricter urgency, no-candidate posted state,
funding-timeout dissolution, due release idempotency, bounded limit 25, and
match failure preserving posted state. Mocks may represent Supabase/network
boundaries; assertions must target returned state and RPC arguments rather than
mock call counts alone.

- [ ] **Step 2: Run orchestration tests and verify RED**

Run `npx vitest run src/lib/server/__tests__/errand-share.test.ts`.

Expected: FAIL because the orchestration module does not exist.

- [ ] **Step 3: Extract reusable runner snapshot loading from matching**

Move the existing task-independent runner resolution/trust/fraud loading into
an exported internal helper that accepts `{ buyerIds: string[]; pickup;
urgency; requiredCapabilities; loadUnits }`. Keep `generateMatchRun` behavior
and tests unchanged, then use the same helper for group matching.

- [ ] **Step 4: Implement enqueue and atomic candidate fallback**

Load the new task and at most 50 oldest waiting candidates, convert rows to
`ShareTask`, call `rankSharePartners`, insert a decision row for every result,
and invoke `create_errand_share_group` for accepted results until one returns
`created`. Notify both buyers with `{ task_id, share_group_id }` only.

- [ ] **Step 5: Implement group matching and self-claim**

Load both member tasks, build one match request from the first route pickup,
the stricter urgency, `requiredCapabilities` as a sorted unique category list,
and `loadUnits: 2`, then call the shared runner snapshot/ranker and the group
RPC. Self-claim ranks only the claiming runner and rejects owners or runners
missing either capability.

- [ ] **Step 6: Implement funding/offer and completion wrappers**

Wrap the corresponding RPCs, validate response states, and send offer,
funding-ready, member-delivered, and group-completed notifications with safe
payloads.

- [ ] **Step 7: Implement due-window processing**

First call `expire_due_errand_share_groups(25)`, notify both buyers, and route
each surviving task according to the returned waiting/released state. Then call
`claim_due_errand_share_tasks(25)`. For every released ID call fresh
`generateMatchRun(taskId, "automatic")`. Count failures without throwing the
batch; the released posted task remains claimable/rematchable.

- [ ] **Step 8: Add and test the protected sweep route**

`GET` must require `Authorization: Bearer ${ERRAND_SHARE_CRON_SECRET}`, compare
the presented and configured secrets with `timingSafeEqual` after equal-length
buffer checks, reject missing configuration with 503, reject invalid auth with
401, call `processDueShareWindows(25)`, and return its JSON counts.

- [ ] **Step 9: Run focused tests and commit**

```bash
npx vitest run src/lib/server/__tests__/errand-share.test.ts src/app/api/internal/errand-share/sweep/__tests__/route.test.ts src/lib/server/__tests__/matching-outcome.test.ts
git add src/lib/server/errand-share.ts src/lib/server/__tests__/errand-share.test.ts src/app/api/internal/errand-share/sweep/route.ts src/app/api/internal/errand-share/sweep/__tests__/route.test.ts src/lib/server/matching.ts .env.example
git commit -m "feat: orchestrate shared errand matching"
```

---

### Task 5: Integrate posting, payment, runner actions, cancellation, and notifications

**Files:**
- Modify: `src/app/app/actions.ts`
- Modify: `src/lib/server/notifications.ts`
- Modify: `src/app/app/__tests__/matching-actions.test.ts`
- Create: `src/app/app/__tests__/errand-share-actions.test.ts`

**Interfaces:**
- Adds server actions:

```ts
export async function confirmSharedEscrow(groupId: string, taskId: string): Promise<void>;
export async function rematchSharedGroup(groupId: string): Promise<void>;
export async function claimSharedGroup(groupId: string): Promise<void>;
export async function acceptSharedOffer(groupId: string): Promise<void>;
export async function declineSharedOffer(groupId: string): Promise<void>;
export async function startSharedTrip(groupId: string): Promise<void>;
```

- [ ] **Step 1: Add failing source/action contract tests**

Assert `createErrand` calls `enqueueOrPairErrand` for eligible automatic posts,
still calls ordinary matching for Express/manual posts, and never both. Assert
group actions use group RPC-backed helpers rather than two independent task
updates. Assert delivery calls `syncShareMemberCompletion` after the task is
successfully completed. Assert cancellation calls the group dissolution helper
before ordinary cancellation when `share_group_id` exists. Assert runner
cancellation calls `cancelShareGroupByRunner` and does not cancel child tasks
one at a time.

- [ ] **Step 2: Run action tests and verify RED**

Run:

```bash
npx vitest run src/app/app/__tests__/errand-share-actions.test.ts src/app/app/__tests__/matching-actions.test.ts
```

Expected: FAIL because no group actions/integration exist.

- [ ] **Step 3: Add explicit notification types and safe copy**

Add `share_paired`, `share_dissolved`, `share_continuing_alone`,
`share_funding_ready`, `share_offer`, `share_accepted`,
`share_member_delivered`, and `share_completed`. Titles/bodies may use the
recipient's own `task_title`; they must not interpolate other-buyer names,
descriptions, payment references, chats, or exact locations.

- [ ] **Step 4: Integrate posting and request-time sweep fallback**

After an eligible automatic task insert, call `enqueueOrPairErrand`. Express
continues to call `generateMatchRun` immediately. Manual-runner creation stays
unchanged and ineligible. Call `processDueShareWindows(5)` best-effort from
post-related application traffic without failing the user request.

- [ ] **Step 5: Add buyer funding and group rematch actions**

Authorize membership through the caller's task, confirm only that task's hold,
and offer the group only when the helper reports both ready. Group rematch is
available only while group status is posted and the caller owns a member.

- [ ] **Step 6: Add atomic runner group actions**

Claim, accept, decline, and start operate on the group once. Acceptance adds
two active load units once; final completion removes one unit per completed
child task through the existing delivery flow.

- [ ] **Step 7: Integrate cancellation and completion**

Before runner acceptance, dissolve the group and cancel/refund the requesting
buyer task. Re-enqueue or ordinary-match the surviving task from the RPC
result. On delivery, synchronize the member and notify both buyers only when
the second member completes the group. After acceptance, runner cancellation
atomically cancels/refunds both tasks, decrements two active-load units once,
records one group outcome plus task trust/fraud evidence, and notifies both
buyers without cross-buyer details.

- [ ] **Step 8: Run focused lifecycle tests and commit**

```bash
npx vitest run src/app/app/__tests__/errand-share-actions.test.ts src/app/app/__tests__/matching-actions.test.ts src/lib/server/__tests__/matching-outcome.test.ts
git add src/app/app/actions.ts src/lib/server/notifications.ts src/app/app/__tests__/matching-actions.test.ts src/app/app/__tests__/errand-share-actions.test.ts
git commit -m "feat: integrate shared errand lifecycle"
```

---

### Task 6: Render one private, actionable shared opportunity

**Files:**
- Modify: `src/app/app/feed/page.tsx`
- Modify: `src/app/app/errands/[id]/page.tsx`
- Create: `src/app/app/__tests__/errand-share-ui.test.ts`

**Interfaces:**
- Consumes: share group/member rows and the actions from Task 5.
- Produces: one runner feed card per active group and buyer/runner tracking
  states without cross-buyer private-data disclosure.

- [ ] **Step 1: Add failing UI contract tests**

Assert the feed excludes child tasks whose `share_group_id` is non-null,
queries active posted groups, renders combined payout/two errands/ordered stop
count/stricter deadline, and binds `claimSharedGroup`. Assert the tracking page
selects only safe group/member fields for buyers, renders waiting countdown,
paired/funding/continuing-alone states, and never selects the other task's
description, payment reference, messages, or buyer profile.

- [ ] **Step 2: Run UI tests and verify RED**

Run `npx vitest run src/app/app/__tests__/errand-share-ui.test.ts`.

Expected: FAIL because the pages do not query or render share groups.

- [ ] **Step 3: Update the runner feed query and card model**

Fetch ordinary posted tasks with `share_group_id IS NULL` plus active posted
groups through a restricted group projection. Merge them into a discriminated
view model, sort by effective deadline/creation time, and render group cards
once. Do not expose exact member drop-offs before assignment.

- [ ] **Step 4: Add tracking states and actions**

Render `Looking for a shared trip` with an absolute window-end timestamp,
`Paired`, `Waiting for both payments`, `Continuing alone`, and group progress.
Use the buyer funding/rematch action or runner group actions according to role
and group state. Keep each task's escrow/proof/dispute panels unchanged.

- [ ] **Step 5: Add assigned-runner route summary**

Only after assignment, render the persisted ordered route with member labels
`Pickup 1`, `Pickup 2`, `Drop-off 1`, `Drop-off 2`; link each stop to the
runner-authorized member task page without rendering the other buyer identity.

- [ ] **Step 6: Run page/action tests and commit**

```bash
npx vitest run src/app/app/__tests__/errand-share-ui.test.ts src/app/app/__tests__/errand-share-actions.test.ts src/app/app/__tests__/matching-actions.test.ts
git add src/app/app/feed/page.tsx src/app/app/errands/[id]/page.tsx src/app/app/__tests__/errand-share-ui.test.ts
git commit -m "feat: present shared runner opportunities"
```

---

### Task 7: Add reproducible simulation and deployment setup

**Files:**
- Create: `src/lib/algorithm/errand-share-evaluation/types.ts`
- Create: `src/lib/algorithm/errand-share-evaluation/random.ts`
- Create: `src/lib/algorithm/errand-share-evaluation/generator.ts`
- Create: `src/lib/algorithm/errand-share-evaluation/metrics.ts`
- Create: `src/lib/algorithm/errand-share-evaluation/__tests__/evaluation.test.ts`
- Create: `scripts/evaluate-errand-share.ts`
- Create: `docs/errand-share-operations.md`
- Modify: `package.json`

**Interfaces:**
- Adds `npm run evaluate:errand-share`.
- Produces deterministic `reports/errand-share/simulation.json` and
  `reports/errand-share/simulation.md` containing seed, dataset size, versions,
  pairing rate, distance saving, detours, urgency slices, deadline violations,
  simulated cancellation/completion rates, and rejection reasons.

- [ ] **Step 1: Write failing evaluation tests**

Test same seed equality, different seed inequality, stable JSON key ordering,
metric bounds, zero hard-constraint violations, no-sharing baseline comparison,
and explicit `evidence: "simulated"` labelling.

- [ ] **Step 2: Run evaluation tests and verify RED**

Run:

```bash
npx vitest run src/lib/algorithm/errand-share-evaluation/__tests__/evaluation.test.ts
```

Expected: FAIL because the evaluation package does not exist.

- [ ] **Step 3: Implement seeded scenario generation**

Reuse the repository's Mulberry32 pattern. Generate fixed Accra-area pickup and
drop-off coordinates, different buyers, Today/Whenever/Express urgency,
creation times, categories, and controlled cancellation/completion draws. The
default seed is `4607` and default scenario count is `1000`.

- [ ] **Step 4: Implement online simulation and metrics**

Process scenarios in creation order, maintain waiting windows, call the real
`rankSharePartners`, remove paired tasks, and release expired tasks. Compare
shared route kilometres with the direct no-sharing sum. Fail report generation
if any accepted pair violates deadline or detour constraints.

- [ ] **Step 5: Implement CLI/report output and package script**

Use stable JSON ordering and markdown tables. Add:

```json
"evaluate:errand-share": "node --import tsx scripts/evaluate-errand-share.ts"
```

- [ ] **Step 6: Document scheduler and validation operations**

Document `ERRAND_SHARE_CRON_SECRET`, the protected endpoint, Supabase Vault
storage for base URL/secret, the one-minute `pg_cron`/`pg_net` invocation, how
to inspect job runs, how to run the endpoint manually, retry/idempotency, the
request-time fallback, the evaluation command, and the boundary between
simulated and production evidence. Do not commit secret values.

- [ ] **Step 7: Run evaluation twice and commit reproducibility support**

```bash
npm run evaluate:errand-share
npm run evaluate:errand-share
npx vitest run src/lib/algorithm/errand-share-evaluation/__tests__/evaluation.test.ts
git add src/lib/algorithm/errand-share-evaluation scripts/evaluate-errand-share.ts docs/errand-share-operations.md package.json reports/errand-share
git commit -m "feat: evaluate errand sharing reproducibly"
```

Expected: both report runs produce byte-identical files and tests pass.

---

### Task 8: Verify the complete feature and publish one PR

**Files:**
- Verify: all files changed by Tasks 1-7
- Verify: generated reports and Next.js route table
- Verify: `docs/superpowers/specs/2026-08-16-errand-share-design.md`
- Verify: this plan

**Interfaces:**
- Consumes: the complete implementation.
- Produces: one reviewable branch and draft PR against `main`.

- [ ] **Step 1: Run focused Errand-Share suites**

```bash
npx vitest run src/lib/algorithm/__tests__/errand-share.test.ts src/lib/server/__tests__/errand-share-migration.test.ts src/lib/server/__tests__/errand-share.test.ts src/app/api/internal/errand-share/sweep/__tests__/route.test.ts src/app/app/__tests__/errand-share-actions.test.ts src/app/app/__tests__/errand-share-ui.test.ts src/lib/algorithm/errand-share-evaluation/__tests__/evaluation.test.ts
```

Expected: all focused files and tests pass.

- [ ] **Step 2: Run adjacent regression suites**

```bash
npx vitest run src/lib/algorithm/__tests__/matching.test.ts src/lib/algorithm/matching-evaluation/__tests__ src/lib/server/__tests__/matching-outcome.test.ts src/lib/server/__tests__/matching-migration.test.ts src/app/app/__tests__/matching-actions.test.ts
```

Expected: matching reliability remains green.

- [ ] **Step 3: Run full static and test gates**

```bash
npm run lint
npm run typecheck
npm test -- --run
```

Expected: all commands exit zero without new warnings.

- [ ] **Step 4: Run migration verification**

Run `./scripts/verify-migrations.sh` with the same throwaway PostgreSQL setup
used by CI. Expected: all migrations and the expanded smoke tests pass.

- [ ] **Step 5: Verify deterministic evidence**

Run `npm run evaluate:errand-share` twice and compare hashes of both generated
files. Expected: hashes are identical and the report labels all outcomes
simulated.

- [ ] **Step 6: Run the production build and inspect routes**

```bash
npm run build
```

Expected: exit zero; `/api/internal/errand-share/sweep` appears and no removed
Makola routes return.

- [ ] **Step 7: Review security and privacy boundaries**

Confirm service-role-only mutation grants, buyer/member RLS, assigned-runner
RLS, restricted feed projection, timing-safe cron auth, telemetry without
descriptions/precise locations, and notification payloads without other-buyer
private data.

- [ ] **Step 8: Verify diff scope and cleanliness**

```bash
git diff --check
git status --short
git log --oneline --decorate --max-count=12
```

Expected: no whitespace errors, no uncommitted files, and only Errand-Share
design/plan/implementation/evaluation changes after the merged Makola tree.

- [ ] **Step 9: Push and open one draft PR**

Push `agent/errand-share`, open one draft PR against `main`, include the exact
verification evidence, scheduler environment/setup requirement, simulated
evidence label, data/privacy boundary, and the explicit non-goals. Mark ready
only after GitHub Actions, deployment, and automated review checks are green.
