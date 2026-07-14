# Mélange — Codebase State & Remaining Work

## Current State (as of 2026-07-12)

### Stack & Setup
- Next.js 16 + React 19 + TypeScript 5 + Tailwind 4 (Vercel target)
- Supabase (Postgres + Auth + RLS) via `@supabase/ssr`
- CI: GitHub Actions runs `lint → typecheck → test → build` and migration verification
- Local checks: `npm run lint` (pass), `npm run typecheck` (pass), `npm test` (28/28 pass), `npm run build` (not run yet in this session)

### What is Implemented

| Area | Status | Notes |
|------|--------|-------|
| Auth / onboarding | Done | Email + password sign-up, login, sign-out, role split (buyer/runner), middleware-protected `/app` |
| Landing / marketing | Done | Branded, responsive landing page with services, pricing, testimonials, WhatsApp CTA |
| Buyer post errand | Done | `/app/post` form with geolocation, category, urgency, budget; creates task and auto-runs matcher |
| Matching algorithm | Done | Pure `rankRunners` with proximity, trust, availability, urgency-fit; tested |
| Trust algorithm | Done | `computeTrust` with Bayesian cold start, time decay, verified bonus, fraud penalty; tested |
| Fraud algorithm | Done | `evaluateFraud` with noisy-OR aggregation (GPS, speed, cancellations, pair disputes); tested |
| Arbitration | Done | `arbitrate` rule-based dispute resolution with confidence escalation; tested |
| Escrow wiring | Done | `topUp`, `holdFunds`, `releaseFunds`, `refund` with `wallets` + `ledger_entries` |
| Matching wiring | Done | `generateMatchRun` persists `match_runs` + `match_candidates`; `offerToTopCandidate` handles decline/re-offer |
| Dispute wiring | Done | `resolveDispute` gathers proof, applies escrow effect, records `disputes` outcome |
| Buyer tracking page | Done | `/app/errands/[id]` shows match, trust, escrow status, pay/confirm, rating |
| Runner dashboard | Done | `/app` shows availability toggle, offers, active jobs, mark picked-up/delivered |
| Database schema | Done | 10 migrations covering profiles, tasks, runner, match, escrow, disputes, RLS, notifications |
| Seed script | Done | `npm run seed` runs full happy-path smoke test against live Supabase |

### Key Gaps / Remaining Work

The following are intentionally or currently not implemented. Grouped by priority.

#### P0 — Core marketplace loop not fully closed
1. **Proof-of-delivery submission (runner)**
   - `proofs` table exists, seed uses it, `disputes.ts` reads it, but there is no UI or action for a runner to upload a photo + GPS at delivery.
   - Needed for: `markDelivered` to record real evidence, `arbitrate` to use `gpsMatch`.

2. **Buyer dispute UI**
   - `disputes` table and `resolveDispute` exist, but no action/page lets a buyer raise a dispute from the errand tracking page.

3. **Cancel errand**
   - No buyer or runner cancel flow; `cancelled` status is defined in `task_status` but never used.

4. **Trust score caching**
   - `runner_profile.trust_score` column is defined but never written; `generateMatchRun` recomputes trust on every run. A trigger or job should persist `computeTrust` output back to `runner_profile`.

#### P1 — Matching / runner experience polish
5. **Runner capabilities**
   - `matching.ts` filters by `capabilities` array, but `runner_profile` has no `capabilities` column and there is no UI to set them.

6. **Dropoff location**
   - `tasks` has `dropoff_lat`/`dropoff_lng` but the post form only captures `pickup_lat`/`pickup_lng`.

7. **Live location updates**
   - `runner_profile.current_lat`/`current_lng` is set once at availability toggle; no periodic/background GPS update.

8. **Real-time status updates**
   - All UI updates require page refresh; no Supabase Realtime subscription or polling.

#### P2 — Operational / admin
9. **Notifications system**
   - `notifications` table exists but no service or UI to create, send, or display them.

10. **Admin panel for disputes / fraud flags**
    - `is_admin()` is used in RLS, but no admin routes exist to resolve escalated disputes or manage `fraud_flags`.

11. **Verification workflow**
    - `profiles.verified` exists but is set only by admin/service; no user-facing ID verification flow.

#### P3 — Business / scale / nice-to-have
12. **Dynamic pricing / fee breakdown**
    - `price` is the buyer's budget; no distance-based fee breakdown, platform fee, or runner payout calculation.

13. **Wallet / payout dashboard**
    - Only the buyer's `held` amount is shown; no full wallet balance or runner payout view.

14. **Search / filter / task feed**
    - Runners see offers only via `selected_runner_id`; no open task feed.

15. **Maps / visualization**
    - No map component for pickup/dropoff or live runner location.

16. **PWA / offline support**
    - No service worker, manifest, or offline behavior.

## Recommended Implementation Order

1. **Close the delivery proof loop** — runner uploads photo + GPS on `markDelivered`.
2. **Add dispute raising** — buyer can raise a dispute from the tracking page.
3. **Add cancel flow** — buyer can cancel before acceptance; runner can decline after accept (with trust impact).
4. **Cache trust score** — update `runner_profile.trust_score` after trust events or on a schedule.
5. **Notifications** — create notifications on offer, accept, delivery, dispute; add in-app badge/list.
6. **Admin dispute panel** — resolve escalated disputes and view `fraud_flags`.

## Files That Touch Each Area

- `src/app/app/actions.ts` — buyer/runner actions
- `src/app/app/errands/[id]/page.tsx` — buyer tracking page
- `src/app/app/page.tsx` — runner dashboard
- `src/app/app/post/` — post errand form
- `src/lib/server/matching.ts` / `escrow.ts` / `disputes.ts` — wiring layer
- `src/lib/algorithm/` — pure algorithm module
- `supabase/migrations/` — schema
- `scripts/seed.ts` — end-to-end smoke test
