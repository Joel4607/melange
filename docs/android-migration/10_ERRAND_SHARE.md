# 10 — Errand-Share

## Purpose

Rebuild the merged PR #86 Errand-Share experience: automatically pair eligible flexible errands first, then match the pair as one runner opportunity, while preserving independent buyer privacy, money, proof, rating, and dispute records.

## Source of truth

- Design: `docs/superpowers/specs/2026-08-16-errand-share-design.md`
- Operations: `docs/errand-share-operations.md`
- Algorithm: `src/lib/algorithm/errand-share.ts`
- Orchestration: `src/lib/server/errand-share.ts`
- Schema/RPC/RLS: `supabase/migrations/0046_errand_share.sql`
- Web integration: `createErrand` and share actions in `src/app/app/actions.ts`, task detail, runner feed, notifications
- Evaluation: `src/lib/algorithm/errand-share-evaluation/` and checked reports

Do not simplify this module into a client-side “bundle” flag. Pairing, route enumeration, matching, escrow coordination, lifecycle, privacy projections, and release are server responsibilities.

## Defensible version-one scope

Eligible:

- Today (`normal`) or Whenever (`low`);
- direct pickup and drop-off;
- no manual runner;
- no custom intermediate stops;
- `posted`, unassigned, `share_state=waiting`;
- different buyers;
- still inside each sharing window.

Excluded: ASAP Express, pickup-only, manual-runner, custom-stop, already assigned/non-posted, expired, or same-buyer pairs.

Configuration `errand-share-v1` / `accra-v1`:

- Today wait: 10 minutes; Whenever wait: 30 minutes;
- pickup separation <= 1.0 km; drop-off separation <= 2.0 km;
- positive route-distance saving;
- each carried-route detour <= 20% and <= 2.0 km;
- proportional check skipped for direct trip under 0.1 km, absolute cap still applies;
- planning speed 20 km/h, service allowance 5 minutes per stop, match/accept buffer 30 minutes;
- group size exactly two; evaluate at most 50 oldest candidates.

Today and Whenever may pair only when the shared route meets the stricter Today deadline (23:59:59.999 Africa/Accra). The ETA is a transparent planning estimate, not live traffic.

## Pairing algorithm behavior

For tasks A and B, the server enumerates every four-stop order where each pickup precedes its own drop-off. It rejects routes violating separation, positive saving, either detour constraint, or deadline. It chooses the shortest feasible route. Among candidate partners it chooses greatest saved distance, then oldest candidate, then stable task ID.

Android displays server results; it does not enumerate routes, select partners, apply clock logic, or claim savings beyond the explicitly predicted metric.

## Buyer experience

Render these states inside the buyer's own `ErrandDetailScreen`:

| State | Copy/action |
|---|---|
| `waiting` | “Looking for a shared trip” and server-derived window countdown |
| paired/group `posted` | “Paired; finding one runner for the route” |
| `awaiting_funding` | “Waiting for both payments”; show only whether this buyer has confirmed |
| `offered` | “Offer sent to a runner” |
| `accepted` | “Runner accepted the shared route” |
| `in_progress` | shared progress and this buyer's own delivery position/status |
| `completed` | both errands completed; own proof/rating/dispute remains accessible |
| `dissolved` or task `released` | “Continuing alone” and ordinary matching state |

Notify the buyer when paired, funding becomes relevant, accepted, dissolved/released, own delivery completes, and group completes. Never show the other buyer's name, contact, free-text description, payment reference, chat, exact private delivery details, or escrow details.

## Funding and confirmation

Pairing is automatic; buyer escrow confirmation remains explicit. Each buyer confirms their unchanged task budget into that task's simulated escrow. Only after both holds exist can the group be offered. Confirmation deadline is the earlier of ten minutes after pairing and the remaining Today safety boundary.

If confirmation expires, dissolve atomically and let each surviving task continue within its remaining share window or release to ordinary matching. Android countdowns are informational and use server timestamps. A timeout/refetch must not cause a duplicate hold.

```text
POST /api/mobile/v1/share-groups/{groupId}/fund
body: { "taskId": "the caller's member task" }
```

Server verifies the caller owns that exact member and uses the idempotent group funding RPC.

## Runner experience

The open feed shows one `SharedOpportunity(groupId)` with:

- two errands;
- combined payout (sum of existing child payouts);
- ordered pickup/drop-off summary;
- union of required capabilities;
- predicted route distance and saved distance clearly labelled estimates;
- stricter deadline;
- load requirement of two.

