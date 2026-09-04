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

### Local Supabase safety

The Supabase CLI stack is for development on this computer only. It uses
development credentials and does not provide the TLS or edge rate limiting
required for an exposed environment. Do not run `supabase start` directly and
never publish its ports to a LAN or the internet.

After installing project dependencies and starting Docker Desktop, use:

```bash
npm run supabase:start:local
```

This command validates `supabase/config.toml`, creates a dedicated Docker
network whose published ports bind to `127.0.0.1`, and starts Supabase with that
network using the repository-pinned Supabase CLI. `npm run
supabase:check-local` runs the configuration policy without starting Docker.

For hosted production, use a Supabase Platform project rather than the CLI
stack. Before launch, enable database Network Restrictions and SSL enforcement,
configure CAPTCHA and trusted custom SMTP, mirror the repository's password
policy, protect the Supabase organization with MFA, and review Security Advisor.
See Supabase's [production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
and [local-development warning](https://supabase.com/docs/guides/local-development/cli-workflows).

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
| `0045_matching_reliability.sql` | atomic match finalization, active-run linkage, outcome telemetry |
| `0049_demo_wallet_safety.sql` | fixed prototype allocation, atomic demo escrow/tips, restricted mutation RPCs |

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
| `matching.ts` | `rankRunners` — hard eligibility gates plus explainable, deterministic ranking |
| `fraud.ts` | `evaluateFraud` — explainable rule-based risk (noisy-OR aggregation) |
| `arbitration.ts` | `arbitrate` — rule-based dispute resolution with human escalation |
| `types.ts` | Shared input/output types and config shapes |

Unit tests live in `src/lib/algorithm/__tests__/` and run with
[Vitest](https://vitest.dev):

```bash
npm test          # run once (CI)
npm run test:watch
```

### Matching behavior

A runner must be available, active, verified, located, fraud-cleared, and able
to handle the task category before scoring. The score records proximity, trust,
capacity, estimated pickup time, and urgency fit. Estimated pickup time combines
travel distance with current workload; the urgency target is 15 minutes for
express, 35 for normal, and 60 for low. Equal scores are ordered by runner ID so
the same inputs always produce the same result.

Match attempts are finalized by the service-role-only
`finalize_match_run(...)` Postgres function. It locks the task and writes the
run, candidate snapshot, active-run link, and task state as one transaction:

- candidates found: `posted -> matched` and the exact run becomes active;
- no candidates: record `no_candidates`, leave the errand `posted`, and keep it
  visible to available runners and manual rematching;
- all offered candidates decline: clear the active run and reopen the errand as
  `posted`;
- a stale/concurrent attempt: return `not_posted` without overwriting the task.

The intermediate lifecycle remains `posted -> matched -> accepted ->
in_progress -> completed`. Only `posted` errands appear in the runner feed, so
completed errands are automatically excluded. Offer, response, pickup,
completion, cancellation, dispute, and resolution timestamps are collected in
`match_outcomes` for later production validation.

### Reproducible matching evaluation

The first evaluation uses an independent deterministic simulator: observable
candidate data goes to the matcher, while hidden runner attributes and seeded
outcome draws go only to the oracle. Calibration and final evaluation use
different frozen seeds and 5,000 scenarios each:

```bash
npx tsx scripts/evaluate-matching.ts --mode calibration
npx tsx scripts/evaluate-matching.ts --mode final
```

The calibration seed is `20260814`, the untouched final seed is `20260815`, and
bootstrap intervals use `20260816`. Reports are committed at
`reports/matching/calibration.{json,md}` and
`reports/matching/final.{json,md}`. The final report compares random eligible,
nearest eligible, highest trust, equal weight, the previous configuration, and
the proposed `matching-v2-calibrated` configuration. It measures successful
on-time completion, NDCG@5, normalized regret, pickup time, eligibility
violations, operational slices, bootstrap intervals, and top-choice stability
under weight perturbation.

On the final seed, the proposed configuration achieved 27.34% simulated
successful on-time completion (95% bootstrap interval 26.16%-28.54%), NDCG@5
0.967, regret 0.091, zero eligibility violations, and 99.28% perturbation
stability. Its paired improvement over the frozen pre-v2 production matcher was
1.30 percentage points (95% interval 0.64-1.82). The calibrated weights are 65%
urgency fit, 25% trust, and 10% capacity; urgency fit already incorporates
distance and active load through pickup-time estimation.
All seven declared acceptance criteria passed.

These are simulation results, not a claim of real-world superiority. Production
outcomes must be collected and compared before making that claim. Self-claims
are recorded for operations but excluded from algorithm-ranking claims.

## Wiring layer (DB ⇄ algorithm)

`src/lib/server/` is the only place the pure algorithm meets the database. It
runs through a **service-role** Supabase client (`src/lib/supabase/service.ts`)
for the privileged writes RLS bars clients from — escrow, match snapshots,
dispute resolutions:

| Function | What it does |
| -------- | ------------ |
| `generateMatchRun(taskId, source)` | derives eligibility/trust/fraud inputs, ranks once, and atomically returns `matched`, `no_candidates`, or `not_posted` |
| `offerToTopCandidate(taskId, ensureHold)` | atomically assigns and records an offer from `tasks.active_match_run_id`, optionally funding/holding escrow when `ensureHold` is true; reopens the errand if that run is exhausted |
| `declineAndOfferNextCandidate(...)` | atomically records the decline and either offers the next active-run candidate or reopens the errand as posted |
| `recordMatchOutcomeEvent(...)` | best-effort lifecycle telemetry that cannot reverse a successful task transition |
| `holdFunds` / `releaseFunds` / `refund` | simulated escrow: move a task's price between `wallets.balance` / `held`, append the `ledger_entries` audit row |
| `cancelTaskWithRefund(...)` | atomically authorizes cancellation, refunds any held escrow, and marks the errand cancelled |
| `resolveDispute(disputeId)` | gathers proof/GPS/fraud context, runs `arbitrate`, auto-resolves clear cases (applying the escrow effect) or marks the dispute `escalated` |

### Prototype money boundary

Mélange does not accept or transfer real money. Each account receives one
database-enforced, non-redeemable allocation of Demo GHS 1,000. The app cannot
top up that allocation or automatically cover a shortfall; an unaffordable
errand or tip fails without leaving partial task, escrow, or rating state.
Demo holds, releases, refunds, payouts, and tips remain only to demonstrate the
product workflow. Before any balance becomes redeemable, these functions must
be replaced with an authoritative payment ledger driven by verified payment
provider events.

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

### Secret handling

Keep application secrets in `.env.local` during development and in the hosting
provider's secret store for deployments. Never commit private keys, signing
bundles, service-role credentials, or generated signing-key JSON. This
repository ignores `.pem`, `.key`, `.p12`, `.pfx`, and `signing_keys.json`
artifacts; public certificates such as `.crt` and `.cer` remain committable when
the application intentionally needs them.

Before committing, inspect `git status` and use `git check-ignore -v <path>` to
confirm sensitive artifacts are protected. If a secret is ever committed,
revoke or rotate it immediately; deleting it in a later commit does not remove
it from Git history.

## Scripts

| Command             | Purpose                  |
| ------------------- | ------------------------ |
| `npm run dev`       | Dev server               |
| `npm run build`     | Production build         |
| `npm run lint`      | ESLint                   |
| `npm test`          | Vitest (algorithm tests) |
| `npm run typecheck` | TypeScript (no emit)     |
| `npm run supabase:check-local` | Validate the localhost-only Supabase policy |
| `npm run supabase:start:local` | Start Supabase with Docker ports bound to `127.0.0.1` |
| `npx tsx scripts/evaluate-matching.ts --mode final` | Reproduce the locked matching evaluation |

## Deploy (Vercel)

1. Import this repo in Vercel (New Project → import `Joel4607/melange`).
2. Add the env vars above.
3. Vercel builds every push: PRs get preview deployments, `main` is production.
