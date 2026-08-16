# Melange Native Android Migration Guide

- Status: implementation specification
- Source baseline: `origin/main` after PR #86 (Errand-Share)
- Target: native Android application built with Kotlin and Jetpack Compose
- Backend: reuse Supabase and the existing Next.js server-side domain layer

## 1. Purpose and evidence boundary

Melange is an errand marketplace for two primary user roles:

- buyers post, fund, track, review, and dispute errands;
- runners become verified and available, receive or claim opportunities, complete errands, and earn payouts;
- administrators review identity submissions, fraud and trust information, disputes, audit history, and Telegram linking.

The Android application must preserve the current business rules. It is a new native client, not a new marketplace backend and not a Kotlin rewrite of the matching or Errand-Share algorithms. The existing TypeScript algorithms, server orchestration, Postgres functions, RLS policies, and telemetry remain authoritative.

The project currently uses simulated wallet top-ups and escrow. The Android UI must label them as simulated and must not imply that a real payment processor is connected. Matching and Errand-Share reports are deterministic simulations; the app must not present them as real-world superiority, guaranteed savings, or actual traffic predictions.

## 2. Document set and implementation order

Work through these documents in order. A module is complete only when its stated tests and done criteria pass.

1. [Project setup](01_PROJECT_SETUP.md)
2. [Core architecture and data](02_CORE_ARCHITECTURE_AND_DATA.md)
3. [Authentication](03_AUTHENTICATION.md)
4. [Navigation](04_NAVIGATION.md)
5. [Role dashboards](05_ROLE_DASHBOARDS.md)
6. [Profile, settings, and availability](06_PROFILE_SETTINGS_AND_AVAILABILITY.md)
7. [Errand posting and recurrence](07_ERRAND_POSTING_AND_RECURRENCE.md)
8. [Matching and runner feed](08_MATCHING_AND_RUNNER_FEED.md)
9. [Errand lifecycle and tracking](09_ERRAND_LIFECYCLE_AND_TRACKING.md)
10. [Errand-Share](10_ERRAND_SHARE.md)
11. [Wallet, escrow, and earnings](11_WALLET_ESCROW_AND_EARNINGS.md)
12. [Chat, notifications, and realtime](12_CHAT_NOTIFICATIONS_AND_REALTIME.md)
13. [Proof, ratings, and tips](13_PROOF_RATINGS_AND_TIPS.md)
14. [Trust, fraud, and disputes](14_TRUST_FRAUD_AND_DISPUTES.md)
15. [Runner verification and capabilities](15_RUNNER_VERIFICATION_AND_CAPABILITIES.md)
16. [Location, maps, and permissions](16_LOCATION_MAPS_AND_PERMISSIONS.md)
17. [Admin and Telegram](17_ADMIN_AND_TELEGRAM.md)
18. [Offline sync, security, and testing](18_OFFLINE_SYNC_SECURITY_AND_TESTING.md)
19. [Release and migration checklist](19_RELEASE_AND_MIGRATION_CHECKLIST.md)

## 3. Current web application inventory

### Public and authentication

| Web route | Current purpose | Android destination |
|---|---|---|
| `/` | Marketing landing page | Not required in the authenticated app; optional lightweight welcome screen |
| `/get-started` | Buyer/runner role selection | `RoleSelectionScreen` in onboarding |
| `/login` | Email/password sign-in | `LoginScreen` |
| `/signup` | Buyer/runner sign-up and email confirmation | `SignUpScreen`, `EmailConfirmationScreen` |
| `/status` | Deployment/Supabase diagnostic | Debug-build diagnostics only; no production tab |
| `/auth/callback` | Supabase email callback | App Link callback handled by Android/Supabase Auth |
| `/auth/signout` | Cookie session termination | `AuthRepository.signOut()` |

### Buyer and runner application

| Web route | Access | Android destination |
|---|---|---|
| `/app` | buyer/runner | Role-specific `DashboardScreen` |
| `/app/post` | buyer | `PostErrandScreen` and focused location/stop pickers |
| `/app/runners` | buyer | `RunnerDirectoryScreen` with filter sheet |
| `/app/feed` | verified active runner | `OpportunityFeedScreen` |
| `/app/errands/[id]` | participant | `ErrandDetailScreen`; shared progress is rendered within it |
| `/app/wallet` | buyer | `WalletScreen` |
| `/app/earnings` | runner | `EarningsScreen` |
| `/app/notifications` | authenticated | `NotificationCenterScreen` |
| `/app/settings` | authenticated | `SettingsScreen`, with runner subsections |
| `/app/verify` | runner | `RunnerVerificationScreen` |
| `/app/admin` | admin | `AdminHomeScreen` or retained secure web admin in phase one |
| `/app/admin/telegram-link` | admin | `AdminTelegramLinkScreen` or retained web flow |

