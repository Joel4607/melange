# 19 — Release and Migration Checklist

## Purpose

Turn the specifications into an ordered delivery plan and a final parity gate. Check an item only with code, tests, and environment evidence.

## Recommended phases

### Phase 0 — Contract freeze and backend preparation

- [ ] Record the web source commit and database migration baseline.
- [ ] Define `/api/mobile/v1` error envelope, auth middleware, pagination, request IDs, and idempotency storage/behavior.
- [ ] Extract transport-neutral command services from Server Actions without changing web behavior.
- [ ] Define one authoritative runner verification/eligibility query.
- [ ] Define integer-pesewa and ISO timestamp DTO conventions.
- [ ] Add BFF contract/RLS/privacy tests.

Outcome: Android can consume stable, authorized contracts without service credentials.

### Phase 1 — Android foundation

- [ ] Create Gradle project, variants, version catalog, Compose/Material 3, Hilt, Retrofit, serialization, Room, DataStore.
- [ ] Add theme/design primitives, network errors, session manager, cache scoping, test fakes, and CI.
- [ ] Configure staging Supabase/Firebase/public map credentials safely.

Outcome: reproducible signed-out shell and test infrastructure.

### Phase 2 — Authentication and navigation

- [ ] Role selection, login, signup, confirmation App Link, session restore/refresh/logout.
- [ ] Authoritative `/me` bootstrap and buyer/runner/admin guards.
- [ ] Typed root/buyer/runner graphs and safe notification/deep links.

Outcome: correct role shell survives cold start, expiry, and account switch.

### Phase 3 — Read-first marketplace

- [ ] Buyer/runner dashboard projections.
- [ ] Owned/assigned task list/detail and status timeline.
- [ ] Runner directory and restricted opportunity feed.
- [ ] Room cache, pagination, pull-to-refresh, realtime invalidation.

Outcome: users can inspect current server state safely before mutations move native.

### Phase 4 — Profile, verification, availability, and posting

- [ ] Profile/preferences/settings.
- [ ] Runner verification upload/status and capabilities.
- [ ] Schedule/manual availability with in-context foreground location.
- [ ] Location picker, task quote, posting, multi-stop and recurrence drafts.

Outcome: verified runners can become eligible and buyers can create every supported errand type.

### Phase 5 — Matching and ordinary lifecycle

- [ ] Manual rematch, self-claim, candidate escrow/offer, accept/decline/next/reopen.
- [ ] Pickup/start, runner/buyer cancellation, live location, outcome telemetry.
- [ ] No-candidate and decline-exhaustion behavior verified on device.

Outcome: ordinary errand works end to end and completed work leaves only the open feed.

### Phase 6 — Errand-Share

- [ ] Buyer waiting/paired/funding/release states and safe notifications.
- [ ] One restricted shared feed card; no child duplication.
- [ ] Two independent holds, group claim/offer/accept/decline/start/rematch.
- [ ] Ordered assigned-runner route and independent member completion.
- [ ] Cancellation/dissolution/survivor release, privacy, countdown, and cron observation.

Outcome: automatic pair-first/group-match flow reaches both independent completions.

### Phase 7 — Wallet, proof, chat, ratings, disputes

- [ ] Simulated wallet/ledger/earnings/top-up disclosure.
- [ ] Proof capture/upload/GPS and signed display.
- [ ] Task-scoped text/image chat and read state.
- [ ] Rating/tip exact atomic flow.
- [ ] Dispute creation and status.

Outcome: full financial/evidence/communication closure for ordinary and shared child tasks.

### Phase 8 — Notifications and admin operating path

- [ ] FCM token lifecycle, Android 13+ permission, safe payload/deep links.
- [ ] Notification center and channel preferences.
- [ ] Confirm secure retained web admin or finish tested native queues/reviews/audit.
- [ ] Telegram link external intent; webhook remains server-only.

Outcome: background updates and a documented administrative support path.

