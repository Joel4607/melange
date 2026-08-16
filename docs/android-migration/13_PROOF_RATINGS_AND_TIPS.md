# 13 — Proof, Ratings, and Tips

## Purpose

Rebuild delivery proof capture, per-task completion, buyer review, optional tip, and proof display while preserving storage privacy, fraud checks, escrow, trust, and Errand-Share member independence.

## Current web implementation

- `mark-delivered-form.tsx` captures an image and optional live GPS.
- `markDelivered` validates runner assignment/state, accepts JPEG/PNG/WebP up to 10 MiB, uploads to private `proofs`, inserts proof, completes the task, runs fraud evaluation, releases/holds according to the current flow, records telemetry/trust, creates recurrence, and synchronizes shared-member completion.
- Task detail creates a five-minute signed proof URL.
- `rateRunner` accepts 1–5 stars, optional comment, and nonnegative tip capped in the action; `rate_and_tip` atomically prevents duplicate rating and transfers the tip.
- Proof, rating, and tip remain per child task in Errand-Share.

## Runner delivery flow

`DeliveryProofScreen(taskId)`:

1. explain required proof and current destination;
2. capture with camera or select through system Photo Picker;
3. preview, replace, or remove image;
4. request foreground location in context and capture a fresh coordinate when available;
5. show disclosure that GPS supports verification/fraud review;
6. submit once with progress;
7. wait for authoritative completed task response.

Do not mark the task completed locally before upload and server transition succeed. Retain the local image URI after a recoverable network failure so the runner can retry with the same idempotency key, but delete temporary files after success/cancel/retention expiry.

## Delivery contract

```text
POST /api/mobile/v1/tasks/{taskId}/deliver
Content-Type: multipart/form-data
Idempotency-Key: ...

photo: binary
gpsLat: optional decimal
gpsLng: optional decimal
```

Server checks:

- authenticated selected runner;
- task is `accepted` or `in_progress`;
- image is present, <= 10 MiB, and decoded/sniffed as JPEG/PNG/WebP;
- coordinates are both present or neither and valid;
- storage path is server-generated;
- transition/proof/financial and shared synchronization order follows the existing command extraction;
- duplicate key does not create another proof, release, trust event, successor, or member completion.

If upload succeeds but a later transaction fails, server cleanup/reconciliation owns orphan handling. Android must not delete remote storage directly.

## Buyer proof display

`ProofCard` appears only to authorized participants/admin after proof exists. It shows image, server capture timestamp, and GPS indication/coordinate only if the existing privacy decision allows it. Signed URL expiry triggers detail refresh. Coil cache keys must not make private URLs durable beyond session; clear on logout.

Use neutral copy. A photo/GPS point is evidence, not definitive proof against every claim.

## Rating and tip flow

`RatingSheet(taskId)` is available to the buyer when task status is `completed` or `resolved`, selected runner exists, and no rating exists.

- required stars: integer 1–5;
- optional comment: trim and server length-limit;
- optional tip: decimal GHS, converted exactly to pesewas, nonnegative, maximum current action equivalent of GHS 10,000;
- show current simulated wallet balance and disclosure;
- one submit action with idempotency key.

```text
POST /api/mobile/v1/tasks/{taskId}/rating
{
  "stars": 5,
  "comment": "Careful delivery",
  "tipPesewas": 500
}
```

The server verifies buyer ownership/task state, prevents duplicates, atomically creates the rating and optional two-sided tip ledger entries, creates the trust event/refresh, and notifies the runner. The current web action releases escrow before calling the separate rating/tip RPC; the mobile command must harden this boundary with an idempotent transaction or an explicitly tested composition/reconciliation path so a failed tip cannot leave an ambiguous review response.

## Dispute choice

On completed tasks, present `Rate and close` and `Raise a dispute` as distinct buyer choices. Explain consequences without pressuring a rating. Dispute implementation is module 14. Once state/rating changes, refresh allowed actions.

## Errand-Share

Delivery proof and review use `taskId`, never only `groupId`. The runner follows ordered group route but submits each proof at that member's drop-off. First completion updates one task/member; second completion may close the group. Each buyer can see/review only their own task.

## Permissions and media

- Camera permission only when using camera; system Photo Picker needs no broad media permission on supported versions.
- Use `FileProvider`/scoped cache URI for camera output.
- Correct image orientation and downsample previews to avoid memory pressure, without altering the server upload limit contract.
- Strip unnecessary local metadata from processed uploads where feasible; server storage policy controls retention.
- GPS permission denial does not invent coordinates. Follow the backend's current optional-GPS behavior and warn that verification may be weaker.

## UI states and recovery

- Permission denied/permanently denied with alternate picker/settings path.
- Camera canceled keeps screen usable.
- Oversized/unsupported/corrupt image rejected before submit and rechecked server-side.
- Upload progress; cancel only before server accepts command.
- Timeout retains key/image and resolves by retry/status query.
- Task conflict refreshes and discards submission only when server confirms it is no longer applicable.
- Insufficient simulated tip balance preserves stars/comment and offers edit/top-up.
- Existing rating displays read-only stars/tip and blocks duplicate UI.

## File plan

```text
feature/proof/
  data/ProofApi.kt
  data/ProofRepositoryImpl.kt
  domain/DeliveryProofDraft.kt
  presentation/DeliveryProofViewModel.kt
  presentation/DeliveryProofScreen.kt
  presentation/ProofCard.kt
feature/ratings/
  data/RatingApi.kt
  data/RatingRepositoryImpl.kt
  presentation/RatingViewModel.kt
  presentation/RatingSheet.kt
```

## Tests

- Selected-runner/status authorization.
- MIME/content/size/coordinate validation and private storage paths.
- Double submit/timeout creates one proof, transition, release, trust event, recurrence successor, and shared-member completion; this specifically verifies the current proof-before-state-update ordering has been hardened.
- First/second shared member completion behavior.
- Rating 1/5 boundaries, duplicate prevention, comment trimming, exact tip limits and insufficient balance.
- Camera/picker/permission/process-recreation paths.
- Signed proof URL expiry and cross-user denial.

## Done criteria

- Delivery is reliable under retry and cannot duplicate financial/trust/recurrence effects.
- Proof access is private and every shared child remains independent.
- Rating/tip language and arithmetic reflect simulated money exactly.
