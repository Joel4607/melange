# Matching Reliability and Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one complete matching feature that preserves posted errands after unsuccessful matching, improves the explainable ranking model, records real lifecycle outcomes, and produces a reproducible independent simulation report.

**Architecture:** Keep ranking and evaluation as pure TypeScript modules. Finalize match attempts through one transactional Supabase RPC so audit rows, candidate snapshots, active-run linkage, and task status cannot diverge. Use independent seeded simulation plus golden cases for evaluation, then connect real task lifecycle events to match outcomes for later validation.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Supabase/Postgres 16, Vitest 4, `tsx`, existing project utilities only.

**Spec:** `docs/superpowers/specs/2026-08-14-matching-reliability-evaluation-design.md`

## Global Constraints

- Preserve `posted -> matched -> accepted -> in_progress -> completed`.
- A no-candidate attempt leaves the task `posted`, unassigned, visible, and immediately rematchable.
- Keep the matcher explainable; do not add a machine-learning dependency.
- The final evaluation generator must not import matcher weights or scoring helpers.
- Use calibration data only for weight selection; do not tune on final evaluation results.
- Self-claim runs are excluded from algorithm-quality claims.
- Do not expose proof images, chat, payment data, or exact location history in evaluation exports.
- Complete all tasks and verification before opening one PR.

---

### Task 1: Matching contracts, validation, and deterministic scoring

**Files:**
- Modify: `src/lib/algorithm/types.ts`
- Modify: `src/lib/algorithm/matching.ts`
- Modify: `src/lib/algorithm/__tests__/matching.test.ts`

**Interfaces:**
- Consumes: existing `GeoPoint`, `Urgency`, `haversineKm()`.
- Produces: `RunnerCandidate`, `MatchConfig`, `MatchResult`, `MatchRunOutcome`, `validateMatchConfig()`, `rankRunners()`.

- [ ] **Step 1: Extend failing golden tests**

Add tests that construct candidates with `active`, `verified`, `fraudAction`, nullable `location`, trust, load, availability, and capabilities. Assert exclusion for each hard gate, independent express urgency, deterministic ties, invalid configuration rejection, non-mutation, and finite normalized components.

```ts
expect(rankRunners(task, [runner("unverified", { verified: false })])).toEqual([]);
expect(() => rankRunners(task, [runner("a")], {
  ...DEFAULT_MATCH_CONFIG,
  weights: { proximity: 1, trust: 1, capacity: 0, urgency: 0 },
})).toThrow(/sum to 1/i);
expect(rankRunners(task, [runner("b"), runner("a")]).map(r => r.runnerId))
  .toEqual(["a", "b"]);
```

- [ ] **Step 2: Run the matching tests and confirm the new tests fail**

Run: `npx vitest run src/lib/algorithm/__tests__/matching.test.ts`

Expected: FAIL because the new candidate/config fields and validation behaviour do not exist.

- [ ] **Step 3: Implement exact types and default configuration**

Use these public shapes:

```ts
export type FraudAction = "clear" | "penalize" | "exclude";

export interface RunnerCandidate {
  runnerId: string;
  location: GeoPoint | null;
  trust: number;
  activeLoad: number;
  available: boolean;
  active: boolean;
  verified: boolean;
  fraudAction: FraudAction;
  capabilities?: string[];
}

export interface MatchConfig {
  weights: { proximity: number; trust: number; capacity: number; urgency: number };
  distanceScaleKm: number;
  assumedTravelSpeedKmh: number;
  delayMinutesPerActiveTask: number;
  urgencyTargetMinutes: Record<Urgency, number>;
  algorithmVersion: string;
  configVersion: string;
}

export type MatchRunOutcome =
  | { status: "matched"; runId: string; results: MatchResult[] }
  | { status: "no_candidates"; runId: string; results: [] }
  | { status: "not_posted"; runId: null; results: [] };
```

Set initial weights to the existing intent: proximity `0.4`, trust `0.3`, capacity `0.2`, urgency `0.1`; targets 15/35/60 minutes; speed `20 km/h`; delay `8 minutes` per active task; algorithm/config versions `matching-v2`/`matching-v2-default`.

