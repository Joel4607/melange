# Security Remediation Tracker

Updated: 2026-08-31

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

## Open SEC items

| Order | ID | Finding | Risk / required outcome |
| ---: | --- | --- | --- |
| 1 | SEC-009 | The application rate limiter fails open when Redis is absent or unavailable | Protect costly write paths with a fail-closed or durable fallback policy that preserves controlled availability. |
| 2 | SEC-010 | Production CSP permits `unsafe-inline`, `unsafe-eval`, and overly broad outbound connections | Move to nonce/hash-based script policy and enumerate required connection origins without breaking Next.js or integrations. |
| 3 | SEC-011 | Wallet and escrow balances are simulated and can be auto-credited | Before balances become redeemable or represent real money, replace the trust model with an authoritative payment ledger and verified provider events. |
| 4 | SEC-012 | Local Supabase defaults are unsafe if reused in a shared or exposed environment | Harden configuration before any non-local deployment of the bundled development stack. |
| 5 | SEC-013 | Authenticated chat typing presence is broadcast broadly | Scope ephemeral presence events to the intended conversation participants. |
| 6 | SEC-014 | Runner-filter URLs contain precise GPS coordinates | Reduce precision or move location criteria out of URLs where logs/history exposure is unacceptable. |

## Completed related audit remediations

The audit also produced fixes before stable identifiers were assigned:

- Authenticated application routes are no longer cached by the service worker.
- Leaflet popup labels are HTML-escaped on create and update paths.
- Telegram webhooks require a configured secret and authenticated header.
- The production Nodemailer dependency was upgraded to a patched release.
- Unverified users are blocked before privileged runner-feed queries execute.

Each open SEC item should be implemented, verified, committed, and pushed as
an independent change unless two items are inseparable at the code level.