### Phase 9 — Hardening and release

- [ ] Offline classifications/outbox restrictions, cache migration/clear, reconnect behavior.
- [ ] Full accessibility, dark theme, small-screen and poor-network passes.
- [ ] Security/privacy/backup/exported-component/release APK review.
- [ ] Staged end-to-end, load/rate-limit, crash/ANR, and Play pre-launch checks.
- [ ] Rollout/monitoring/rollback/support runbooks.

Outcome: staged production release with measurable technical health and preserved web fallback.

## Complete web-to-Android parity checklist

### Public/auth/session

- [ ] Buyer/runner role selection
- [ ] Email/password login
- [ ] Buyer and runner signup metadata
- [ ] Email confirmation callback/App Link
- [ ] Session refresh and authenticated guards
- [ ] Safe internal return/deep links
- [ ] Logout and account-switch data clearing
- [ ] Diagnostic status retained as debug tooling or explicitly omitted

### Buyer experience

- [ ] Buyer dashboard, counts, active/completed history
- [ ] Browse/filter/sort runners and manually select one
- [ ] Post title, description, category, route, urgency, budget, reference
- [ ] Optional drop-off/pickup-only
- [ ] Up to five ordered stops
- [ ] Daily/weekly/monthly recurrence and end date
- [ ] Authoritative fee/payout quote
- [ ] Task detail/status timeline/map
- [ ] Rematch and candidate escrow confirmation
- [ ] Cancellation and atomic refund
- [ ] Assigned-runner live location during allowed states
- [ ] Proof viewing, rating, optional tip, dispute
- [ ] Wallet, held funds, ledger, simulated top-up

### Runner experience

- [ ] Runner dashboard, offers, active/completed work
- [ ] Verification-required/restricted state
- [ ] Manual and scheduled availability
- [ ] Foreground location capture and presence cleanup
- [ ] Canonical capability editing
- [ ] Open ordinary opportunity feed
- [ ] Ordinary self-claim
- [ ] Offer accept/decline and next-candidate rotation
- [ ] Pickup/start, proof delivery, cancellation
- [ ] Earnings, tips, buyer rating, trust score/history

### Matching reliability

- [ ] Eligibility gates: available, active, verified, located, fraud-cleared, capable, capacity
- [ ] Server-only deterministic ranking and version snapshot
- [ ] Exact active match-run linkage
- [ ] No candidates leaves task posted
- [ ] Manual rematching remains available
- [ ] All declines atomically reopen posted
- [ ] Concurrent stale attempt cannot overwrite task
- [ ] Self-claim telemetry retained but excluded from ranking claims
- [ ] Lifecycle outcome timestamps collected
- [ ] Completed tasks absent from posted-only feed but retained in history

### Errand-Share

- [ ] ASAP Express excluded
- [ ] Manual runner, pickup-only, and custom-stop excluded
- [ ] Today 10-minute and Whenever 30-minute window
- [ ] Today/Whenever cross-pair meets Today deadline
- [ ] Different buyers and group size exactly two
- [ ] Pickup/drop-off separation, positive saving, detour constraints
- [ ] Deterministic route/partner tie-breaking remains server-side
- [ ] Automatic pair first, then one group match
- [ ] Required capability union and load units two
- [ ] One safe group feed card; child tasks suppressed
- [ ] Both independent escrow holds before offer
- [ ] Group decline rotation/reopen/rematch/self-claim
- [ ] Atomic group accept/start across both tasks
- [ ] Independent member proof/completion/rating/tip/dispute
- [ ] Group completes after second member
- [ ] Cancellation/dissolution/survivor path
- [ ] Cross-buyer private details never exposed
- [ ] Protected cron remains server-only and idempotent
- [ ] Predicted/simulated copy never claims cash or proven real-world savings

### Communication and integrations