### Separate admin routes

The web app also exposes `/admin`, `/admin/login`, `/admin/audit`, `/admin/trust`, `/admin/trust/[id]`, and `/admin/telegram-link`. Do not accidentally create two Android admin implementations. Use one admin graph guarded by `profiles.is_admin`; phase one may deliberately keep advanced admin work on the web while the native user workflows ship.

### Current reusable feature components

The web source includes buyer and runner dashboards, dashboard widgets, runner cards and filters, post and delivery forms, task chat, a map, live runner location, availability and schedule editors, capabilities, verification, wallet/top-up views, and notification surfaces. Compose should reproduce their behavior, not their desktop layout.

### Backend, data, and integrations

- Supabase Auth supplies identity and JWT sessions.
- Postgres is the source of truth. RLS protects client-visible rows.
- Supabase Realtime currently updates tasks, messages, notifications, verification, wallet, and runner state.
- Supabase Storage holds verification images, proof images, and chat images. Access uses policies or short-lived signed URLs.
- Next.js Server Actions currently validate user intent and call privileged service-role orchestration.
- Postgres RPCs provide atomic matching, offer/decline, escrow, cancellation, ratings/tips, and Errand-Share transitions.
- Optional Upstash Redis provides live location presence and rate limiting with graceful fallback.
- Web Push/VAPID, SMTP email, and Telegram are server integrations. Android push should add FCM without removing existing channel preferences.
- A protected scheduled endpoint releases expired Errand-Share windows. It remains a server-only cron concern.

### Current HTTP route handlers

| Existing route | Use in Android migration |
|---|---|
| `/api/runner-location` | Preserve its participant/state authorization behind the mobile task-location contract |
| `/api/push/subscribe`, `/api/push/unsubscribe` | Web Push only; add separate FCM device routes for Android |
| `/api/internal/errand-share/sweep` | Keep server/cron only; Android must never call it or know its secret |
| `/api/telegram/webhook` | Keep Telegram-server only |
| `/auth/callback`, `/auth/signout` | Replace client behavior with Supabase Android callback/session APIs; keep routes for web |

All remaining current mutations are Server Actions rather than public APIs. They require the BFF work described below.

### Current Server Action inventory

Use these names to locate the existing behavior before extracting mobile command services:

| Area | Current functions |
|---|---|
| Posting/matching | `createErrand`, `rematch`, `payIntoEscrow`, `acceptOffer`, `claimTask`, `declineOffer` |
| Errand-Share | `confirmSharedEscrow`, `rematchSharedGroup`, `claimSharedGroup`, `acceptSharedOffer`, `declineSharedOffer`, `startSharedTrip` |
| Runner operation | `setAvailability`, `clearAvailabilityOverride`, `updateScheduledHours`, `updateCapabilities`, `updateLocation` |
| Lifecycle/evidence | `markPickedUp`, `markDelivered`, `cancelErrand`, `cancelRunnerErrand`, `rateRunner`, `raiseDispute` |
| Chat/notifications | `sendMessage`, `markMessagesRead`, `markAllNotificationsRead`, `markNotificationRead`, `deleteNotification`, `clearReadNotifications`, `updateNotificationPreferences` |
| Profile/money/verification | `updateProfile`, `topUpWallet`, `submitVerification` |
| Admin | `loginAdmin`, `adminResolveDispute`, `updateFraudFlag`, `approveVerificationAsAdmin`, `approveVerification`, `rejectVerificationAsAdmin`, `rejectVerification`, `updateRunnerStatus`, `clearRunnerFraudFlags`, `recalculateRunnerTrust` |
| Telegram admin | `generateTelegramLink`, `getAdminTelegramStatus`, `unlinkTelegram` |

The BFF should call shared extracted cores, not import UI forms or reproduce these functions' logic independently.

### Database and storage inventory

