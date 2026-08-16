# 14 — Trust, Fraud, and Disputes

## Purpose

Preserve Melange's explainable trust, fraud detection, and rule-based dispute arbitration while giving users honest, role-appropriate status and administrators an auditable review path.

## Current implementation

- `src/lib/algorithm/trust.ts`: time-decayed, Bayesian cold-start trust with completion, dispute, rating, responsiveness, and fraud penalty.
- `src/lib/algorithm/fraud.ts`: explainable GPS mismatch, impossible speed, rapid cancellation, and repeated-pair dispute rules with noisy-OR aggregation and clear/penalize/exclude actions.
- `src/lib/algorithm/arbitration.ts`: proof/GPS/claim/fraud rules producing refund/release/partial recommendation, confidence, and escalation.
- `src/lib/server/trust.ts`, `fraud.ts`, and `disputes.ts`: load/persist inputs, refresh score, and apply/escalate resolution.
- `raiseDispute` and admin actions connect the workflow to task/escrow/trust/Telegram notifications.
- Admin trust pages show runner status, trust breakdown/history, fraud flags, and controls.

Android must not port these algorithms as an authoritative client library. Keeping one server implementation preserves versioning, fraud resistance, and reproducible evaluation.

## User-facing trust

Runner summaries may display:

- verified state;
- trust score with an explanation that it reflects platform behavior;
- buyer rating separately;
- capabilities and account availability.

Do not merge buyer rating and trust into one ambiguous star count. Do not expose private fraud flags, detailed weights, other users' disputes, or a claim that trust predicts guaranteed safety.

Runner settings may show recent personal trust events already exposed on web. Use human labels and server timestamps. Do not let the runner edit or delete them.

## Buyer dispute flow

`RaiseDisputeScreen(taskId)` is available only to the owner of a `completed` task under the current rule.

Claims map to the algorithm's stable set:

```text
not_delivered | wrong_item | damaged | other
```

Collect a required reason/claim with optional explanatory text only if the backend schema/API is extended to store it safely. Current action requires a trimmed reason. Display existing proof context and explain that clear cases may be resolved automatically while uncertain cases go to admin review.

```text
POST /api/mobile/v1/tasks/{taskId}/disputes
{
  "claim": "not_delivered",
  "reason": "..."
}
```

Require idempotency. Server verifies buyer/task state, creates one dispute according to database constraints, transitions the task, records outcome telemetry, notifies admins, runs arbitration, and atomically applies refund/release when auto-resolved. Escalated cases wait for admin.

## User dispute states

Return a privacy-safe `DisputeSummary`:

```text
status: open | auto_resolved | escalated | resolved
resolution: refund | release | partial | null
decidedBy: system | admin | null
createdAt, resolvedAt
explanation: safe server-authored summary
```

Do not expose raw fraud details or internal thresholds to the buyer. A runner sees only the task outcome and any account restriction appropriate to them.

## Admin workflows

Module 17 owns screens; this module defines domain commands:

```text
GET  /api/mobile/v1/admin/disputes?status=&cursor=&limit=
GET  /api/mobile/v1/admin/disputes/{id}
POST /api/mobile/v1/admin/disputes/{id}/resolve
GET  /api/mobile/v1/admin/fraud-flags?status=&cursor=&limit=
PATCH /api/mobile/v1/admin/fraud-flags/{id}
GET  /api/mobile/v1/admin/runners/{id}/trust
POST /api/mobile/v1/admin/runners/{id}/trust/recalculate
POST /api/mobile/v1/admin/runners/{id}/status
POST /api/mobile/v1/admin/runners/{id}/fraud-flags/clear
```

Admin resolution accepts an allowlisted `refund|release|partial` and optional internal note if a protected audit-note field exists. Every admin mutation records actor, action, target, before/after safe metadata, timestamp, and result.

## Fraud timing

- Delivery proof evaluates GPS mismatch/impossible speed.
- Cancellation evaluates recent cancellation behavior.
- Disputes evaluate repeated-pair behavior.
- Active hard flags exclude runners from matching.
- Trust refresh follows relevant events/flag changes.

Android only submits genuine command inputs and server-captured context. It never sends a trust score, fraud action, confidence, or final resolution as a normal user.

## UI and errors

- Dispute draft is retained through network errors, excluding any unapproved sensitive attachments.
- Already disputed/rated/resolved conflict triggers refresh and current state.
- Auto-resolution displays result without presenting the rule as infallible.
- Escalation explains that review is pending and avoids a guaranteed time unless an SLA exists.
- Restricted runner sees active/quarantined/suspended status and support guidance, not an editable flag.
- Admin concurrent resolution returns prior/current result rather than applying money twice.

## Security and fairness

- Algorithms and config remain server-only versioned code; Kotlin UI uses explanations/projections.
- Administrative decisions are least-privilege and fully audited.
- Precise proof/location and identity data are visible only when necessary for the case.
- Avoid sensitive protected-class data; current rules use operational evidence.
- Keep deterministic simulation claims separate from production outcomes.
- Provide a human escalation path for uncertain arbitration; do not portray automated resolution as legal adjudication.

## File plan

```text
feature/trust/
  data/TrustApi.kt
  domain/TrustSummary.kt
  presentation/TrustExplanationSheet.kt
feature/disputes/
  data/DisputeApi.kt
  data/DisputeRepositoryImpl.kt
  domain/Dispute.kt
  presentation/RaiseDisputeViewModel.kt
  presentation/RaiseDisputeScreen.kt
  presentation/DisputeStatusCard.kt
```

## Tests

- Completed-owner-only dispute and duplicate/idempotency behavior.
- Claim mapping, required reason, and state conflicts.
- Auto refund/release and escalation do not split from task/escrow state.
- Fraud triggers at delivery/cancellation/dispute and matching excludes hard flags.
- Trust and buyer rating are displayed separately.
- Normal users cannot submit scores/resolutions or view raw flags.
- Concurrent admin resolution/recalculation/status change is audited and safe.
- Copy accurately describes rules, uncertainty, and evidence boundary.

## Done criteria

- The authoritative algorithms remain one tested server implementation.
- User and admin workflows are explainable without leaking private/risk-control details.
- Every financial/account-changing outcome is atomic, authorized, and audited.