- [ ] **Step 4: Implement validation, scoring, and tie-breaking**

Add `validateMatchConfig(config): void`. Apply hard eligibility filters, calculate travel/pickup time and `urgencyFit`, preserve input immutability, and sort by score, pickup time, trust, active load, then runner ID.

- [ ] **Step 5: Run matching tests**

Run: `npx vitest run src/lib/algorithm/__tests__/matching.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the core matcher**

```bash
git add src/lib/algorithm/types.ts src/lib/algorithm/matching.ts src/lib/algorithm/__tests__/matching.test.ts
git commit -m "feat: strengthen matching model"
```

---

### Task 2: Independent deterministic evaluation engine

**Files:**
- Create: `src/lib/algorithm/matching-evaluation/types.ts`
- Create: `src/lib/algorithm/matching-evaluation/random.ts`
- Create: `src/lib/algorithm/matching-evaluation/generator.ts`
- Create: `src/lib/algorithm/matching-evaluation/oracle.ts`
- Create: `src/lib/algorithm/matching-evaluation/baselines.ts`
- Create: `src/lib/algorithm/matching-evaluation/metrics.ts`
- Create: `src/lib/algorithm/matching-evaluation/index.ts`
- Create: `src/lib/algorithm/matching-evaluation/__tests__/evaluation.test.ts`

**Interfaces:**
- Consumes: `RunnerCandidate`, `TaskRequest`, `MatchConfig`, `MatchResult`, `rankRunners()` only in the strategy adapter—not in generator/oracle.
- Produces: `generateScenarios()`, `oracleUtility()`, `evaluateStrategy()`, `evaluateAllStrategies()`, `MatchingEvaluationReport`.

- [ ] **Step 1: Write deterministic and hand-computable failing tests**

Assert identical scenarios for the same seed, different scenarios for different seeds, exact small-fixture NDCG/regret, correct random/nearest/trust baselines, and source-level independence by checking `generator.ts` and `oracle.ts` do not import `../matching`.

```ts
expect(generateScenarios({ seed: 20260814, count: 5 }))
  .toEqual(generateScenarios({ seed: 20260814, count: 5 }));
expect(normalizedRegret(1, 0.9)).toBeCloseTo(0.1);
expect(ndcgAtK([3, 2, 1], [3, 2, 1], 3)).toBeCloseTo(1);
```

- [ ] **Step 2: Run evaluation tests and confirm failure**

Run: `npx vitest run src/lib/algorithm/matching-evaluation/__tests__/evaluation.test.ts`

Expected: FAIL because evaluation modules do not exist.

- [ ] **Step 3: Implement seeded PRNG and scenario contracts**

Use Mulberry32 with unsigned 32-bit seed updates. Define versioned scenarios containing observable task/candidate data plus hidden runner attributes and seeded outcomes. Use calibration seed `20260814`, final seed `20260815`, bootstrap seed `20260816`, and default count `5000`.

- [ ] **Step 4: Implement the independent generator and oracle**

Generate tasks across all urgency/category bands and candidate-pool sizes. Hidden response tendency, proficiency, travel speed, reliability, and cancellation tendency drive a bounded oracle utility for successful on-time completion. Trust is a noisy proxy; the generator and oracle must not import matcher config or scoring functions.

- [ ] **Step 5: Implement baselines and metrics**

Implement seeded random, nearest, highest-trust, equal-weight, current, and proposed strategies. Produce eligibility violations, acceptance/completion/cancellation/dispute rates, pickup time/distance, NDCG@5, normalized regret, top-three coverage, concentration, cold-start exposure, urgency/category/distance/load/pool slices, top-choice perturbation stability, and seeded paired-bootstrap intervals.

- [ ] **Step 6: Run evaluation tests**

Run: `npx vitest run src/lib/algorithm/matching-evaluation/__tests__/evaluation.test.ts`

Expected: PASS with byte-identical reports for repeated seed/config input.

- [ ] **Step 7: Commit the evaluation engine**

```bash
git add src/lib/algorithm/matching-evaluation
git commit -m "feat: add deterministic matching evaluation"
```

---

### Task 3: Evaluation CLI, calibration, and report artifacts

**Files:**
- Create: `scripts/evaluate-matching.ts`
- Create: `src/lib/algorithm/matching-evaluation/__tests__/cli.test.ts`
- Create at runtime: `reports/matching/calibration.json`
- Create at runtime: `reports/matching/calibration.md`
- Create at runtime: `reports/matching/final.json`
- Create at runtime: `reports/matching/final.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `evaluateAllStrategies()`, calibration/final/bootstrap seed constants, `MatchConfig`.
- Produces: frozen calibrated config and machine-/human-readable reports.

