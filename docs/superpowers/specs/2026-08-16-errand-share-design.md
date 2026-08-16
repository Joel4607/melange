# Errand-Share Design

**Date:** 2026-08-16

**Status:** Approved

**Scope:** Automatic two-errand pairing before runner matching

## Goal

Add an automatic Errand-Share workflow that pairs compatible Today and
Whenever errands before matching them to one runner. The pair is presented to
runners as one opportunity while each buyer keeps an independent task,
escrow, delivery proof, rating, cancellation record, and dispute right.

The feature must be useful in production and easy to defend academically. It
will use explicit constraints, deterministic decisions, labelled simulation,
and production telemetry. It will not claim globally optimal routing,
real-world savings, or traffic-aware travel times.

## Product Contract

- ASAP Express errands never enter Errand-Share.
- Today errands wait for a compatible partner for at most 10 minutes.
- Whenever errands wait for a compatible partner for at most 30 minutes.
- Today and Whenever may pair when the shared trip can meet the Today
  deadline.
- Pairing is automatic when all constraints pass. Buyers do not opt in or pick
  a partner.
- Version one pairs exactly two errands.
- The pair is matched and shown to runners as one opportunity.
- Both buyers are notified when a pair forms, dissolves, or progresses.
- An unpaired errand automatically continues through ordinary matching when
  its sharing window expires.

## Accurate Algorithm Description

Errand-Share is a **deterministic online greedy pairing algorithm with exact
two-errand route enumeration**.

"Online" means each newly posted errand is compared with the eligible waiting
pool available at that moment. "Greedy" means it selects the best feasible
partner now rather than solving a future global assignment problem. "Exact
two-errand route enumeration" means it evaluates every ordering of two
pickups and two drop-offs that preserves pickup-before-drop-off precedence.

The implementation and user interface must not describe this as globally
optimal vehicle routing. It is exact only for the stop ordering inside one
two-errand candidate pair.

## Eligibility

An errand may enter the waiting pool only when all of these conditions hold:

1. Its urgency is `normal` (Today) or `low` (Whenever).
2. It has no manually preselected runner.
3. It is posted, unassigned, and not already in a share group.
4. It has a valid pickup and drop-off. A missing drop-off continues to use the
   existing same-as-pickup behavior.
5. It has no additional custom stops. Version one excludes multi-stop errands
   to keep route precedence and buyer detour guarantees clear.
6. Its sharing window leaves enough time to satisfy its deadline and the
   configured operational safety buffer.

Recurring errands are evaluated independently each time an occurrence is
posted. They are not paired as a series.

A waiting candidate may pair with a new errand only when:

- both remain inside their sharing windows;
- both are still posted, unassigned, and unpaired;
- they belong to different buyers;
- pickup separation is no more than 1.0 km;
- drop-off separation is no more than 2.0 km;
- the best valid shared route saves distance compared with serving both trips
  separately;
- neither buyer's carried route exceeds the direct pickup-to-drop-off route by
  more than 20 percent or 2.0 km, whichever limit is reached first;
- the estimated trip finishes before the stricter deadline.

These values are versioned configuration, not hidden constants.

Group matching requires one runner to satisfy the union of both tasks'
capability requirements. If no such runner is currently available, the valid
pair remains posted and may be rematched or self-claimed when an eligible
runner becomes available.

## Version-One Configuration

The initial immutable configuration snapshot is:

- algorithm version: `errand-share-v1`;
- configuration version: `accra-v1`;
- Today waiting window: 10 minutes;
- Whenever waiting window: 30 minutes;
- maximum pickup separation: 1.0 km;
- maximum drop-off separation: 2.0 km;
- maximum carried-route detour: 20 percent;
- maximum absolute carried-route detour: 2.0 km;
- assumed travel speed: 20 km/h;
- service allowance: 5 minutes per pickup or drop-off;
- matching/acceptance safety buffer: 30 minutes;
- maximum group size: 2 tasks; and
- maximum waiting candidates evaluated per post: 50, ordered oldest first.

For a direct trip shorter than 0.1 km, the proportional detour denominator is
too small to be meaningful. The proportional check is skipped and the 2.0 km
absolute cap still applies.

## Deadlines and ETA

