# 18 — Offline Sync, Security, and Testing

## Purpose

Define cross-cutting policies that keep the native client resilient without replaying unsafe marketplace commands, leaking sensitive data, or weakening backend/RLS guarantees.

## Offline classification

Classify every operation before implementing it.

### Cacheable reads

- dashboard and owned/assigned task summaries;
- task detail with sensitive fields encrypted/retained only as policy permits;
- privacy-safe opportunity cards (stale/claim-disabled);
- wallet/earnings/ledger projections;
- notifications and task chat metadata;
- settings and verification status.

Show `lastUpdated`, stale/offline state, and disable actions that require authoritative current state.

### Safe deferred/idempotent work

- FCM token registration/removal;
- mark notification/message read;
- analytics that contain no sensitive payload;
- explicitly designed message upload with stable client message ID;
- refresh/sync.

Use WorkManager with network constraints, bounded exponential backoff, user/account tags, and cancellation on logout.

### Foreground-confirmed only

Never blindly replay:

- create errand;
- top-up/hold/fund/tip;
- claim/accept/decline/start/pickup/deliver;
- cancel;
- dispute or admin resolution;
- verification submission;
- rating/tip;
- shared-group lifecycle commands.

These may be retried in foreground with the same persisted idempotency key after the user sees unresolved status. A status query or repeated same-key command establishes the terminal result.

## Sync design

```text
Room (observed UI source)
  ^ successful network projection in transaction
Repository
  |-- refresh on entry/pull/reconnect/realtime invalidation
  |-- cursor page merge by stable ID
  `-- safe WorkManager queue only
BFF/Postgres (authoritative source)
```

Store `ownerUserId`, `updatedAt`, `cachedAt`, and projection version. On account change, close subscriptions, cancel tagged work, and transactionally delete the prior user's rows before rendering the new graph.

Do not use client last-write-wins for tasks, money, availability, trust, disputes, or groups. Conflicts refresh server truth. Profile/settings drafts can merge only at field level if the API explicitly supplies versioning.

## Threat model and controls

| Threat | Required control |
|---|---|
| Extracted APK | No service-role/cron/Redis/SMTP/Twilio/Telegram/VAPID private secrets; restrict public provider keys |
| Stolen token | TLS, secure SDK/Keystore persistence, short-lived access token/refresh handling, logout/revocation |
| IDOR | BFF derives caller and checks participant/role/admin; RLS defense in depth |
| Tampered request | Server validation, allowlisted commands, Postgres constraints/RPC transactions |
| Replay/double tap | Idempotency keys plus task-scoped unique/transaction invariants |
| Stale realtime | Treat event as invalidation and re-fetch aggregate |
| Local leakage | User-scoped cache, backup exclusions, no sensitive logs, short media retention |
| Malicious media | Size/MIME decode checks, private buckets, generated paths, signed URLs |
| Cross-buyer share leak | Role-specific projections, separate child chat/proof/money, adversarial tests |
| Notification leak | Minimal FCM data payload and authorization after tap |
| Compromised admin session | Server admin check per command, reauth for high-risk work, audit trail |

Use network security configuration to require HTTPS. Certificate pinning is optional and carries operational rotation risk; add it only with a managed backup-pin/rotation design. Do not rely on obfuscation as secret storage.

## Privacy and retention

Create a data inventory before production for:

- account/profile/contact data;
- precise task and runner locations;
- chat content/images;
- proof photos/GPS;
- Ghana Card, selfie, vehicle license, emergency/next-of-kin data;
- wallet/ledger and disputes/fraud/audit.

Define purpose, controller/access, retention, deletion, backup, and incident handling. Android cache retention must be shorter than server retention and clear on logout. Crash/analytics tooling must redact or disable collection on sensitive screens. Never capture screenshots or session replay of verification, chat, proof, wallet, or admin review.

## Test pyramid

### Pure JVM unit tests

- DTO/domain/UI mapping, money/time/enum parsing;
- ViewModel reducers, validation, pagination, conflict and retry behavior;
- permission and connectivity state machines;
- repository cache/network policy with fakes;
- deep-link allowlisting and notification routing.

### Network contract tests

- BFF handler request validation, auth, roles, privacy projections, error envelope, idempotency;
- Android MockWebServer decoding/error mapping;
- checked OpenAPI/JSON fixtures shared in CI;
- unknown/new enum compatibility.

### Database/integration tests

Reuse and extend migration verification for:

- RLS participant/admin boundaries;
- matching finalization/decline/reopen;
- atomic hold/release/refund/rating-tip;
- task lifecycle telemetry;
- Errand-Share pairing/group/child/cancellation/sweep/privacy/concurrency;
- storage policies and signed URL authorization.

### Compose tests

- each screen's initial/content/empty/stale/error/restricted/conflict states;
- form keyboard/focus/validation and process recreation;
- role-specific actions and safe copy;
- TalkBack labels, 48 dp targets, large font, dark theme, small screen.

### Instrumented end-to-end

Use a dedicated Supabase test project or local stack with deterministic fixtures:

1. buyer/runner sign-up and session restore;
2. runner verification/admin approval/availability;
3. buyer post -> match -> fund -> runner accept -> pickup -> proof -> buyer rate/tip;
4. no-candidate task remains posted and self-claimable;
5. decline exhaustion reopens posted;
6. completed task leaves feed but remains history;
7. Today/Whenever automatic pair -> both fund -> one group offer -> independent completions;
8. group dissolution/survivor ordinary matching;
9. dispute auto/escalated/admin path;
10. logout/account switch cache and subscription cleanup.

## Existing algorithm/evaluation gates

Continue running web tests for matching, trust, fraud, arbitration, and Errand-Share. Reproduce deterministic matching and Errand-Share reports when their code/config changes. Android does not add its own competing algorithm evaluation. Production outcome analysis remains separate and must not promote simulation as real-world proof.

## CI pipeline

For BFF/web changes:

```text
npm run lint
npm run typecheck
npm test -- --run
npm run build
migration verification
```

For Android:

```text
./gradlew lintDebug
./gradlew testDebugUnitTest
./gradlew assembleDebug
./gradlew connectedCheck (critical device matrix)
dependency/secret/security scans
```

Add contract compatibility as a required joint gate. Use a staging deployment and test project; never point automated destructive flows at production.

## Observability

Capture request ID, endpoint template, response class, latency, app version, and coarse error category. Do not capture tokens, request bodies, coordinates, free text, URLs with signatures, identity/payment data, or notification contents. Correlate mobile request ID with server logs. Track crashes/ANRs, startup, network failure, push delivery registration, and command conflict rates without overstating business outcomes.

## Security release checks

- Decompile/review release APK for forbidden secrets and debug endpoints.
- Verify release minification rules do not break serialization.
- Test revoked/expired token, rooted/tampered client assumptions, and forced role/deep-link requests.
- Validate Android backup/data extraction rules.
- Review exported activities/services/receivers and immutable PendingIntents.
- Verify Storage/RLS policies in deployed environment.
- Rotate staging credentials after any accidental exposure.

## Done criteria

- Every repository method has an offline/retry classification.
- Unsafe commands cannot run from an unattended outbox.
- Cross-user, cross-role, replay, media, notification, and cache-clearing tests pass.
- Android and BFF contract compatibility is a required CI gate.