- [ ] **Step 1: Write failing CLI serialization tests**

Test argument parsing for `--mode calibration|final`, rejection of unknown modes, required report metadata, stable JSON key order, and Markdown tables containing all strategies and acceptance criteria.

- [ ] **Step 2: Run CLI tests and confirm failure**

Run: `npx vitest run src/lib/algorithm/matching-evaluation/__tests__/cli.test.ts`

Expected: FAIL because the CLI does not exist.

- [ ] **Step 3: Implement constrained calibration**

Enumerate weights in `0.05` increments that sum to `1`. Select the best calibration configuration by successful on-time completion, then NDCG@5, then regret, subject to zero eligibility violations and urgency-slice non-regression. Write the frozen configuration into both calibration report formats.

- [ ] **Step 4: Implement final evaluation mode**

Read the frozen config from `reports/matching/calibration.json`; reject final mode if it is missing or malformed. Evaluate exactly once per invocation using the final seed and write metadata, metrics, slices, bootstrap intervals, and pass/fail criteria. Do not modify the frozen config.

- [ ] **Step 5: Keep generated reports in the PR**

Add only transient scratch files to `.gitignore`; commit calibration/final JSON and Markdown because they are the reproducible academic evidence.

- [ ] **Step 6: Run CLI tests and generate reports**

```bash
npx vitest run src/lib/algorithm/matching-evaluation/__tests__/cli.test.ts
npx tsx scripts/evaluate-matching.ts --mode calibration
npx tsx scripts/evaluate-matching.ts --mode final
```

Expected: PASS; four report files created with declared seeds and versions.

- [ ] **Step 7: Commit CLI and reports**

```bash
git add scripts/evaluate-matching.ts src/lib/algorithm/matching-evaluation/__tests__/cli.test.ts reports/matching .gitignore
git commit -m "feat: publish matching evaluation reports"
```

---

### Task 4: Atomic database finalization and outcome schema

**Files:**
- Create: `supabase/migrations/0045_matching_reliability.sql`
- Modify: `scripts/verify-migrations.sh`

**Interfaces:**
- Consumes: `tasks`, `match_runs`, `match_candidates`, profile foreign keys.
- Produces: `tasks.active_match_run_id`, match-run metadata, `match_outcomes`, `finalize_match_run(...)` RPC.

- [ ] **Step 1: Extend migration smoke assertions before the migration**

Add SQL checks that require the new columns/table/function, validate empty finalization leaves `posted`, successful finalization sets `matched`, stale finalization returns `not_posted`, and self-claim records the selected runner.

- [ ] **Step 2: Run migration verification and confirm failure**

Run: `bash scripts/verify-migrations.sh`

Expected: FAIL because migration `0045_matching_reliability.sql` is absent.

- [ ] **Step 3: Implement schema changes**

Add match-run outcome/source/version/config/candidate-count columns, `tasks.active_match_run_id`, and `match_outcomes` with a unique `(match_run_id, runner_id)` key plus lifecycle timestamps/flags. Add indexes for active run, run outcome/source, and offered-runner lookups.

- [ ] **Step 4: Implement transactional `finalize_match_run`**

Create a service-role-only `security definer` function with a fixed `search_path`. Lock the task, validate posted/unassigned state, insert run/candidate JSON, preserve posted on empty candidates, change to matched on non-empty candidates, support a single selected self-claim runner, and return `status`, `run_id`.

- [ ] **Step 5: Add RLS and grants**