| Area | Authoritative tables/data |
|---|---|
| Identity and runner state | `profiles`, `runner_profile`, Supabase `auth.users` |
| Errands and matching | `tasks`, `match_runs`, `match_candidates`, `match_outcomes` |
| Evidence and reputation | `proofs`, `ratings`, `trust_events` |
| Money | `wallets`, append-only `ledger_entries` |
| Safety | `disputes`, `fraud_flags` |
| Communication | `notifications`, `messages`, `push_subscriptions` |
| Verification | `verification_requests` |
| Telegram/admin audit | `telegram_link_tokens`, `telegram_webhook_updates`, `telegram_admin_actions` |
| Errand-Share | `errand_share_groups`, `errand_share_members`, `errand_share_decisions`, group match runs/candidates/outcomes |

Private Supabase Storage buckets are `verification`, `proofs`, and `chat-images`. The Android app should receive short-lived authorized access or upload through the BFF; it must never turn these buckets public.

### Web-to-Android technology mapping

| Current web mechanism | Android replacement | Reuse decision |
|---|---|---|
| Next.js App Router pages/layouts | Navigation Compose destinations and Compose screens | Behavior and information architecture only; JSX is not reusable |
| React component/local state | Stateless composables plus `ViewModel`/`StateFlow` | Reuse validation/state semantics, not hooks |
| Next.js Server Components | Repository-loaded screen projections | Replace with BFF queries and Room-backed flows |
| Next.js Server Actions | Authenticated `/api/mobile/v1` commands | Extract and reuse their server command logic; Android cannot call Actions directly |
| Next middleware/cookie refresh | Supabase Android session manager and bearer interceptor | Preserve safe-return/guard behavior using native tokens |
| Tailwind/CSS/responsive sidebar | Material 3 theme, adaptive Compose layout, role bottom bar | Reuse brand tokens, not class names/layout |
| Leaflet/browser tiles | One chosen Android map SDK | Reuse provider/attribution decision and coordinates |
| Browser geolocation | Fused Location Provider plus runtime permissions | Reuse freshness/authorization rules |
| Browser file input | Camera contract and system Photo Picker | Reuse MIME/size/server storage rules |
| Web Push/VAPID/service worker | Firebase Cloud Messaging | Keep web push for web; add server-side Android device registration |
| Browser local/cache behavior | Room, DataStore, WorkManager | Use explicit cache/outbox policy; no direct localStorage translation |
| Supabase browser Realtime | Authenticated Supabase Realtime invalidation | Re-fetch authoritative aggregates after events |
| Pure TypeScript algorithms | Existing server execution | Reuse directly on the server, never translate a competing Kotlin authority |
| Postgres RPCs/RLS/Storage | Existing Supabase backend | Reuse; call privileged operations only through BFF |
| Vercel/SMTP/Telegram/Redis/cron | Existing server integrations | No Android implementation or secret exposure |
| PWA install prompt/manifest | Google Play-installed native application | Remove; not a native screen |

### Web-specific code that must not be copied

Do not move React/JSX, DOM APIs, CSS/Tailwind classes, Next redirects/revalidation, cookie adapters, Service Worker code, VAPID subscription code, Node-only modules, or server environment access into Android. The pure TypeScript algorithms remain reusable in their existing server runtime; their concepts may appear in Kotlin models and copy, but their authoritative execution does not move.

## 4. Target system

```text
Android app (Compose)
  |-- Supabase Auth SDK: sign-in, sign-up, token refresh, sign-out
  |-- HTTPS /api/mobile/v1: all privileged commands and safe projections
  |-- Supabase Realtime: authorized invalidation/event hints
  `-- FCM: background notifications
              |
              v
Next.js mobile BFF (stateless)
  |-- verifies Supabase bearer JWT and role for every request
  |-- validates request DTOs and uses idempotency keys
  |-- calls existing src/lib/server orchestration
  `-- never returns service-role credentials or private cross-user rows
              |
              v
Supabase: Postgres + RLS + Auth + Realtime + Storage
  `-- existing atomic RPCs and source-of-truth state machines
