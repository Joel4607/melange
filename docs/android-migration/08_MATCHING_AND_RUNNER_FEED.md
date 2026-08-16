# 08 — Matching and Runner Feed

## Purpose

Expose open ordinary and shared opportunities to eligible runners, preserve deterministic server matching, allow manual rematching/self-claim, and accurately represent offer acceptance/decline.

## Current web implementation

- Pure ranking: `src/lib/algorithm/matching.ts`, `trust.ts`, `fraud.ts`, `geo.ts`, and `types.ts`.
- Orchestration: `src/lib/server/matching.ts` loads candidates, snapshots scores, finalizes match runs, offers candidates, handles declines, and records outcomes.
- Atomic RPCs: migration `0045_matching_reliability.sql`.
- Actions: `rematch`, `payIntoEscrow`, `acceptOffer`, `claimTask`, and `declineOffer`.
- Runner feed: `src/app/app/feed/page.tsx` shows ordinary `posted` tasks and each open Errand-Share group once, suppressing child tasks.
- Runner directory: `/app/runners` lets buyers filter active runners by category, rating/trust, and distance and preselect one for posting.

## Authoritative matching rules

A candidate must be available, active, verified, located, clear of hard fraud exclusion, capable of the task category/required group capabilities, and within capacity. Ranking combines explainable proximity, trust, capacity, and urgency-fit components. Equal scores use stable runner ID ordering.

The current calibrated configuration weights urgency fit 65%, trust 25%, and capacity 10%; urgency fit already incorporates pickup distance and active load. Android must not copy these weights or calculate a winner. The server persists algorithm/config versions and the candidate snapshot.

### Reliability contract

- Finalization locks the task and returns `matched`, `no_candidates`, or `not_posted`.
- Candidates found: `posted -> matched` and that exact run becomes active.
- No candidates: record the run, keep `posted`, keep visible to eligible runners, allow manual rematching.
- Candidate offer/decline uses the active run, not “latest by timestamp.”
- All candidates decline: atomically clear the run/assignment and reopen `posted`.
- Concurrent stale attempt: no overwrite.
- Completed errands never appear because the open feed is `posted` only; do not delete history.

## Android screens

### `OpportunityFeedScreen`

Cards for ordinary tasks show a safe summary: title/category, urgency label, estimated payout, pickup distance if authorized, and posted age. Cards for shared groups show exactly one combined opportunity: two errands, combined payout, ordered coarse route summary, required capability union, predicted shared distance, and stricter deadline.

The feed must not show either child task separately while it belongs to an open group. It must not expose buyer contact, payment reference, private description, chat, or precise other-buyer details.

Actions:

- open detail;
- claim ordinary task;
- claim shared group;
- refresh/load more.

If another runner claims first, remove/refresh the card and explain the conflict.

### `RunnerDirectoryScreen` (buyer)

Show active/available public runner cards with safe name/summary, verification, trust/rating, capabilities, approximate distance, and selection action. Filters are category, minimum rating/trust as the current web surface supports, and sort. A selected runner only pre-fills posting; final availability is checked on create.

### Offer surface

Assigned offers appear on runner dashboard/task detail with Accept and Decline. Shared offers use group-level Accept/Decline once. Commands disable while pending and require confirmation only where UX value outweighs delay.

## APIs

```text
GET  /api/mobile/v1/opportunities?cursor=&limit=
POST /api/mobile/v1/tasks/{id}/claim
POST /api/mobile/v1/tasks/{id}/accept
POST /api/mobile/v1/tasks/{id}/decline
POST /api/mobile/v1/tasks/{id}/match          # buyer manual rematch
POST /api/mobile/v1/tasks/{id}/escrow         # buyer chooses top candidate/hold

GET  /api/mobile/v1/runners?category=&minTrust=&sort=&cursor=&limit=

POST /api/mobile/v1/share-groups/{id}/claim
POST /api/mobile/v1/share-groups/{id}/accept
POST /api/mobile/v1/share-groups/{id}/decline
POST /api/mobile/v1/share-groups/{id}/rematch
```

All command routes require idempotency keys and return the resulting authoritative task/group projection. An ordinary claim uses the same server self-claim finalization and offer outcome path. Shared claim consumes two load units and assigns/accepts the group according to the existing orchestration.

## Buyer matching states

- `share_state=waiting`: pairing window, not ordinary matching yet.
- `posted`: no active runner; show rematch when not still waiting.
- `matched` without selected runner: ranked candidates exist; buyer can confirm simulated escrow to offer top candidate.
- `matched` with selected runner: offer is awaiting runner response.
- decline rotation may replace selected runner while status stays matched.
- exhaustion returns posted.

Do not display a generic “matched” success if no runner has actually accepted. Use copy such as “Candidate found,” “Offer sent,” and “Runner accepted.”

## Runner eligibility and conflicts

The BFF rechecks verified/active/availability/capability/fraud/capacity at command time. Feed visibility is not authorization. Map failures to specific safe UI guidance:

- verification required;
- account restricted;
- availability/location required;
- capability mismatch;
- opportunity already taken/state changed;
- group no longer matchable.

## Outcome telemetry

The server records offer, response, acceptance, pickup, completion, cancellation, dispute, and resolution timestamps in `match_outcomes` or group outcomes. Android supplies no fabricated timestamps and does not claim performance results from this telemetry. Lifecycle telemetry is best effort after successful transitions and must never roll back a valid state.

## Realtime and caching

Subscribe to relevant task/group invalidations and refresh the feed. Cache only privacy-safe cards and clear them on logout. Treat cached feed as stale browsing information: claiming requires network and fresh server validation. Do not background-replay claims or offer responses.

## File plan

```text
feature/matching/
  data/MatchingApi.kt
  data/OpportunityRepositoryImpl.kt
  domain/Opportunity.kt
  domain/OrdinaryOpportunity.kt
  domain/SharedOpportunity.kt
  presentation/OpportunityFeedViewModel.kt
  presentation/OpportunityFeedScreen.kt
  presentation/OpportunityDetailScreen.kt
  presentation/components/OpportunityCard.kt
  presentation/components/SharedOpportunityCard.kt
feature/runners/
  data/RunnerDirectoryApi.kt
  presentation/RunnerDirectoryScreen.kt
  presentation/RunnerFilterSheet.kt
```

## Tests

- Eligibility reasons and safe UI mapping.
- Ordinary and group cards use distinct IDs and shared child suppression.
- No-candidate and all-declined tasks remain/reopen posted.
- Concurrent claim/accept/decline returns conflict and refreshes.
- Decline selects next active-run candidate and records responsiveness.
- Stable pagination/dedup under realtime removal.
- Buyer directory selection is revalidated at post time.
- No matching formula or private fields are present in Android code/feed DTOs.

## Done criteria

- Matching remains server-owned, explainable, atomic, and telemetry-compatible.
- Available runners can discover still-posted work and manually claim it.
- Feed and offer language never overstates candidate selection as acceptance.
