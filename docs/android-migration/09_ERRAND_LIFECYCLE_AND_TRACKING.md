# 09 — Errand Lifecycle and Tracking

## Purpose

Provide the participant task detail surface for status, route, runner/buyer context, shared progress, matching/funding actions, acceptance, pickup/start, completion entry, cancellation, proof, rating, dispute, chat, and live location.

## Current web implementation

`src/app/app/errands/[id]/page.tsx` is the main lifecycle composition. It loads task/member/group state, profiles, candidate, proof signed URL, rating, dispute, messages, and runner location; then renders different buyer/runner actions. `dashboard-widgets.tsx`, `mark-delivered-form.tsx`, `task-chat.tsx`, `map-view.tsx`, and `live-location-updater.tsx` support it. Mutations live in `src/app/app/actions.ts` and privileged server modules.

## Screen decomposition

Use one `ErrandDetailScreen(taskId)` with sections driven by participant role and authoritative state:

1. title, category, urgency, task/share status;
2. route map/stop list and schedule/recurrence summary;
3. budget, fee/payout view appropriate to role, simulated escrow state;
4. status timeline and contextual explanation;
5. runner/buyer participant summary after authorization permits it;
6. one primary action block;
7. shared-trip summary when `shareGroup != null`;
8. live location during accepted/in-progress work;
9. proof, rating/tip, or dispute status after completion;
10. task-scoped chat when buyer and selected runner are participants.

Avoid rendering all branches simultaneously. Use composables such as `StatusTimeline`, `BuyerTaskActions`, `RunnerTaskActions`, `ShareProgressCard`, `ProofCard`, and `TaskChatSection`.

## Task transitions and commands

| Current state | Actor | Command | Required result |
|---|---|---|---|
| posted | buyer | rematch | fresh run; remains posted if no candidates |
| posted | runner | claim | matched/accepted through server self-claim path |
| matched, no assigned runner | buyer | confirm escrow | hold and offer active-run candidate |
| matched, assigned | runner | accept | accepted; runner load increments |
| matched, assigned | runner | decline | next candidate or posted reopen |
| accepted | runner | mark picked up | in_progress; timestamp/outcome recorded |
| accepted/in_progress | runner | deliver | completed after proof/escrow logic |
| posted/matched | buyer | cancel | cancelled with any held refund atomically |
| accepted/in_progress | runner | cancel | cancelled/refund/trust/fraud behavior |
| completed | buyer | rate/tip | rating plus release/tip transaction |
| completed | buyer | dispute | disputed then auto-resolved/escalated |

Exact participant and state checks remain server-side. `accepted_at` and `completed_at` are server timestamps.

## Detail API

```text
GET /api/mobile/v1/tasks/{taskId}
```

Return a role-projected aggregate, not raw rows:

```text
task, viewerRole, allowedActions, route, participantSummary,
escrowSummary, matchSummary, shareSummary, proofSummary,
ratingSummary, disputeSummary, chatSummary, liveLocationPolicy, version
```

`allowedActions` is useful for presentation but not an authorization grant. Every command revalidates state. A monotonically useful `updatedAt` or entity tag may help refresh/conflict handling.

Command routes:

```text
POST /tasks/{id}/match
POST /tasks/{id}/escrow
POST /tasks/{id}/claim
POST /tasks/{id}/accept
POST /tasks/{id}/decline
POST /tasks/{id}/pickup
POST /tasks/{id}/deliver        # multipart, see module 13
POST /tasks/{id}/cancel
POST /tasks/{id}/disputes
POST /tasks/{id}/rating
```

Require idempotency keys. Prefer commands named after intent over a general client-supplied `status` patch.

## Status language

Map database states to participant-aware copy:

- posted: “Looking for a runner” or “Available to claim”;
- matched/no runner: “Candidate found — confirm escrow”;
- matched/runner: “Offer sent” for buyer, “New offer” for runner;
- accepted: “Runner accepted”; runner primary action is pickup/start;
- in_progress: “Errand in progress”;
- completed: “Delivered — review or dispute” until buyer closes the financial branch;
- disputed: “Under review”;
- resolved: “Resolved” with privacy-safe outcome;
- cancelled: “Cancelled.”

Share group states have their own copy in module 10.

## Cancellation

Show a confirmation dialog with consequences. Do not optimistically remove the task. The existing atomic cancellation path authorizes the actor, refunds held escrow, updates state, and records outcome. Runner cancellation also updates trust/fraud signals; group cancellation rules apply to both members. On a `409`, refetch and show the latest state.

Cancelled and completed tasks remain in history but never in available feed.

## Live tracking

Only the buyer of an accepted/in-progress task may query the assigned runner's current presence through the authorized runner-location endpoint/BFF projection. The runner publishes location according to module 16. Hide tracking before acceptance and after completion/cancellation. If Redis is absent or presence is stale, display “Live location unavailable” and retain static route details.

## Realtime

Subscribe to participant-authorized task, message, notification, and relevant runner/group signals while detail is visible. Debounce into a complete detail refresh. Server projection avoids partially applying a group transition or displaying a proof before its task state is coherent.

## Loading and error states

- Initial skeleton with top bar and status card.
- Cached stale detail may render, but all commands require network.
- Privacy-safe not found for missing/unauthorized task.
- Command progress scoped to the action; prevent double submit.
- Conflict: refresh and explain “This errand changed while you were viewing it.”
- Signed media expired: refresh detail for a new URL rather than treating the proof as absent.
- Realtime disconnected: small stale indicator plus manual refresh.
- Terminal states always have a usable back/history path.

## Security and privacy

- Detail is limited to buyer, selected runner, or admin according to RLS/BFF checks; pre-assignment feed uses a separate restricted DTO.
- Do not expose another Errand-Share buyer's identity, description, payment reference, chat, or precise private drop-off.
- Signed media URLs are short-lived and excluded from logs/analytics/cache backups.
- `allowedActions`, local status, and navigation origin are never trusted by command endpoints.

## File plan

```text
feature/tracking/
  data/TaskDetailApi.kt
  data/TaskDetailRepositoryImpl.kt
  domain/TaskDetail.kt
  domain/TaskAction.kt
  presentation/ErrandDetailViewModel.kt
  presentation/ErrandDetailScreen.kt
  presentation/components/StatusTimeline.kt
  presentation/components/BuyerTaskActions.kt
  presentation/components/RunnerTaskActions.kt
  presentation/components/RouteSummary.kt
  presentation/components/ParticipantCard.kt
```

## Tests

- State/actor/action matrix and copy.
- All-decline/no-candidate reopens/remains posted and visible.
- Accepted/in-progress only for pickup/delivery and live tracking.
- Atomic cancellation/refund response and conflict recovery.
- Terminal history remains while feed excludes it.
- Participant/privacy projections, especially shared tasks.
- Realtime invalidation produces coherent aggregate refresh.
- Expired signed URL refresh path.

## Done criteria

- Every current task-detail branch is represented by a mobile state or an explicitly linked module.
- The screen never invents a transition, financial result, or live location.
- Manual rematching remains available whenever the server keeps/reopens the errand as posted.