```

### Why a mobile BFF is required

Most user mutations are Next.js Server Actions, which are not a stable public API. Several use a service-role client because clients are intentionally barred from matching, money, trust, and lifecycle writes. Android must therefore use a versioned backend-for-frontend, proposed at `/api/mobile/v1`.

The BFF is a thin transport layer. It must call existing orchestration functions or extracted shared command services; it must not duplicate matching scores, fee calculations, pairing rules, authorization, or transaction sequences in Kotlin.

Safe RLS reads may initially use the Supabase Android client, but one consistent BFF query layer is preferred where rows need joins, signed media URLs, privacy projections, pagination, or stable mobile contracts. Realtime events are invalidation hints: after an event, re-fetch the authorized projection.

## 5. Non-negotiable domain contracts

### Roles and authorization

- Sign-up role metadata is `buyer` or `runner`. Treat missing/unknown metadata as buyer only for backward compatibility; the BFF must still authorize the requested operation.
- Admin is not a third public sign-up role. It comes from `profiles.is_admin` and must be checked server-side.
- Runner operations that expose work require verified identity and an active runner account. Suspended or quarantined runners cannot go available, claim, or accept.
- UI guards improve UX but never replace BFF/RLS authorization.

### Task state machine

```text
posted -> matched -> accepted -> in_progress -> completed
   ^         |
   |         `-- all candidates decline -> posted
   `-- no candidates / failed match stays posted

completed -> disputed -> resolved
posted|matched -> cancelled
accepted|in_progress -> cancelled under the authorized runner/buyer rules
```

Never delete completed tasks to hide them. Open feeds query `posted`; history retains completed, resolved, disputed, and cancelled rows for auditability.

### Errand-Share state machines

Task share state: `ineligible | waiting | paired | released`.

Group state: `posted -> awaiting_funding -> offered -> accepted -> in_progress -> completed`, with `dissolved` as the terminal exception path. The two member tasks remain the financial, proof, rating, dispute, and buyer-facing records.

ASAP Express, manually selected runner, pickup-only, and custom-stop errands bypass sharing. Today (`normal`) waits 10 minutes, Whenever (`low`) waits 30 minutes. Today and Whenever may pair only if the enumerated route meets the Today deadline. Pairing is automatic; matching occurs once for the two-task group.

### Money

- API money fields use integer pesewas (`Long`) or decimal strings; never `Double`.
- Display with `GHS` and two decimal places using locale-aware formatting.
- `price` is the buyer budget, `fee` is the platform fee, and runner payout is `max(0, price - fee)`.
- Wallet top-up and escrow are simulated in the current project. Preserve explicit labels.
- All holds, releases, refunds, tips, and rating/tip creation remain atomic server operations.

### Time and location

- API timestamps are ISO-8601 UTC strings and Kotlin `Instant` domain values.
- Today deadlines use `Africa/Accra`, ending at 23:59:59.999 on posting day.
- Coordinates are WGS84 and validated to latitude `[-90, 90]`, longitude `[-180, 180]`.
- Do not claim live-traffic ETAs. Errand-Share uses a versioned haversine/speed/service-time planning estimate.

## 6. Migration-time issues and explicit assumptions

Resolve these deliberately rather than hiding them in Android code:

- The web client uses Server Actions, not a public mobile API. This guide assumes the same Next.js deployment will add the versioned BFF before native feature work.
- Signup and route guards use one `buyer|runner` metadata role, while an early schema comment describes dual-capability accounts. The guide follows live behavior. Changing to role switching needs a separate backend/product migration.
- The public role currently lives in user-editable Auth `user_metadata`, and several runner helpers only require a user ID. Before mobile release, persist/derive role from a server-controlled profile column or Auth `app_metadata` and enforce it in every runner/buyer command. Android navigation metadata is never authorization.
- Signup sends phone in Auth metadata, but the current profile trigger copies only the name. Decide one authoritative phone write during confirmed onboarding so `/me` and Settings do not silently lose it.
- `profiles.verified`, `runner_profile.verified`, and verification request status overlap. Add one authoritative server eligibility decision before native runner commands.
- Post and capability category constants are duplicated in React. Move them to one server-owned catalog endpoint and use the same catalog in both clients.
- Manual-runner posting should apply the same verified, active, availability, and capability eligibility policy as matching. Treat any current gap as a backend hardening item, not as Android behavior to reproduce.
- Current delivery uploads/inserts proof before the conditional task update, and rating releases escrow before the separate rating/tip RPC. Before exposing retryable mobile commands, make these multi-step boundaries idempotent and transactionally coherent (or add explicit reconciliation/cleanup) so a timeout cannot create duplicate proof/effects or a split financial/review outcome.
- Current schedule evaluation uses the server runtime's local clock. Standardize effective runner schedules on the documented `Africa/Accra` zone in the shared server decision before Android relies on it.
- Partial hand-written TypeScript row types are not an Android contract. Introduce checked API schemas and generated/verified DTO fixtures.
- The architecture overview says Redis was deliberately omitted, while current server code supports optional Upstash presence/rate limiting. The mobile contract must remain storage-agnostic and preserve graceful fallback.
- FCM device storage/dispatch does not yet exist. Add it server-side; do not replace existing web push, email, or Telegram channels.
- Password recovery, SMS/phone OTP, geocoding/search provider, real payment, cash-out, background-location tracking, and buyer price discounts are not current user features. Do not invent them during migration.
- General task/runner text search does not currently exist; only the runner directory's supported filters/sort do. Do not add unbounded search as accidental migration scope.
- Advanced admin may remain on secure web for the first Android release. This is a declared scope decision, not silent parity.

The initial Android project location is assumed to be top-level `android/`. Exact minimum SDK, map provider, dependency versions, and sensitive-data retention require decisions from current device, provider, and legal/privacy evidence at implementation time.

## 7. Android architecture

Use a single-activity, feature-oriented MVVM architecture. Keep domain rules on the server unless a pure client calculation is explicitly presentation-only.

```text
app/                         application, MainActivity, root navigation
core/
  common/                    Result, dispatcher, clock, money/time helpers
  designsystem/              theme, tokens, reusable Compose primitives
  network/                   Retrofit, auth interceptor, error mapping
  database/                  Room database, converters, DAOs
  datastore/                 non-secret settings and cache metadata
  auth/                      session manager and role model
  navigation/                routes, deep links, navigation helpers
  location/                  permission and location abstractions
  notifications/             FCM token and notification routing
  testing/                   fakes, fixtures, coroutine rules
