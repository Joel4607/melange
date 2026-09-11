# Security Remediation Tracker

Updated: 2026-09-11

This document is the canonical tracker for the security audit. SEC-001 and
SEC-002 retain their original identifiers. The remaining findings received
stable identifiers here and are ordered primarily by estimated remediation
effort.

## Completed SEC items

| ID | Finding | Resolution |
| --- | --- | --- |
| SEC-001 | Admin verification actions accepted caller-controlled authority | Server actions now require the authenticated admin session and derive the actor ID on the server. |
| SEC-002 | Next.js release contained a published security vulnerability | Next.js and its matching ESLint configuration were upgraded to 16.3.3. |
| SEC-003 | Development tooling resolved vulnerable PostCSS, `brace-expansion`, and `js-yaml` versions | The lockfile now selects patched Tailwind/PostCSS and transitive tooling releases; a full `npm audit` reports zero vulnerabilities. |
| SEC-004 | Telegram URL configuration fell back to a hard-coded production deployment | Telegram links and webhook setup now require and validate an explicit canonical `NEXT_PUBLIC_SITE_URL`. |
| SEC-005 | Push subscription endpoints exposed raw Supabase errors | Database failures now return a stable public response while structured diagnostics remain in server logs. |
| SEC-006 | Sensitive private-key and signing artifact formats were not comprehensively ignored | Git now ignores the audited key/bundle formats, and the contributor guidance covers storage, verification, and rotation after exposure. |
| SEC-007 | Telegram account-link tokens had a time-of-check/time-of-use race | A service-role-only database function now locks, validates, links, and consumes each token in one transaction; the token table is protected by RLS and explicit grants. |
| SEC-008 | CI workflows used mutable third-party references and implicit token permissions | External actions and the PostgreSQL service image are pinned to immutable digests, while the workflow token is limited to read-only repository contents. |
| SEC-009 | The application rate limiter failed open when Redis was absent or unavailable | PostgreSQL now provides the authoritative atomic counter for every potentially allowed request; Redis remains an aligned early-rejection layer, and failures deny access instead of bypassing protection. |
| SEC-010 | Production CSP permitted executable inline scripts, evaluation, and broad outbound connections | Every HTML request now receives a unique nonce-based script policy, a pinned hash covers Next.js's built-in error style, and browser connections/images are restricted to the configured Supabase and map origins. |
| SEC-014 | Runner-filter URLs contained precise GPS coordinates | An authenticated server action stores search location in a 30-minute, HttpOnly, path-scoped, SameSite=Strict cookie (Secure in production). Filter URLs and legacy redirects strip GPS, including before login redirects. Unit and server-render tests, type-checking, and production build passed; deployed browser smoke-check remains pending. |

## Open SEC items

| Order | ID | Finding | Risk / required outcome |
| ---: | --- | --- | --- |
| 1 | SEC-013 | Authenticated chat typing presence is broadcast broadly | Implemented and policy-tested; user confirmed hosted migration 0050 returned success on 2026-09-11. Live Realtime verification remains pending. |
| 2 | SEC-011 | Prototype wallet policy revised by user request | Restoration of simulated top-ups and automatic errand funding is implemented and database-tested. Hosted migration 0051 and deployed wallet smoke-check remain pending; this behavior is intentionally unsuitable for real money. |
| 3 | SEC-012 | Local Supabase defaults were unsafe if reused in a shared or exposed environment | Auth/config hardening is committed, but live testing showed Docker Desktop ignored the network's localhost binding default. Full-stack isolation is unresolved; do not treat the launcher as verified safe. |

### SEC-011 approved prototype wallet restoration

On 2026-09-11, the user explicitly approved restoring simulated manual top-ups and automatic errand funding instead of the fixed GHS 1,000 signup allocation. Migration `0051_restore_simulated_wallet_funding.sql` provisions new wallets at zero and preserves all existing balances, open holds, and ledger rows. It does not recover history previously removed by 0049, and 0049 must not be rerun.

The top-up action derives the wallet owner from the authenticated session, validates positive cent-precision amounts, rate-limits requests, and returns safe errors. Database mutations remain service-role-only. The shared hold function locks the task and wallet, adds only the shortfall, and records the hold atomically; existing direct, matched, self-claimed, and shared errand flows reuse it. Existing tip selection and atomic rating/payout/tip behavior are retained; tips still require enough available demo credits.

Disposable PostgreSQL tests cover zero signup allocation, repeated top-ups, invalid amounts, RPC permissions, automatic funding with and without a shortfall, retry and concurrent funding, atomic rollback on overflow/failed tips, and unchanged existing data when 0051 is applied twice. The full migration smoke suite also passed for matching, sharing, rate limiting, Telegram token linking, and private typing RLS.

Apply only 0051 in hosted Supabase, deploy the wallet UI, and confirm manual top-ups and an underfunded test errand work. Keep all balances explicitly non-redeemable. Real-money use requires replacing simulated credit issuance with verified payment-provider events; this exception is for the supervisor's prototype demonstration only.

### SEC-013 deployment and verification

- User reported that `supabase/migrations/0050_private_chat_typing.sql` returned success in hosted Supabase on 2026-09-11. This records migration execution, not independent verification of live channel access. Do **not** run `scripts/auth-shim.sql` or the fixture tests on hosted Supabase.
- The updated client joins a private typing channel. A restrictive Realtime RLS policy permits only the task buyer and selected runner, even when another policy grants broad access. Until the migration is applied, private typing should fail closed; persisted chat messages use their existing authorization.
- Disposable PostgreSQL migration/policy tests passed, including outsider, unrelated-admin, anonymous, malformed-topic, and broad-policy bypass cases. Native local Supabase accepted the migration, but live WebSocket isolation has not yet been verified.
- After deploying, reload old chat tabs and check typing between buyer and selected runner, then verify a third account cannot join their private topic. Public and private topics are separate; old public-only clients must be refreshed.
- Realtime caches authorization until reconnect or a new JWT. Removing a selected runner takes effect at the next authorization check, not instantly on an already-authorized socket. See [Supabase Realtime authorization](https://supabase.com/docs/guides/realtime/authorization).

Docker is used only for disposable tests, not as a replacement for the app's hosted Supabase/Vercel stack. No global Docker port-binding preference has been changed. Isolated SQL tests can run without publishing container ports while the separate SEC-012 startup issue remains open.

### SEC-014 privacy boundary

The search cookie is an untrusted preference, never proof of identity or location. It is validated and bound to the current account to avoid accidental reuse after account switching; no account-database location is written. Coordinates still travel in the authenticated POST and scoped cookie, so infrastructure must not log sensitive bodies or cookie headers. This fix cannot erase old URLs from historical logs, bookmarks, or browser history, nor hide the initial request when someone opens an old GPS URL.

After deployment, use and clear nearby search, confirm distance sorting still works, and verify filter/login navigation contains no `lat` or `lng`. SEC-014 requires no SQL migration.

## Completed related audit remediations

The audit also produced fixes before stable identifiers were assigned:

- Authenticated application routes are no longer cached by the service worker.
- Leaflet popup labels are HTML-escaped on create and update paths.
- Telegram webhooks require a configured secret and authenticated header.
- The production Nodemailer dependency was upgraded to a patched release.
- Unverified users are blocked before privileged runner-feed queries execute.

Each open SEC item should be implemented, verified, committed, and pushed as
an independent change unless two items are inseparable at the code level.
