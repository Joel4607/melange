# 17 — Admin and Telegram

## Purpose

Map the existing administrative verification, dispute, fraud, trust, audit, runner-status, and Telegram-link workflows to a least-privilege Android plan without making them a dependency for the first native buyer/runner release.

## Current web implementation

- `/admin/login` uses a separate admin entry but still relies on authenticated user/admin checks.
- `/admin` summarizes pending verifications, open/escalated disputes, and active fraud flags.
- `/admin/audit` displays administrative action history.
- `/admin/trust` and `/admin/trust/[id]` show runner status, trust breakdown/history, flags, and controls for active/quarantined/suspended, clear flags, and recalculate.
- Admin actions resolve disputes, update fraud flags, approve/reject verification, link/unlink Telegram, and write audits.
- Telegram tables/tokens/webhook deduplicate updates and audit Telegram-originated actions.
- `/api/telegram/webhook` is a server integration protected by bot/webhook validation logic; bot tokens are server-only.

## Delivery recommendation

Ship native buyer/runner workflows first and retain the mature web admin for operational use until the BFF admin contracts, strong audit tests, and secure mobile review experience are complete. The Android app may show an `Admin tools` entry only when `GET /me` returns `isAdmin=true`.

If phase one opens web admin, use an external browser/Custom Tab to the HTTPS admin origin. Do not use an unrestricted WebView, inject Supabase/service tokens, or bypass the web admin's session checks.

## Native admin screens

### `AdminHomeScreen`

Counts and links for pending verification, escalated/open disputes, active fraud flags, runner restrictions, and recent audit. Counts are server-projected.

### `VerificationQueueScreen` / `VerificationReviewScreen`

Review sensitive fields and short-lived private images, then approve or reject. Require explicit confirmation. A rejection reason is shown to the runner only if a protected schema field and policy are added; do not place internal notes in notification payloads.

### `DisputeQueueScreen` / `DisputeReviewScreen`

Show participant-safe task context, proof, GPS comparison, fraud context, automated recommendation/confidence/rule, escrow state, and audit history. Admin chooses refund/release/partial where allowed. Present recommendation as assistance, not a forced decision.

### `FraudQueueScreen`

Filter active/cleared/confirmed flags; show rule, severity, safe evidence, related task, runner, status. Updates are audited.

### `RunnerTrustDetailScreen`

Show status, verification, trust breakdown, recent events, rating, completion/cancellation/dispute history, active flags. Commands: active/quarantined/suspended, clear flags, recalculate trust.

### `AuditLogScreen`

Cursor-paginated immutable actions with actor, source (web/mobile/Telegram/system), action, target, time, and result. Sensitive before/after payloads remain redacted.

## Admin APIs

```text
GET  /api/mobile/v1/admin/summary
GET  /api/mobile/v1/admin/verification-requests
GET  /api/mobile/v1/admin/verification-requests/{id}
POST /api/mobile/v1/admin/verification-requests/{id}/approve|reject
GET  /api/mobile/v1/admin/disputes
GET  /api/mobile/v1/admin/disputes/{id}
POST /api/mobile/v1/admin/disputes/{id}/resolve
GET  /api/mobile/v1/admin/fraud-flags
PATCH /api/mobile/v1/admin/fraud-flags/{id}
GET  /api/mobile/v1/admin/runners
GET  /api/mobile/v1/admin/runners/{id}/trust
POST /api/mobile/v1/admin/runners/{id}/status
POST /api/mobile/v1/admin/runners/{id}/trust/recalculate
POST /api/mobile/v1/admin/runners/{id}/fraud-flags/clear
GET  /api/mobile/v1/admin/audit
```

Every handler verifies the authenticated user and authoritative `profiles.is_admin`; never rely on role metadata or an `isAdmin` request field. High-risk commands require idempotency keys and may require recent reauthentication.

## Telegram linking

Current flow generates a short-lived single-use link/token, checks link status, and unlinks. Android-native screen can call:

```text
POST   /api/mobile/v1/admin/telegram-link
GET    /api/mobile/v1/admin/telegram-link
DELETE /api/mobile/v1/admin/telegram-link
```

The POST response supplies a short-lived HTTPS/Telegram link suitable for an external intent. Do not display or log the bot token, webhook secret, or raw internal token after use. Regeneration invalidates or supersedes prior tokens according to server policy.

Telegram bot webhook, deduplication, admin alerts, and Telegram-originated audit remain entirely server-side. Android never calls `/api/telegram/webhook` and never contains `TELEGRAM_BOT_TOKEN`/`MELANGE_TELEGRAM_BOT_TOKEN`.

## Admin security

- Least privilege and server-side admin check on each request.
- Short-lived signed verification/proof media; no durable download/cache/export by default.
- Consider `FLAG_SECURE` for identity review and app-switcher protection.
- Device compromise cannot expose service-role/bot/cron/SMTP/Redis secrets because none are present.
- Administrative action audit is mandatory and append-only.
- Concurrency checks prevent double resolution/approval and money duplication.
- Push notifications to admins contain only queue/event IDs and safe summaries.
- Consider reauthentication/biometric local gate for convenience, but server session/admin authorization remains required.

## Loading and errors

- Queue empty states by filter.
- Partial media failure can retry signed URL without losing case context.
- Stale/concurrently handled case refreshes and shows existing outcome.
- Authorization loss immediately removes admin graph and clears sensitive cache.
- Offline admin data should be minimal; disable mutations and avoid persisting identity documents.
- Audit write failure must fail/alert the administrative command according to the server's chosen invariant, not silently discard accountability.

## File plan

```text
feature/admin/
  data/AdminApi.kt
  data/AdminRepositoryImpl.kt
  domain/AdminCase.kt
  presentation/AdminHomeScreen.kt
  presentation/VerificationQueueScreen.kt
  presentation/VerificationReviewScreen.kt
  presentation/DisputeQueueScreen.kt
  presentation/DisputeReviewScreen.kt
  presentation/FraudQueueScreen.kt
  presentation/RunnerTrustDetailScreen.kt
  presentation/AuditLogScreen.kt
  presentation/AdminTelegramLinkScreen.kt
```

## Tests

- Non-admin/removed-admin denial for every route and deep link.
- Approve/reject/resolve/status/flag commands are idempotent and audited.
- Concurrent admins see current outcome and do not duplicate financial effects.
- Identity/proof media URLs expire and never enter long-lived cache/logs.
- Telegram token generation, expiry, regeneration, unlink, and external intent.
- Bot/cron/service secrets absent from APK and Android configuration.
- Web-admin retained-path decision is tested/documented if native screens are deferred.

## Done criteria

- First release has a deliberate, documented admin operating path.
- Any native admin function has parity, auditability, and security equal to the web function before it replaces it.
