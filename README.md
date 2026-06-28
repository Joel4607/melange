# Melange

Walking skeleton for the Melange errand marketplace: a minimal **Next.js + Supabase** app, deployed to **Vercel** with CI/CD. The goal of this first slice is to prove the end-to-end pipeline (code → CI → deploy → live Supabase connection) before any features are built on top.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind
- **Supabase** (Postgres + Auth) via `@supabase/ssr`
- **Vercel** for hosting + Git-based CI/CD
- **GitHub Actions** for lint / typecheck / build on every PR

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + anon key
npm run dev                  # http://localhost:3000
```

The home page shows a live **Supabase connection** status.

## Database & migrations

Schema lives in `supabase/migrations/`, applied in filename order via the
[Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push        # applies any unapplied migrations
```

Migration map (each file is one phase; foreign keys always point at something
already created, RLS is enabled last once every table exists):

| File | Contents |
| ---- | -------- |
| `0001_greetings.sql` | walking-skeleton demo table |
| `0002_extensions_and_enums.sql` | `pgcrypto` + domain enums |
| `0003_profiles.sql` | `profiles` (1:1 with `auth.users`) + signup trigger |
| `0004_runner_and_tasks.sql` | `runner_profile`, `tasks` |
| `0005_activity.sql` | match snapshots, proofs, ratings, trust events |
| `0006_escrow.sql` | `wallets`, `ledger_entries` (service-role writes only) |
| `0007_trust_safety.sql` | `disputes`, `fraud_flags` |
| `0008_notifications.sql` | `notifications` |
| `0009_rls.sql` | `is_admin()` + Row-Level Security policies |

**Verify migrations** (apply them to a throwaway Postgres + smoke-test the
signup trigger and RLS) — this is exactly what CI runs:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres \
  ./scripts/verify-migrations.sh
```

## Trust framework (algorithm module)

The core technical contribution lives in `src/lib/algorithm/` as **pure,
framework-agnostic functions** (inputs → scores/decisions) with no database,
network, or Next.js imports, so it can be unit-tested and reasoned about in
isolation:

| Module | Responsibility |
| ------ | -------------- |
| `geo.ts` | Haversine great-circle distance |
| `trust.ts` | `computeTrust` — time-decayed, Bayesian cold-start trust score |
| `matching.ts` | `rankRunners` — normalized weighted-sum multi-criteria ranking |
| `fraud.ts` | `evaluateFraud` — explainable rule-based risk (noisy-OR aggregation) |
| `arbitration.ts` | `arbitrate` — rule-based dispute resolution with human escalation |
| `types.ts` | Shared input/output types and config shapes |

Unit tests live in `src/lib/algorithm/__tests__/` and run with
[Vitest](https://vitest.dev):

```bash
npm test          # run once (CI)
npm run test:watch
```

## Wiring layer (DB ⇄ algorithm)

`src/lib/server/` is the only place the pure algorithm meets the database. It
runs through a **service-role** Supabase client (`src/lib/supabase/service.ts`)
for the privileged writes RLS bars clients from — escrow, match snapshots,
dispute resolutions:

| Function | What it does |
| -------- | ------------ |
| `generateMatchRun(taskId)` | loads available runners, derives fresh trust + fraud risk, ranks via `rankRunners`, persists a `match_runs` + `match_candidates` snapshot |
| `holdFunds` / `releaseFunds` / `refund` | simulated escrow: move a task's price between `wallets.balance` / `held`, append the `ledger_entries` audit row |
| `resolveDispute(disputeId)` | gathers proof/GPS/fraud context, runs `arbitrate`, auto-resolves clear cases (applying the escrow effect) or marks the dispute `escalated` |

Seed a fresh end-to-end scenario (users → task → match → hold → proof → dispute
→ release) against your project:

```bash
npm run seed      # needs SUPABASE_SERVICE_ROLE_KEY in .env.local
```

## Environment variables

| Variable                        | Where        | Notes                              |
| ------------------------------- | ------------ | ---------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | client+server | Project URL                        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client+server | Anon (public) key                  |
| `SUPABASE_SERVICE_ROLE_KEY`     | server only  | Privileged; never expose to client |

Set the same variables in the Vercel project (Settings → Environment Variables).

## Scripts

| Command             | Purpose                  |
| ------------------- | ------------------------ |
| `npm run dev`       | Dev server               |
| `npm run build`     | Production build         |
| `npm run lint`      | ESLint                   |
| `npm test`          | Vitest (algorithm tests) |
| `npm run typecheck` | TypeScript (no emit)     |

## Deploy (Vercel)

1. Import this repo in Vercel (New Project → import `Joel4607/melange`).
2. Add the env vars above.
3. Vercel builds every push: PRs get preview deployments, `main` is production.
