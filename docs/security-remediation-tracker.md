# Security Remediation Tracker

Updated: 2026-09-04

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
| SEC-011 | Wallet and escrow balances were simulated and could be auto-credited | The prototype now grants one database-enforced GHS 1,000 demo allocation per account, removes arbitrary and automatic credits, preserves atomic simulated escrow/tips, and labels every balance as non-redeemable demo data. |
| SEC-012 | Local Supabase defaults were unsafe if reused in a shared or exposed environment | The CLI stack is now started through a localhost-bound Docker network, its Auth and optional-service defaults are hardened, CI enforces the policy, and deployment guidance explicitly prohibits using the local stack outside one development computer. |

## Open SEC items

| Order | ID | Finding | Risk / required outcome |
| ---: | --- | --- | --- |
| 1 | SEC-013 | Authenticated chat typing presence is broadcast broadly | Scope ephemeral presence events to the intended conversation participants. |
| 2 | SEC-014 | Runner-filter URLs contain precise GPS coordinates | Reduce precision or move location criteria out of URLs where logs/history exposure is unacceptable. |

## Completed related audit remediations

The audit also produced fixes before stable identifiers were assigned:

- Authenticated application routes are no longer cached by the service worker.
- Leaflet popup labels are HTML-escaped on create and update paths.
- Telegram webhooks require a configured secret and authenticated header.
- The production Nodemailer dependency was upgraded to a patched release.
- Unverified users are blocked before privileged runner-feed queries execute.

Each open SEC item should be implemented, verified, committed, and pushed as
an independent change unless two items are inseparable at the code level.