Today means completion by 23:59:59 in `Africa/Accra` on the posting date.
Whenever has no independent same-day deadline. When Today pairs with
Whenever, the Today deadline governs the shared route.

ETA is a transparent planning estimate calculated from haversine distance,
a versioned assumed travel speed, a service-time allowance at every pickup and
drop-off, and a matching/acceptance safety buffer. It is not presented as a
live-traffic estimate.

If there is not enough time remaining for a Today errand to wait safely, it
bypasses the sharing wait and proceeds to ordinary matching immediately.

## Route Enumeration and Partner Selection

Each errand contributes one pickup and one drop-off. For errands A and B, the
algorithm enumerates all valid orders of `A.pickup`, `A.dropoff`, `B.pickup`,
and `B.dropoff` for which each pickup precedes its corresponding drop-off.

For every ordering it calculates:

- total shared route distance;
- each buyer's carried distance from their pickup to their drop-off;
- each buyer's absolute and proportional detour;
- estimated completion time for each drop-off;
- total distance saved against the sum of both direct trips; and
- the deadline result.

Infeasible routes are discarded. The candidate pair keeps its shortest
feasible route. Among all feasible waiting partners, the new errand chooses:

1. greatest total route-distance saving;
2. earliest waiting candidate creation time; then
3. lexicographically smallest stable task ID.

Those tie-breakers make repeated evaluation deterministic.

## Architecture

### Pure algorithm layer

`src/lib/algorithm/errand-share.ts` owns eligibility, route enumeration,
metrics, rejection reason codes, and deterministic candidate ranking. It has
no database, framework, network, or clock dependency. The caller supplies the
current time and versioned configuration.

The algorithm returns decisions rather than mutating tasks. An accepted
decision includes the ordered route and all metrics needed for persistence and
evaluation. A rejected decision includes a stable reason code.

### Server orchestration layer

`src/lib/server/errand-share.ts` loads waiting candidates, calls the pure
algorithm, attempts candidates in deterministic order, invokes atomic database
functions, starts group matching, processes expired windows, and sends
notifications.

The ordinary matching module remains the single source of runner eligibility,
trust, fraud, availability, proximity, and ranking behavior. Group matching
builds one request with the pair's first pickup, stricter urgency, two load
units, and the union of required capabilities, then delegates to that matcher.

### Atomic database layer

Database functions lock task IDs in stable order and revalidate all mutable
conditions before creating a group. Each task has one nullable current-group
pointer, while the membership table retains historical dissolved groups.
Concurrent requests either create one valid group or receive a retryable
conflict; they cannot partially pair tasks or attach one task to two current
groups.

Group match activation, candidate offering, candidate decline, runner
acceptance, buyer cancellation before acceptance, and group dissolution update
the group and both member tasks in one transaction.

### Scheduled release

A protected internal sweep endpoint processes expired waiting windows and
freshly runs ordinary matching. Supabase Cron invokes it every minute through
`pg_cron`/`pg_net`, with the base URL and secret stored outside source control.
The endpoint is idempotent and protected by a timing-safe comparison against a
dedicated secret.

Normal post, dashboard, and feed requests also process a bounded number of due
windows as a fallback. Therefore delayed or failed scheduler invocations do not
permanently strand errands. A failed match attempt leaves the errand posted and
available for self-claim or manual rematching, preserving the existing
matching reliability contract.

## Data Model

### Task sharing fields

Tasks gain sharing metadata without adding intermediate values to the existing
`task_status` enum:

- `share_state`: `ineligible`, `waiting`, `paired`, or `released`;
- `share_window_ends_at`;
- `share_released_at`;
- `share_group_id`; and
- `delivery_deadline_at`.

Existing tasks migrate to `ineligible`. New Express and manual-runner tasks are
`ineligible`; eligible Today and Whenever tasks begin as `waiting`.

### Share groups

`errand_share_groups` stores:

- lifecycle state;
- ordered route and configuration versions;
- predicted solo and shared distances;
- predicted distance saving;
- stricter deadline;
- confirmation deadline;
- selected runner and active group match run;
- creation, offer, acceptance, start, completion, dissolution, and update
  timestamps; and
- dissolution or failure reason.

