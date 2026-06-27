# Melange — Errand Marketplace

A student errand marketplace built around a **closed-loop trust framework**. The
academic contribution is the integrated trust core, not the CRUD around it:

- **Matching** — a normalized, multi-criteria weighted-sum ranking (proximity,
  trust, availability, urgency-fit), where every criterion is mapped to `[0, 1]`
  so the declared weights actually control the ranking.
- **Trust** — a time-decayed reputation model with a verification-weighted
  Bayesian cold-start prior.
- **Fraud** — explainable, rule-based detection (GPS mismatch, impossible speed,
  rapid cancellations, repeated-pair disputes) with a two-tier response.
- **Arbitration** — rule-based dispute resolution that auto-resolves clear cases
  and escalates ambiguous/high-stakes ones to a human admin (assisted by AI, who
  still makes the final call).

## Tech stack

- **Next.js 16 (App Router) + TypeScript + Tailwind**, configured as a PWA.
- **Supabase** — Postgres, Auth, Storage, Realtime, with Row-Level Security.
- The trust framework lives in `src/lib/algorithm/` as a **pure, framework-
  agnostic, unit-tested TypeScript module** (no DB/HTTP imports) — this is the
  artifact to defend.

## Project layout

```
src/
  app/                      Next.js routes (home + /demo/matching)
  components/               Client components (service-worker registration)
  lib/
    algorithm/              ← the contribution: pure trust/matching/fraud/arbitration
      geo.ts                Haversine distance
      matching.ts           rankRunners()
      trust.ts              computeTrust()
      fraud.ts              evaluateFraud()
      arbitration.ts        arbitrate()
      __tests__/            Vitest unit tests
    supabase/               browser + server Supabase clients
supabase/
  migrations/               0001 schema, 0002 row-level security
```

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in Supabase keys (see below)
npm run dev                  # http://localhost:3000
```

The home page links to `/demo/matching`, which runs the matching algorithm on a
seeded scenario with no backend required.

### Supabase setup

1. Create a project at <https://supabase.com>.
2. Copy the project URL and anon key into `.env.local`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
3. Run the SQL in `supabase/migrations/` in order (SQL editor or the Supabase
   CLI) to create the schema and RLS policies.

## Scripts

| Command             | Purpose                          |
| ------------------- | -------------------------------- |
| `npm run dev`       | Start the dev server             |
| `npm run build`     | Production build                 |
| `npm run lint`      | ESLint                           |
| `npm run typecheck` | TypeScript type-check (no emit)  |
| `npm test`          | Run the unit tests (Vitest)      |

## Status

Week-1 scaffold: project setup, the pure algorithm module + tests, Supabase
clients, the data model + RLS migrations, and PWA configuration. Marketplace UI,
escrow ledger, proof capture, notifications, the Telegram admin console, and the
evaluation/simulation harness follow in later phases.
