# 07 — Errand Posting and Recurrence

## Purpose

Let buyers create pickup-only, direct, multi-stop, recurring, automatically matched, or manually assigned errands with the exact current pricing, validation, and Errand-Share eligibility behavior.

## Current web implementation

- `src/app/app/post/page.tsx` guards the buyer flow and optionally preselects a runner/category.
- `post-form.tsx` collects title, description, category, pickup/drop-off, up to five stops, urgency, budget, payment reference, recurrence, and optional runner.
- `createErrand` in `src/app/app/actions.ts` validates the form, calculates fee/payout, creates the task, and starts the correct sharing/matching path.
- `src/lib/pricing.ts` is the authoritative fee formula.
- `src/lib/algorithm/errand-share.ts` supplies share windows/deadlines.
- Migration `0044_multi_stop_recurrence.sql` adds stops and recurring-series fields.

## Mobile flow

Use a step-based single flow, with a visible summary before submission:

```text
Basics -> Route -> Timing -> Budget -> Recurrence -> Review -> Submit
```

The buyer may move backward without losing the draft. The flow should not create a server task until final submit.

### Screen sections

1. Basics: title, optional description, canonical category.
2. Route: required pickup, optional drop-off, zero to five ordered intermediate stops.
3. Timing: `ASAP Express`, `Today`, or `Whenever` with accurate sharing explanation.
4. Budget: positive GHS budget, calculated platform fee, runner payout, optional payment reference.
5. Recurrence: none/daily/weekly/monthly and optional end date when recurring.
6. Review: all values, sharing eligibility explanation, simulated payment disclosure, submit.

Location selection is a focused map/search/manual-confirmation screen. A selected runner coming from the directory is shown prominently and can be removed before submit.

## Terminology mapping

| Buyer label | Stored urgency | Behavior |
|---|---|---|
| Whenever | `low` | Eligible direct errand waits up to 30 minutes for sharing |
| Today | `normal` | Eligible direct errand waits up to 10 minutes; same-day Accra deadline |
| ASAP Express | `express` | Bypasses sharing and matches immediately |

Do not expose `low/normal/express` as unexplained UI copy.

## Validation contract

Mirror current server validation and tighten only through an approved backend change:

- title: required after trim;
- description/category: optional; category must be from canonical choices for new clients;
- pickup: required valid WGS84 coordinate;
- drop-off: both latitude and longitude or neither; values must be valid;
- stops: JSON/domain list, maximum five, each with a valid coordinate, optional trimmed label, and sequence starting at one;
- urgency: allowlisted; invalid input is rejected by the new API rather than silently defaulted;
- budget: finite and positive, greater than calculated fee, producing positive runner payout;
- selected runner: valid UUID and currently active/available; BFF also checks capability and verification if required by the final shared command extraction;
- recurrence: `none|daily|weekly|monthly`; end date is required for recurring work and cannot precede the posting date;
- payment reference: optional, trimmed, length-bounded server-side.

The server recalculates fee and payout. Any on-device estimate is advisory and must use a quote endpoint or a versioned presentation formula that is checked against the server response.

The current defensible fee formula is straight-line route distance through pickup, ordered stops, and optional drop-off: `(GHS 2.00 + GHS 1.00 per km) × urgency multiplier`, rounded to pesewas. Multipliers are `1.0` Whenever, `1.2` Today, and `1.5` Express. Preserve it server-side until an approved pricing change; do not describe it as road distance or live traffic.

The current category catalog is `Market Runs`, `Grocery Shopping`, `Pharmacy Pickup`, `Clothes & Apparel`, `Pickup & Delivery`, `Household Items`, `Gifts & Occasions`, and `Any Other Errand`. Serve it from one backend catalog rather than duplicating it in Android.

## API contracts

```text
POST /api/mobile/v1/task-quotes
POST /api/mobile/v1/tasks
GET  /api/mobile/v1/task-categories
```

Quote request includes route, stops, urgency, and budget. Response includes `feePesewas`, `runnerPayoutPesewas`, distance summary, formula/config version, and share eligibility explanation.

Create request:

```json
{
  "title": "Pick up documents",
  "description": "Envelope at reception",
  "category": "Documents",
  "urgency": "normal",
  "budgetPesewas": 5000,
  "pickup": { "lat": 5.6037, "lng": -0.1870 },
  "dropoff": { "lat": 5.5600, "lng": -0.2050 },
  "stops": [],
  "selectedRunnerId": null,
  "paymentReference": null,
  "recurrence": { "frequency": "none", "endDate": null }
}
```

Require `Idempotency-Key`. Response returns the created `taskId`, authoritative quote, initial task/share state, and next destination. A repeat with the same key and same body returns the same task. Same key with a different body is a conflict.

## Server branching that must be preserved

### Manual runner

Validate the runner, including the same verified/active/available/capability policy used by matching, create the task already `matched` with that runner, ensure the simulated buyer wallet has enough balance, hold funds, and notify the runner. It bypasses Errand-Share. This closes the current manual-path consistency gap rather than teaching Android a weaker eligibility rule.

### Automatic, share-eligible

Eligibility requires non-Express urgency, a drop-off, zero custom stops, and no selected runner. Create `posted` with `share_state=waiting`, window end, and Today deadline when applicable. Attempt automatic pairing. A transient pairing failure must not delete or hide the task.

### Automatic, share-ineligible

Create `posted` with `share_state=ineligible`, then generate an ordinary match run. No candidates leaves the task posted for feed self-claim/manual rematch.

The request-time bounded share sweep is a server fallback only; Android does not call the protected cron route.

## Recurrence

The current server creates the first task with `series_number=1` and creates a successor after delivery only when a recurrence end date exists and the next UTC-derived date does not exceed it. Successor tasks copy the relevant details, reference `parent_task_id`, calculate a fresh share window/deadline, and re-enter sharing or matching. Preserve these date semantics initially, then change them only through a separate timezone/product decision.

Android displays series information and recurrence settings but never schedules the authoritative next task locally. WorkManager must not create recurring errands.

## Draft persistence

Persist non-sensitive draft fields in `SavedStateHandle` and optionally an encrypted/local Room draft after explicit user choice. Do not persist payment references, exact locations, or selected photos longer than necessary without a defined retention policy. A submitted idempotency key remains associated with the draft until a terminal response.

## UI states

- Location unavailable: keep draft, explain manual/map options.
- Quote loading: show pending calculation and disable final submit.
- Quote changed on submit: show authoritative fee/payout and require confirmation if materially different.
- Selected runner became unavailable: remove assignment only after informing the buyer; allow automatic matching or another runner.
- Offline: save draft; do not claim it is posted and do not blindly enqueue creation.
- Submit timeout: query/retry using the same idempotency key before allowing a second creation.
- Success: clear draft and navigate to task detail.

## Security and privacy

- Derive buyer ID from session, not request body.
- Do not trust client fee, payout, share eligibility, deadlines, or initial status.
- Rate limit creation as the current server does (five posts per five minutes per user unless policy is intentionally changed).
- Location and free-text descriptions are sensitive; exclude them from analytics and ordinary error logs.
- Validate all fields again at the BFF and preserve Postgres constraints.

## File plan

```text
feature/posting/
  data/PostingApi.kt
  data/PostingRepositoryImpl.kt
  domain/ErrandDraft.kt
  domain/TaskQuote.kt
  domain/PostingRepository.kt
  presentation/PostErrandViewModel.kt
  presentation/PostErrandScreen.kt
  presentation/RouteEditorScreen.kt
  presentation/StopEditor.kt
  presentation/RecurrenceEditor.kt
  presentation/ReviewErrand.kt
```

## Tests

- Every validation boundary, including partial drop-off and sixth stop.
- Budget equal to/below fee and positive payout.
- Urgency labels map exactly to stored values.
- Manual, Express, pickup-only, multi-stop, Today, and Whenever server branches.
- Create idempotency after timeout/double tap.
- Share window/deadline server results; device clock/timezone cannot override them.
- Recurrence successor remains server-owned and respects end condition.
- Process recreation restores draft but not transient secrets.

## Done criteria

- All current form fields and branches have Android equivalents.
- One user submission creates at most one task.
- UI explanations match actual sharing, simulated payment, and recurrence behavior.