Group lifecycle values are `posted`, `awaiting_funding`, `offered`, `accepted`,
`in_progress`, `completed`, and `dissolved`. Pair creation begins at `posted`.
A successful candidate run advances the group and both child tasks to
`awaiting_funding`/`matched`; a no-candidate run leaves the group and tasks
posted.

### Share members

`errand_share_members` contains exactly two task rows for an active group. It
stores pickup/drop-off route positions, direct distance, carried distance,
absolute and proportional detour, predicted completion time, escrow
confirmation time, and completion time.

The original task remains the financial and buyer-facing source of truth.

### Group matching and outcomes

Group match runs and candidates are separate from task match runs so existing
matching telemetry remains semantically stable. They record the same algorithm
version, configuration, ranking components, offer order, decline history, and
outcome timestamps, keyed by share group.

### Decision telemetry

`errand_share_decisions` records the evaluated task pair, accepted/rejected
result, reason code, configuration version, route metrics, deadline result,
and evaluation time. It stores no buyer-facing private description.

## Posting and Pairing Flow

1. Validate and create the buyer's task using the existing post flow.
2. Express or manual-runner errands immediately use ordinary matching.
3. Eligible Today/Whenever errands are marked `waiting` with their deadline and
   sharing-window end.
4. Load compatible waiting candidates and evaluate them with the pure
   algorithm.
5. Persist decision telemetry.
6. Attempt the best accepted candidate with the atomic pair function. On a
   concurrency conflict, try the next accepted candidate.
7. If a pair is created, generate one group match run and notify both buyers.
8. If no pair is created, leave the task waiting. The scheduled release will
   send it through fresh ordinary matching when its window expires.

## Funding and Runner Offer Flow

Pairing itself is automatic, but existing buyer payment confirmation remains
explicit.

Each buyer confirms the unchanged task budget into that task's escrow. The
group is offered only after both holds exist. Confirmation must occur before
the earlier of ten minutes after pairing or the remaining deadline safety
boundary. If confirmation expires, the group dissolves and each surviving task
continues individually according to its remaining sharing window.

The runner sees one opportunity with:

- combined payout;
- ordered pickup and drop-off summary;
- combined capability requirements;
- predicted route distance;
- number of errands; and
- the stricter deadline.

The runner accepts or declines the group once. A decline atomically records the
outcome and offers the next candidate. When candidates are exhausted, the
group remains posted for manual group rematching or eligible self-claim.
Self-claim atomically rechecks group eligibility, ensures both simulated escrow
holds, assigns the claiming runner to both tasks, and records one group offer.

## Task and Group Lifecycle

- Runner acceptance assigns the same runner to both tasks atomically.
- Starting the shared trip moves both accepted tasks to `in_progress`.
- The runner completes each task independently at its own drop-off.
- Each completion uses that task's proof, release, rating, and dispute flow.
- The group becomes `completed` only after both tasks are completed.
- Completed tasks disappear from the open runner feed under the existing feed
  status filter.

If a buyer cancels before runner acceptance, the cancellation and refund use
the existing task rules, the group dissolves, and the surviving task returns to
its remaining sharing window or ordinary matching when that window has
expired.

After runner acceptance, existing cancellation and dispute protections remain
unchanged. A runner cancellation applies consistently to both assigned tasks
and records a group outcome so the event is auditable.

## Pricing

Version one does not change either buyer's `price` or `fee` and does not claim
buyer savings. The current `price` field combines buyer budget and delivery
economics, so silently discounting it would be unsafe.

The runner payout is the sum of the two existing task payouts. The defensible
benefit measured in this version is reduced route distance and improved runner
capacity, not an unvalidated cash discount. A future pricing phase may add an
explicit delivery-charge model and share savings only after real outcomes are
available.

## User Experience

### Buyer

The tracking page shows one of:

- `Looking for a shared trip` with the remaining wait time;
- `Paired` with an explanation that private buyer details are not shared;
- `Waiting for both payments`;
- the current shared-trip progress; or
- `Continuing alone` after release or dissolution.

The buyer sees only their own full task details. They may see a coarse shared
route summary and stop count, but never the other buyer's name, contact data,
description, payment reference, chat, or precise private delivery details.