- [ ] Per-task participant-only text/image chat
- [ ] Separate chats for shared child tasks
- [ ] In-app notification list/read/delete/clear
- [ ] Notification channel preferences
- [ ] FCM registration/rotation/removal and safe payloads
- [ ] Supabase Realtime invalidation/reconnect refresh
- [ ] SMTP/Web Push/Telegram remain server channels
- [ ] Telegram admin link supported or retained on web
- [ ] Optional Redis absence degrades safely

### Proof, trust, fraud, and disputes

- [ ] Private JPEG/PNG/WebP uploads with 10 MiB limit and content validation
- [ ] Optional fresh proof GPS; no fabricated coordinate
- [ ] Short-lived signed proof/chat/verification URLs
- [ ] Trust and buyer rating displayed separately
- [ ] Delivery/cancellation/dispute fraud evaluation remains server-owned
- [ ] Completed-owner-only dispute
- [ ] Auto arbitration and human escalation
- [ ] Atomic refund/release/partial admin outcome
- [ ] Runner status active/quarantined/suspended
- [ ] Admin fraud flag update/clear and trust recalculation
- [ ] All admin mutations audited

### Verification/admin

- [ ] Ghana Card front/back, selfie, optional vehicle license
- [ ] Legal identity/address/emergency/next-of-kin fields
- [ ] Pending/approved/rejected/resubmission states
- [ ] One authoritative verification eligibility decision
- [ ] Private storage and admin-only signed review media
- [ ] Admin summary, verification, dispute, fraud, trust, audit operating path
- [ ] Non-admin forced route/endpoint denial

### Android quality and security

- [ ] Material 3 mobile layouts, no desktop sidebar copy
- [ ] Bottom navigation by role and typed nested routes
- [ ] Loading, content, empty, stale/offline, validation, auth, conflict, rate-limit, server-error states
- [ ] 48 dp touch targets, TalkBack, large text, contrast, dark theme
- [ ] Camera/Photo Picker/location/notification permissions asked in context
- [ ] No broad storage or unnecessary background location permission
- [ ] Tokens stored through supported secure session persistence
- [ ] User-scoped Room cache and logout clearing
- [ ] Unsafe commands excluded from automatic outbox
- [ ] Exact integer money and injected time/Accra deadline handling
- [ ] No forbidden server secrets in source/APK/logs
- [ ] BFF/RLS/Storage/deep-link/notification/privacy adversarial tests
- [ ] Unit, contract, migration, Compose, instrumented E2E, and release checks pass

## Cutover strategy

1. Keep web production live while Android uses staging.
2. Deploy versioned BFF routes without changing web clients.
3. Run a closed internal Android test against staging fixtures.
4. Run a limited production pilot with server feature flags/allowlist if needed.
5. Compare error/conflict/crash and completion telemetry; do not compare simulated outcome claims as production facts.
6. Expand staged rollout only when lifecycle, money, privacy, and notification gates pass.
7. Retain web fallback/admin until Android parity and operational support are proven.

## Rollback

- Mobile API remains backward-compatible for supported app versions.
- Server feature flags can disable risky native entry points without corrupting task state.
- Store rollout can halt/revert while web remains available.
- Database migrations used by both clients require forward-compatible rollback planning; never drop fields while released clients depend on them.
- Revoked mobile sessions/tokens and FCM tokens can be invalidated server-side.

## Final release sign-off

- [ ] Product owner confirms UX/copy and explicitly accepts all deferrals.
- [ ] Backend owner confirms API/RPC/RLS/Storage/idempotency/cron invariants.
- [ ] Android owner confirms signed build, permissions, accessibility, offline, and store policy.
- [ ] Security/privacy reviewer confirms secrets, sensitive media/location, retention, logs, notifications, and admin controls.
- [ ] QA confirms ordinary and Errand-Share end-to-end matrices on supported devices.
- [ ] Operations confirms monitoring, alerts, support, admin access, and rollback.
- [ ] Documentation commit and source baseline are recorded in the release notes.