feature/
  auth/ dashboard/ profile/ posting/ matching/ tracking/
  errandshare/ wallet/ chat/ proof/ trust/ verification/
  location/ admin/
```

Within each feature, use `data`, `domain`, and `presentation` only where the feature has enough complexity to benefit. Avoid empty layers and one-method use cases. Repositories define the boundary between ViewModels and network/cache implementations.

### State flow

```text
Compose UI -> user intent -> ViewModel -> repository -> BFF/Supabase/Room
Compose UI <- immutable StateFlow <- mapped domain result <- source of truth
```

Each screen has one immutable `UiState`, a sealed `Action`, and a buffered `Effect` channel for navigation, snackbars, permission launch, or external intents. Do not store a `Context`, `NavController`, mutable DTO, or transient snackbar flag inside domain models.

### Loading and error contract

Every data screen must support initial loading, content, empty, stale/offline content, recoverable error, authorization/session expiry, and refresh. Every command must disable or guard duplicate submission and use a server idempotency key where money or lifecycle state changes.

Proposed API error envelope:

```json
{
  "error": {
    "code": "TASK_STATE_CONFLICT",
    "message": "This errand has already changed.",
    "fieldErrors": { "pricePesewas": "Budget must exceed the fee." },
    "retryable": false,
    "requestId": "..."
  }
}
```

Map HTTP status codes consistently: `400` validation, `401` unauthenticated/expired token, `403` role/policy violation, `404` privacy-preserving not found, `409` state/idempotency conflict, `422` domain rule failure, `429` rate limit, and `5xx` retryable server failure.

## 8. API contract rules

All routes are under `/api/mobile/v1`, require HTTPS, accept `Authorization: Bearer <Supabase access token>` except auth SDK operations, and return JSON unless uploading media. Use cursor pagination (`cursor`, `limit`) for lists. Return only the fields the screen needs.

Commands that can be retried require `Idempotency-Key`, generated once per user intent and persisted until a terminal response. At minimum this covers create errand, top-up, escrow confirmation, offer response, pickup/start, delivery, cancellation, dispute, rating/tip, and verification submission.

Representative resource groups:

```text
/me, /me/preferences, /me/runner-profile, /me/availability
/dashboard, /runners, /opportunities
/tasks, /tasks/{id}, /tasks/{id}/match, /tasks/{id}/escrow
/tasks/{id}/accept|decline|pickup|deliver|cancel|disputes|rating
/share-groups/{id}/fund|rematch|claim|accept|decline|start
/tasks/{id}/messages, /notifications, /wallet, /earnings
/verification-requests
/admin/verifications, /admin/disputes, /admin/fraud, /admin/trust, /admin/audit
/devices/fcm-token
```

The module documents define exact request intent and response projection. During backend implementation, add OpenAPI or checked JSON schemas and contract tests before the Android client depends on an endpoint.

## 9. Data and cache policy

- Network/Postgres remains the source of truth.
- Room stores read projections, cursor metadata, notification/message pages, and a small outbox for explicitly safe deferred commands.
- Never queue money, acceptance, cancellation, delivery, dispute, or rating/tip commands for blind background replay. Keep them pending in the UI and require an online confirmed response.
- DataStore stores theme, onboarding completion, last selected non-sensitive filters, and sync metadata. Do not place passwords or long-lived raw tokens in plain DataStore.
- Auth session material uses the Supabase SDK's supported secure persistence; if custom persistence is unavoidable, encrypt keys with Android Keystore.
- Cache rows are user-scoped. Delete all user-scoped Room data, pending work, signed URLs, and notification state on logout/account change.

## 10. Mobile UX translation

- Use a bottom bar for the four most frequent destinations per role and put secondary actions in Settings/Profile or a modal drawer.
- Keep Post Errand as a prominent buyer action and Open Errands as a prominent runner action.
- Use full-screen screens for map/location selection, proof capture, verification, and long forms.
- Use modal bottom sheets for filters, status explanations, and destructive confirmations.
- Use dialogs only for short irreversible confirmations.
- Keep minimum 48 dp touch targets, proper labels/content descriptions, dynamic type resilience, keyboard-safe forms, and visible focus/order.
- Provide light and dark Material 3 themes using Melange's green, orange, cream, and ink brand tokens with contrast testing.

## 11. Android platform capabilities

| Capability | Why | Policy |
|---|---|---|
| Internet | API/Auth/Realtime/media | Required |
| Notifications | offers, state changes, messages | Runtime permission on Android 13+; ask after explaining value |
| Foreground location | availability, map selection, proof GPS | Ask in context; allow manual map entry where feasible |
| Background location | continuous active-trip tracking only if product later requires it | Do not request in phase one without a proven requirement and disclosure |
| Camera | proof, selfie, ID capture | Activity Result API; camera-only flow may use a scoped temporary URI |
| Photo picker | proof/chat/verification alternative | System Photo Picker; avoid broad storage permission |
| WorkManager | cache refresh, FCM token registration, safe upload retry | Network constraints; no hidden lifecycle transitions |

Biometrics are optional only for locally reopening an already authenticated session. They are not a substitute for server authentication and should not block the first release.

## 12. Recommended libraries

Use a Gradle version catalog and pin current stable versions when the Android project is created. Prefer the Compose BOM rather than independent Compose version pins.

- Compose BOM, Material 3, activity-compose, lifecycle-runtime-compose, lifecycle-viewmodel-compose
- Navigation Compose with type-safe destinations where supported
- Kotlin coroutines and Flow
- Hilt and Hilt Navigation Compose
- Retrofit, OkHttp, and kotlinx.serialization
- Supabase Kotlin/Auth client compatible with the chosen Kotlin toolchain
- Room with KSP
- Preferences DataStore
- WorkManager
- Firebase Messaging
- Coil Compose
- Google Play Services Location; Maps Compose or MapLibre based on the final tile/provider decision
- JUnit, kotlinx-coroutines-test, Turbine, MockWebServer, Room testing, Compose UI test, Hilt test, and AndroidX Test

Do not add both Retrofit and Ktor clients, multiple DI frameworks, or multiple image loaders.

## 13. Global definition of done

A module is not complete merely because its success screen renders. It must have:

- BFF contracts implemented and contract-tested;
- server-side authorization and domain validation;
- DTO/domain/UI separation and money/time correctness;
- loading, empty, offline/stale, validation, auth, conflict, and retry states;
- accessibility semantics and dark-theme checks;
- ViewModel/repository tests plus critical Compose flow tests;
- analytics/telemetry limited to non-sensitive operational events;
- no secrets, precise cross-buyer data, identity photos, signed URLs, or tokens in logs;
- evidence that current web behavior is preserved or an explicitly approved mobile adaptation.

The final parity and release gate is [19_RELEASE_AND_MIGRATION_CHECKLIST.md](19_RELEASE_AND_MIGRATION_CHECKLIST.md).