Enable RLS on `match_outcomes`; permit task buyers/admins to read relevant rows and keep writes restricted to service-role execution. Revoke public function execution and grant only service role.

- [ ] **Step 6: Run migration verification**

Run: `bash scripts/verify-migrations.sh`

Expected: PASS including concurrency/state assertions.

- [ ] **Step 7: Commit database work**

```bash
git add supabase/migrations/0045_matching_reliability.sql scripts/verify-migrations.sh
git commit -m "feat: finalize matches atomically"
```

---

### Task 5: Server matching outcomes and exact-run offering

**Files:**
- Modify: `src/lib/server/matching.ts`
- Modify: `src/lib/server/rows.ts`
- Create: `src/lib/server/__tests__/matching-outcome.test.ts`

**Interfaces:**
- Consumes: `rankRunners()`, `MatchRunOutcome`, Supabase `finalize_match_run` RPC.
- Produces: `generateMatchRun(taskId, source)`, `recordMatchOutcomeEvent()`, exact active-run `offerToTopCandidate()`.

- [ ] **Step 1: Write failing server contract tests with a fake Supabase client**

Assert no candidates invoke RPC with an empty list and return `no_candidates`; successful candidates return `matched`; stale RPC returns `not_posted`; offering queries `active_match_run_id` rather than latest timestamp; candidate construction includes all pure eligibility fields.

- [ ] **Step 2: Run server tests and confirm failure**

Run: `npx vitest run src/lib/server/__tests__/matching-outcome.test.ts`

Expected: FAIL against the array-returning implementation.

- [ ] **Step 3: Refactor `generateMatchRun`**

Return `Promise<MatchRunOutcome>`, derive raw candidate eligibility fields, rank once, call the transactional RPC, and map its exact domain status. Automatic infrastructure errors continue to throw so callers can apply best-effort behaviour; zero candidates do not throw.

- [ ] **Step 4: Refactor candidate offering**

Call a service-role-only transaction that locks the task, reads `tasks.active_match_run_id`, selects the first non-declined candidate from that run, applies an idempotent task-scoped simulated top-up and initial escrow hold, assigns the runner, and creates/updates the associated outcome row. Decline through a second task-locking transaction that records the response and either assigns the next candidate or reopens the errand. Notify only after a transaction succeeds.

- [ ] **Step 5: Implement lifecycle outcome recording helper**

Support `accepted`, `declined`, `picked_up`, `completed`, `cancelled`, `disputed`, and `resolved` after the atomic initial offer. Make later telemetry updates non-blocking after successful state changes, repair a missing offer row when possible, and log structured errors.

- [ ] **Step 6: Run server and algorithm tests**

```bash
npx vitest run src/lib/server/__tests__/matching-outcome.test.ts
npx vitest run src/lib/algorithm/__tests__/matching.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit server integration**

```bash
git add src/lib/server/matching.ts src/lib/server/rows.ts src/lib/server/__tests__/matching-outcome.test.ts
git commit -m "feat: integrate reliable match outcomes"
```

---

### Task 6: Actions, runner claim, and rematch experience

**Files:**
- Modify: `src/app/app/actions.ts`
- Modify: `src/app/app/errands/[id]/page.tsx`
- Create: `src/app/app/__tests__/matching-actions.test.ts`

**Interfaces:**
- Consumes: `generateMatchRun()`, transactional self-claim/offer/escrow/cancellation functions, `recordMatchOutcomeEvent()`.
- Produces: reliable automatic matching, manual rematching, self-claim, and lifecycle telemetry UI behaviour.

- [ ] **Step 1: Write failing action/state tests**

Assert automatic `no_candidates` leaves creation successful and posted; manual rematch accepts posted tasks; self-claim finalizes one selected runner; lifecycle actions record only after state success; no-candidate UI remains a posted-task retry experience.

- [ ] **Step 2: Run action tests and confirm failure**

Run: `npx vitest run src/app/app/__tests__/matching-actions.test.ts`

Expected: FAIL because structured outcomes are not handled.

- [ ] **Step 3: Update automatic and manual matching callers**

Pass source `automatic` during creation/recurrence and `manual` for rematch. Treat `no_candidates` as success with the task still posted. Revalidate the feed, dashboard, and task detail after each attempt.

- [ ] **Step 4: Update self-claim and lifecycle actions**

Use the transactional single-candidate self-claim path to assign, hold escrow, and record the initial outcome before acceptance. Use an atomic cancellation/refund path. Record decline, acceptance, pickup, completion, cancellation, dispute, and resolution outcome events only after their conditional task updates succeed.

- [ ] **Step 5: Update the errand detail experience**

When the latest attempt has no candidates and the task is posted, show: “No eligible runners yet. Your errand remains visible to available runners.” Keep the manual retry button enabled; hide it after reservation.

- [ ] **Step 6: Run action tests**

Run: `npx vitest run src/app/app/__tests__/matching-actions.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit application integration**

