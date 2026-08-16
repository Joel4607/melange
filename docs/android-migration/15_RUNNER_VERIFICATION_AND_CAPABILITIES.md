# 15 — Runner Verification and Capabilities

## Purpose

Rebuild Ghana Card/selfie/vehicle-license verification, admin review status, runner eligibility gating, and the capability profile used by ordinary and shared matching.

## Current web implementation

- `/app/verify`, `verify-form.tsx`, and `submitVerification` collect identity/contact/emergency information and private images.
- Required images are Ghana Card front/back and selfie; vehicle license is optional in the current action.
- Additional fields include legal name, date of birth, Ghana Card number, residential address, emergency contact and next-of-kin names/phones, plus email/phone.
- Images accept JPEG/PNG/WebP up to 10 MiB and upload to private `verification` storage.
- `verification_requests` tracks pending/approved/rejected and reviewer/timestamps.
- `src/lib/server/admin-verification.ts` and admin actions approve/reject and update verified state.
- Verification is required before a runner can become available, claim, or accept.
- Capabilities are stored on `runner_profile` and are hard matching gates; shared opportunities require the union.

## Verification screens

### `VerificationOverviewScreen`

States:

- not started: requirements, privacy/retention explanation, start action;
- draft: resume action;
- pending: submitted timestamp, no duplicate submission;
- approved: verified status;
- rejected: safe reason if the backend stores one; resubmit action;
- load/error/offline.

### `RunnerVerificationScreen`

Use a multi-step flow:

```text
Identity details -> Ghana Card front/back -> Selfie ->
Vehicle license (optional) -> Contacts/address -> Review -> Submit
```

Each photo has capture/picker, preview, replace, and validation. Clearly label why each sensitive field is collected. Do not save the draft to cloud before explicit submit unless a secure draft API is designed.

## Validation

Follow the current action's required fields exactly when implementation begins; current row/action contract includes:

- legal name, date of birth, Ghana Card number, residential address;
- emergency contact name/phone;
- next-of-kin name/phone;
- Ghana Card front/back and selfie;
- optional vehicle license;
- required phone and optional email.

Apply trim, reasonable server length bounds, date format/range, Ghana-specific number validation only if backed by a documented rule, and paired contact fields. Images are <= 10 MiB and decoded JPEG/PNG/WebP. Client validation assists UX; server revalidates everything.

## API

```text
GET  /api/mobile/v1/verification-requests/latest
POST /api/mobile/v1/verification-requests       # multipart
```

Require runner role and idempotency key. Server generates storage paths, uploads/records all parts, removes already-uploaded files on a failed multi-file submission where safe, creates a pending request, and notifies admins. Response contains only request ID/status/timestamps—never echoes document paths or sensitive numbers.

Admin APIs:

```text
GET  /api/mobile/v1/admin/verification-requests?status=pending&cursor=&limit=
GET  /api/mobile/v1/admin/verification-requests/{id}
POST /api/mobile/v1/admin/verification-requests/{id}/approve
POST /api/mobile/v1/admin/verification-requests/{id}/reject
```

Review endpoint supplies short-lived signed images only to authorized admins. Approve/reject is idempotent/audited and updates the correct verification flags consistently.

## Verification state consistency

The schema has verification information on `profiles`, `runner_profile`, and request records due to incremental migrations. Before mobile release, define one authoritative eligibility query/server function and have `GET /me`, availability, claim, and accept use it. Do not let Android reconcile potentially inconsistent flags.

Admin approval must update all required authoritative fields transactionally or through one core service. Rejection must not accidentally retain operational eligibility.

## Capabilities screen

`CapabilitiesScreen` shows server-defined categories with multi-select and the current empty-set fallback semantics. Save through:

```text
GET /api/mobile/v1/task-categories
PUT /api/mobile/v1/me/capabilities
{ "capabilities": ["Documents", "Groceries"] }
```

The current allowlist is `Market Runs`, `Grocery Shopping`, `Pharmacy Pickup`, `Clothes & Apparel`, `Pickup & Delivery`, `Household Items`, `Gifts & Occasions`, and `Any Other Errand`. The server allowlists and deduplicates categories. Capability changes affect future eligibility; they do not rewrite an already accepted task. Shared opportunity eligibility requires all distinct member categories and load capacity for two.

## Permissions and sensitive media

- Use camera permission only when capturing; use system Photo Picker otherwise.
- Use app-scoped temporary files and explicit cleanup.
- Disable Android cloud backup for sensitive draft media or exclude its directories.
- Do not place IDs in MediaStore/gallery by default.
- Avoid OCR/biometric face matching unless separately designed, consented, secured, and defended; current app uses human admin review.
- Prevent screenshots on verification/review screens if the product accepts the UX tradeoff; at minimum ensure recent-app thumbnails do not expose documents.

## Errors and recovery

- Local step validation preserves draft and focuses the failed field.
- Offline submission is not queued in generic WorkManager because it contains highly sensitive data; require foreground confirmation and resumable strategy only if securely designed.
- Upload timeout reuses the same idempotency key and local URIs.
- Pending conflict refreshes latest request.
- Rejection without stored reason uses neutral copy and resubmission guidance; do not invent a reason.
- Approval Realtime/notification triggers `GET /me` refresh and unlocks runner operations.

## Security and privacy

- Private bucket, RLS/BFF admin authorization, short-lived signed URLs.
- Service-role never enters Android.
- Encrypt transport; redact request bodies, paths, document numbers, contact details, and signed URLs from logs/crash reports.
- Document retention/deletion policy before production; collect only necessary fields.
- Admin access is audited and should use reauthentication for high-risk review actions if supported.
- A verified visual badge is a projection; operational commands recheck server eligibility.

## File plan

```text
feature/verification/
  data/VerificationApi.kt
  data/VerificationRepositoryImpl.kt
  domain/VerificationDraft.kt
  domain/VerificationStatus.kt
  presentation/VerificationOverviewScreen.kt
  presentation/RunnerVerificationViewModel.kt
  presentation/RunnerVerificationScreen.kt
  presentation/components/DocumentCaptureCard.kt
feature/capabilities/
  data/CapabilityRepository.kt
  presentation/CapabilitiesViewModel.kt
  presentation/CapabilitiesScreen.kt
```

## Tests

- Required/optional fields, dates, paired contacts, image MIME/size/content.
- Runner-only submission, one pending request, idempotent retry, partial-upload cleanup.
- Approval/rejection consistency across request/profile/runner eligibility.
- Non-admin cannot obtain signed verification URLs or review.
- Sensitive data absent from logs, Room, navigation args, backups, and notifications.
- Capability allowlist/dedup/empty behavior and group union eligibility.
- Pending-to-approved realtime refresh unlocks availability only after server confirmation.

## Done criteria

- A runner can submit and track verification without leaking identity data.
- One server eligibility decision gates every operational runner command.
- Capability behavior matches ordinary and Errand-Share matching.