### Runner

The open feed renders a share group once and suppresses its two child tasks.
Before assignment, it exposes only the information necessary to judge the
opportunity. After assignment, the runner can access both task details required
to complete the route.

### Notifications

Notifications cover pairing, dissolution, continuation alone, funding ready,
runner offer, acceptance, each delivery, and group completion. Payloads contain
stable IDs and safe summaries, not the other buyer's private task data.

No separate academic demo page is added. The production workflow is the
demonstration.

## Security and Privacy

- Only service-role code may execute pairing, group matching, release, and
  lifecycle mutation functions.
- Buyers may select a group only when their own task is a member.
- The assigned runner may select operational group details only after
  assignment; the public feed uses a restricted projection.
- Admin access follows the existing admin helper.
- Row-level security protects groups, members, decisions, group matches, and
  group outcomes.
- The scheduler secret and application base URL are environment/Vault values,
  never committed.
- Exact location and descriptions are excluded from decision telemetry.

## Failure Handling and Idempotency

- Pair creation locks tasks in stable ID order and is safe under retries.
- Unique active membership prevents duplicate groups.
- Sweep claims due tasks with row locks so concurrent sweeps cannot release the
  same task twice.
- A pairing transaction never leaves only one member attached.
- A failed notification does not roll back a valid state transition; it is
  logged and may be retried.
- A failed group match leaves the group posted and rematchable.
- A failed individual match after release leaves the task posted, visible to
  available runners, and manually rematchable.
- Funding, offers, declines, acceptance, cancellation, completion, and escrow
  operations remain idempotent.

## Evaluation

### Deterministic simulation

A seeded generator creates synthetic Ghana-local coordinate, urgency, time,
and capability scenarios. Every report identifies the seed, dataset size,
algorithm version, and configuration version.

The evaluation compares Errand-Share against a no-sharing baseline and reports:

- pairing rate;
- total and average kilometres saved;
- absolute and proportional buyer detour distributions;
- Today/Whenever slice results;
- deadline violations;
- simulated cancellation rate;
- simulated completion rate; and
- rejection reason distribution.

Hard constraints must produce zero simulated deadline and detour violations.
Pairing and distance results are labelled simulated and are not represented as
production outcomes.

### Real-outcome collection

Production telemetry later supports the same metrics using paired, accepted,
started, completed, cancelled, and disputed timestamps plus predicted route
metrics. Actual GPS-derived route claims are not made unless sufficient,
consented location data is collected and validated.

No performance or savings claim is promoted from simulation to real-world
evidence without a documented validation sample.

## Testing

### Pure algorithm

- urgency, manual-runner, status, ownership, window, and stop eligibility;
- pickup/drop-off radius boundaries;
- all valid route orders and pickup precedence;
- absolute and proportional detour boundaries;
- deadline and safety-buffer behavior;
- Today + Whenever deadline selection;
- positive-saving requirement;
- deterministic partner and route tie-breaking; and
- invalid configuration rejection.

### Database and concurrency

- exactly two members per active group;
- no task in two active groups;
- concurrent pair attempts create at most one group;
- atomic group offer, decline, acceptance, and dissolution;
- independent member completion and group completion;
- cancellation/refund behavior;
- expired-window claiming and release idempotency; and
- RLS/privacy boundaries.

### Server and interface

- post flow bypasses Express and manual-runner errands;
- waiting, pair, release, group match, funding, rematch, and self-claim flows;
- notification payload privacy;
- one feed card per group with child suppression;
- buyer and runner authorization; and
- tracking-page states.

### Final gates

- focused Errand-Share tests;
- adjacent matching, escrow, notification, task, and migration tests;
- deterministic evaluation reproducibility;
- `npm run lint`;
- `npm run typecheck`;
- `npm test -- --run`;
- migration verification;
- `npm run build`; and
- production route inspection.

## Delivery Boundary

This feature is delivered as one complete pull request after its design,
implementation plan, migrations, algorithm, lifecycle integration, interface,
evaluation, documentation, and verification are complete.

The pull request will not include Makola-Matrix work, matching-weight changes,
a fee-discount model, groups larger than two, live-traffic routing, custom-stop
pairing, or unrelated refactoring.