```bash
git add src/app/app/actions.ts src/app/app/errands/[id]/page.tsx src/app/app/__tests__/matching-actions.test.ts
git commit -m "fix: keep unmatched errands available"
```

---

### Task 7: Documentation and reproducibility

**Files:**
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Include: `docs/superpowers/specs/2026-08-14-matching-reliability-evaluation-design.md`
- Include: `docs/superpowers/plans/2026-08-14-matching-reliability-evaluation.md`

**Interfaces:**
- Consumes: final commands, schema, report paths, and measured results.
- Produces: defensible project documentation.

- [ ] **Step 1: Update lifecycle and matcher documentation**

Document the hard eligibility gates, pickup-time urgency, deterministic ordering, atomic finalization, no-candidate state, active-run offering, and outcome collection.

- [ ] **Step 2: Document exact evaluation commands and limitations**

Add calibration/final commands, seeds, version fields, baselines, metrics, acceptance criteria, report locations, and the explicit limitation that simulation does not establish real-world superiority.

- [ ] **Step 3: Verify commands and paths in documentation**

Run: `rg -n "evaluate-matching|no_candidates|matching-v2|simulation" README.md ARCHITECTURE.md docs/superpowers reports/matching`

Expected: every named command/path exists and terminology is consistent.

- [ ] **Step 4: Commit documentation**

```bash
git add README.md ARCHITECTURE.md docs/superpowers
git commit -m "docs: explain matching evaluation"
```

---

### Task 8: Full verification, review, and one PR

**Files:**
- Review: all files changed by Tasks 1-7.

**Interfaces:**
- Consumes: complete feature branch.
- Produces: one verified draft PR targeting `main`.

- [ ] **Step 1: Install exact dependencies**

Run: `npm ci`

Expected: exit 0 without modifying `package-lock.json`.

- [ ] **Step 2: Run focused verification**

```bash
npx vitest run src/lib/algorithm/__tests__/matching.test.ts
npx vitest run src/lib/algorithm/matching-evaluation/__tests__
npx vitest run src/lib/server/__tests__/matching-outcome.test.ts
npx vitest run src/app/app/__tests__/matching-actions.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 3: Run project verification**

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 4: Regenerate and compare reports**

```bash
npx tsx scripts/evaluate-matching.ts --mode calibration
npx tsx scripts/evaluate-matching.ts --mode final
git diff --exit-code -- reports/matching
```

Expected: byte-identical committed reports.

- [ ] **Step 5: Run migration verification when the required Bash/Postgres environment is available**

Run: `bash scripts/verify-migrations.sh`

Expected: exit 0. If local infrastructure is unavailable, report the exact blocker and rely on the unchanged CI migration job; do not claim this check passed.

- [ ] **Step 6: Review the complete diff**

Run: `git diff --check main...HEAD` and `git diff --stat main...HEAD`.

Expected: no whitespace errors; scope contains only the complete matching feature.

- [ ] **Step 7: Push one feature branch and open one draft PR**

Use branch `agent/matching-reliability-evaluation`, target `main`, and title `Complete matching reliability and evaluation`. The PR body must summarize the state fix, model changes, evaluation, telemetry, migration, reports, verification, and any infrastructure-only check left to CI.