Before assignment, use a restricted safe projection. After assignment, the runner may obtain both operational task details and the ordered route required to complete them.

Commands:

```text
POST /share-groups/{id}/claim
POST /share-groups/{id}/accept
POST /share-groups/{id}/decline
POST /share-groups/{id}/start
POST /share-groups/{id}/rematch
```

Accept/decline/start occurs once at group level. A decline offers the next active-run candidate. Exhaustion leaves the group posted for manual rematch/self-claim. Acceptance assigns the same runner to both tasks atomically and adds two active-load units.

## Completion and child independence

Starting moves both accepted tasks to `in_progress`. The runner completes each member independently at its own drop-off using that task's delivery-proof command. `complete_share_member` records the member completion; the group becomes completed only after both tasks complete.

Each child retains its own:

- price, fee, wallet hold, release/refund;
- proof image and GPS;
- buyer rating and optional tip;
- dispute and arbitration path;
- chat and notification privacy.

Do not create one combined proof, rating, tip, or dispute.

## Cancellation and dissolution

- Buyer cancellation before runner acceptance atomically cancels/refunds that task, dissolves the group, and resumes the survivor within remaining window or ordinary matching.
- After runner acceptance, retain current cancellation/dispute protections.
- Runner cancellation applies consistently to both assigned tasks and records a group outcome.
- A transient notification failure never rolls back a valid group/task transition.

## API projection

`GET /tasks/{taskId}` returns a buyer-scoped `shareSummary`. `GET /opportunities` returns the restricted runner pre-assignment DTO. Add:

```text
GET /api/mobile/v1/share-groups/{groupId}
```

This endpoint returns:

- buyer member: group state, safe coarse route/stop count, own member/funding/completion, timestamps;
- assigned runner: ordered operational route and both task details required for execution;
- unrelated user: privacy-safe 404;
- admin: only fields required by the admin workflow.

Never return `errand_share_decisions` raw to ordinary clients. Decision telemetry intentionally excludes private descriptions and exists for evaluation/audit.

## Scheduled release

The Android app must never call `GET /api/internal/errand-share/sweep` or possess `ERRAND_SHARE_CRON_SECRET`. Supabase cron invokes it once per minute. Normal web/BFF traffic may retain bounded fallback processing. Mobile simply observes server state and refreshes after a countdown reaches zero.

## Realtime and local countdowns

Subscribe to authorized task/group/member notifications or use notification invalidation. Re-fetch the group aggregate after events. Countdown is `serverDeadline - injectedClock`; when zero, label “Updating…” and refresh. Do not locally set `released` or `dissolved`.

## Evidence and product copy

The deterministic evaluation uses a fixed seed and synthetic 1,000-errand Accra-area data. Hard constraints must produce zero simulated deadline/detour violations. It does not prove production savings, fairness, demand, cancellation, or completion outcomes.

Allowed copy: “Predicted route saves 1.2 km under the current planning model.”

Unsafe copy: “You saved money,” “guaranteed faster,” or “live traffic optimized.”

Version one changes neither buyer's price nor fee. Benefit is predicted distance/capacity, not an unvalidated cash discount.

## File plan

```text
feature/errandshare/
  data/ErrandShareApi.kt
  data/ErrandShareRepositoryImpl.kt
  domain/ShareGroup.kt
  domain/ShareMemberSummary.kt
  domain/SharedOpportunity.kt
  presentation/ShareProgressCard.kt
  presentation/ShareFundingCard.kt
  presentation/SharedOpportunityDetailScreen.kt
  presentation/ShareRouteSummary.kt
```

## Tests

- All eligibility/exclusion reasons and Today+Whenever deadline behavior at BFF/algorithm contract level.
- Buyer projection never exposes the other member's private fields.
- Feed has one group card and zero child cards.
- Both idempotent holds required before offer.
- Group accept/start is atomic across both tasks.
- Decline rotation/exhaustion/rematch/self-claim.
- Independent proof/completion; group completes after the second member.
- Cancellation/dissolution/survivor release paths.
- Countdown expiry refreshes but never mutates locally.
- Copy labels prediction/simulation and never claims buyer price savings.

## Done criteria

- Pair first, then match as one opportunity is preserved end to end.
- Express remains exempt; eligible Today/Whenever pairing is automatic.
- Privacy, transaction, evidence, and independent-child boundaries pass adversarial tests.
