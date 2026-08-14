# Matching Reliability and Evaluation Design

**Date:** 2026-08-14
**Status:** Design approved; awaiting written-spec review
**Scope:** Matching state correctness, ranking-model improvements, deterministic evaluation, and real-outcome collection

## 1. Goal

Make Melange's matching workflow correct when no runner is eligible, improve the explainability and usefulness of the ranking signals, and establish a reproducible hybrid evaluation that can support defensible academic claims.

The completed work must preserve the existing task lifecycle:

```text
posted -> matched -> accepted -> in_progress -> completed
```

An unsuccessful matching attempt is not a lifecycle transition. It leaves the task `posted`, visible in the open-errand feed, and immediately eligible for manual rematching or runner self-claim.

## 2. Non-goals

- Do not replace the explainable weighted ranking with a black-box machine-learning model.
- Do not remove the open errand feed or runner self-claim flow.
- Do not allow direct `posted -> completed` transitions.
- Do not add background retry infrastructure or scheduled automatic rematching in this phase.
- Do not use the final evaluation dataset to tune matcher weights.
- Do not claim that simulated results prove real-world effectiveness.

## 3. Current Problem

`generateMatchRun()` currently creates a match snapshot and changes a task from `posted` to `matched` even when the ranked candidate list is empty. The errand page then offers a manual rematch action, but the matcher refuses to run because it accepts only `posted` tasks. The result is an unassigned `matched` task that is hidden from the open feed and cannot be recovered through the displayed retry action.

The current matching score is understandable, but its urgency component is derived from proximity multiplied by availability. It therefore repeats signals already present in the score instead of measuring whether a runner is likely to reach an urgent pickup on time. Configuration and candidate inputs are also not validated, and equal scores depend on source-array order.

The existing unit tests demonstrate component sensitivity but do not measure ranking quality, operational outcomes, robustness, or runner exposure. The new evaluation must provide those measurements without generating outcomes from the same formula being evaluated.

## 4. Lifecycle Invariants

### 4.1 Status meanings

- `posted`: Publicly visible, unassigned, and claimable. Automatic or manual matching may run.
- `matched`: A successful candidate snapshot exists and the task is reserved from the public feed while the buyer/offer flow proceeds.
- `accepted`: The selected runner committed to the errand.
- `in_progress`: Pickup occurred and delivery is underway.
- `completed`: Delivery proof was accepted and completion was recorded.
- Existing `cancelled`, `disputed`, and `resolved` semantics remain unchanged.

### 4.2 Required transitions

```text
posted --successful automatic/manual match--> matched
posted --runner self-claim---------------> matched -> accepted
matched --runner accepts-----------------> accepted
accepted --pickup------------------------> in_progress
accepted|in_progress --delivery proof----> completed
```

### 4.3 No-candidate behaviour

- A no-candidate attempt records an audit snapshot with outcome `no_candidates`.
- The task remains `posted` and `selected_runner_id` remains null.
- The task remains visible in the feed, whose query continues to require `status = posted` and `selected_runner_id IS NULL`.
- Manual rematching can run again immediately.
- `no_candidates` is an ordinary domain outcome, not an exception.

### 4.4 Concurrency

Match finalization and runner self-claim must use conditional state checks so only one operation can reserve a posted task. The database, not an earlier application read, is authoritative.

## 5. Matching Model

### 5.1 Eligibility gates

Eligibility is decided before scoring. A high score can never compensate for a failed gate. Exclude a runner who is:

- unavailable or inactive;
- unverified;
- under a hard fraud exclusion;
- missing a valid location;
- outside a required task capability.

The pure matcher owns this decision. `RunnerCandidate` is extended with `active`, `verified`, `fraudAction`, and a nullable location so `rankRunners()` applies the same gates in unit tests, simulation, and production. The server remains responsible for deriving those fields from profiles, schedules, fraud checks, and presence data; it does not maintain a second eligibility formula.

The current contract that an omitted or empty capability list means "any supported category" remains unchanged for compatibility.

### 5.2 Normalized components

The matcher continues to return normalized components in `[0, 1]`:

```text
proximity = exp(-distanceKm / distanceScaleKm)
trust     = clamp(candidate.trust, 0, 1)
capacity  = 1 / (1 + max(0, activeLoad))
```

Urgency becomes an estimated pickup-time fit rather than a duplicate readiness calculation:

```text
straightLineTravelMinutes = distanceKm / assumedTravelSpeedKmh * 60
estimatedPickupMinutes    = straightLineTravelMinutes
                          + activeLoad * delayMinutesPerActiveTask
urgencyFit                = exp(-estimatedPickupMinutes / urgencyTargetMinutes[urgency])
```

Initial target values are:

| Urgency | Target pickup time |
|---|---:|
| Express | 15 minutes |
| Normal | 35 minutes |
| Low | 60 minutes |

The initial assumed travel speed and per-load delay live in versioned matcher configuration and are calibrated only on the development simulation.

### 5.3 Weighted score

```text
matchScore =
    weights.proximity * proximity
  + weights.trust     * trust
  + weights.capacity  * capacity
  + weights.urgency   * urgencyFit
```

The result explanation includes distance, estimated pickup minutes, every normalized component, score, rank, algorithm version, and configuration version.

### 5.4 Configuration validation

Reject a matcher configuration when:

- any weight is negative or non-finite;
- weights do not sum to `1` within a tolerance of `1e-9`;
- distance scale, assumed travel speed, per-load delay, or an urgency target is non-finite or non-positive.

Reject or exclude candidate data containing non-finite coordinates, trust, or active load. A negative active load is invalid rather than silently treated as zero.

### 5.5 Deterministic ordering

Sort candidates by:

1. match score descending;
2. estimated pickup time ascending;
3. trust descending;
4. active load ascending;
5. runner ID lexicographically ascending.

Identical inputs must always produce identical rankings regardless of database return order.

### 5.6 Weight calibration

Use a constrained grid search on the calibration dataset. Weights use increments of `0.05`, remain non-negative, and sum to `1`. Select the configuration with the best primary metric subject to all eligibility and urgency-slice constraints. Freeze the winning configuration and version before running the final evaluation seed.

## 6. Atomic Match Finalization

Add a service-role-only database function that accepts the task ID, ranked candidate JSON, algorithm/configuration metadata, and attempt source.

Within one transaction the function:

1. Locks the task row.
2. Returns `not_posted` without inserting an active result if the task is no longer `posted` or already has a selected runner.
3. Inserts a `match_runs` audit row.
4. Inserts all candidate snapshots.
5. If the candidate list is empty, records `no_candidates` and leaves the task unchanged.
6. If candidates exist, records `matched`, updates the task to `matched`, and links the task to this active match run.
7. Returns the structured outcome and match-run ID.

The application-level result is:

```ts
type MatchRunOutcome =
  | { status: "matched"; runId: string; results: MatchResult[] }
  | { status: "no_candidates"; runId: string; results: [] }
  | { status: "not_posted"; runId: null; results: [] };
```

Candidate offering reads the task's active match-run reference instead of selecting the run with the latest timestamp.

Runner self-claim uses the same transactional finalization boundary with a single eligible claimant, source `self_claim`, and algorithm version `self-claim`. The transaction records that runner as the selected runner and changes `posted -> matched`; the existing acceptance action then performs `matched -> accepted`. Self-claim runs are retained for operational comparison but excluded from claims about algorithm ranking quality.

## 7. Persistence and Real-Outcome Collection

### 7.1 Match-run metadata

Extend match-run persistence with:

- `outcome`: `matched` or `no_candidates`;
- `source`: `automatic`, `manual`, or `self_claim`;
- `algorithm_version`;
- `config_version`;
- exact configuration JSON;
- candidate count;
- generation timestamp.

Add an active match-run reference to the task. It is null for a newly posted task and for a no-candidate attempt.

### 7.2 Offered-runner outcomes

Create one outcome row for every candidate who receives an offer, uniquely identified by match run and runner. Record:

- offer and response timestamps;
- accepted or declined result;
- pickup timestamp and pickup minutes;
- completion or cancellation result;
- completion duration;
- dispute occurrence and resolution.

The first offer row is written atomically with runner assignment, an idempotent task-scoped simulated top-up, and the initial escrow hold. A decline atomically records the response and either assigns the next candidate or reopens the errand. Lifecycle actions update later pickup, completion, cancellation, dispute, and resolution fields after the corresponding task transition succeeds. This later telemetry must not reverse or block a successful task-state transition; a failed update is logged for operational follow-up, and a later event repairs a missing offer row before applying its timestamp.

### 7.3 Privacy

Evaluation records use existing task and runner identifiers but do not duplicate exact location histories, proof images, chat content, phone numbers, or payment details. Exported evaluation datasets use scenario IDs or pseudonymous identifiers.

## 8. Hybrid Evaluation

### 8.1 Golden scenarios

Committed golden cases verify domain truths:

- unavailable, unverified, fraud-excluded, unlocated, and incapable runners are excluded;
- distance, trust, and capacity comparisons behave correctly when other inputs are equal;
- express urgency reacts more strongly to estimated pickup time than low urgency;
- equal candidates use deterministic tie-breaking;
- invalid candidates/configurations are handled according to the declared contract;
- a zero-candidate attempt leaves the task posted and rematchable.

### 8.2 Independent deterministic simulation

Generate 5,000 task scenarios using a fixed, committed configuration. The generator must not import `rankRunners`, default matcher weights, or matcher scoring helpers.

Each simulated runner has observable matcher inputs:

- location;
- trust;
- active load;
- availability;
- verification/fraud eligibility;
- category capabilities.

The generator also assigns hidden attributes unavailable to the matcher:

- response tendency;
- category proficiency;
- travel speed;
- completion reliability;
- cancellation tendency.

Seeded offer acceptance, pickup time, completion, cancellation, and dispute outcomes are generated from nonlinear interactions among these hidden attributes and observable conditions. Trust is only a noisy proxy for hidden reliability. The oracle ranks eligible candidates by expected successful on-time completion, not by the matcher's weighted score.

Use distinct immutable seeds for:

- calibration/development;
- final evaluation;
- fixed bootstrap resampling.

Every result records the generator version, seed, sample size, algorithm version, and matcher configuration.

### 8.3 Baselines

Evaluate:

1. seeded random eligible selection;
2. nearest eligible runner;
3. highest-trust eligible runner;
4. equal-weight multi-criteria ranking;
5. current production matcher configuration;
6. proposed calibrated matcher configuration.

### 8.4 Metrics

Primary metric:

- successful on-time completion rate.

Supporting metrics:

- eligibility violations;
- offer acceptance;
- completion, cancellation, and dispute rates;
- mean pickup time and distance;
- NDCG at 5;
- normalized top-choice regret against oracle utility;
- top-three oracle coverage;
- selection concentration and cold-start exposure;
- top-choice stability under plus/minus 10% weight perturbations;
- slices by urgency, category, distance, active load, and candidate-pool size.

Report paired strategy differences with deterministic 95% bootstrap intervals.

### 8.5 Acceptance criteria

- Zero ineligible runner selections.
- Zero no-candidate attempts that move a task out of `posted`.
- Repeated identical inputs and seeds produce byte-identical machine-readable reports.
- NDCG at 5 is at least `0.85`.
- Mean normalized top-choice regret is at most `0.10`.
- Successful on-time completion is no worse than the current matcher and is at least 5% relatively higher than the strongest single-feature baseline.
- The proposed matcher does not lose to the strongest baseline within any urgency group.
- A plus/minus 10% weight perturbation preserves the top choice in at least 75% of scenarios.

Failing a criterion is reported honestly and blocks a claim that the improved matcher outperforms the relevant baseline. It does not permit changing the final evaluation seed or tuning on final results.

## 9. User Experience and Error Handling

- Automatic matching during errand creation remains best effort. An infrastructure failure leaves the task posted.
- Manual rematching reports one of three user-facing outcomes: candidates found, no eligible runners yet, or the errand is no longer open.
- A no-candidate message explains that the errand remains visible and can be retried.
- The open feed continues to query only posted, unassigned tasks, so matched and completed errands disappear without a cleanup job.
- Runner self-claim keeps its conditional posted/unassigned database update and remains safe against concurrent matching.
- Completed tasks remain accessible to participants through history/detail views even though they are absent from the available feed.

## 10. File Responsibilities

- `src/lib/algorithm/types.ts`: raw candidate eligibility fields, validated configuration, components, result, and structured outcome types.
- `src/lib/algorithm/matching.ts`: pure eligibility-compatible ranking, pickup-time calculation, validation, and deterministic ordering.
- `src/lib/algorithm/__tests__/matching.test.ts`: golden algorithm tests.
- `src/lib/server/matching.ts`: candidate loading, algorithm call, atomic finalization, offering, and outcome recording coordination.
- `src/app/app/actions.ts`: domain-transition callers and lifecycle outcome updates.
- `src/app/app/errands/[id]/page.tsx`: posted/no-candidate rematch experience.
- Next Supabase migration: match-run metadata, active-run linkage, outcome table, constraints, indexes, and atomic finalization function.
- `src/lib/algorithm/matching-evaluation/types.ts`: versioned scenario and report contracts.
- `src/lib/algorithm/matching-evaluation/generator.ts`: independent seeded scenario/outcome generator.
- `src/lib/algorithm/matching-evaluation/oracle.ts`: hidden-utility calculation.
- `src/lib/algorithm/matching-evaluation/baselines.ts`: comparison strategies.
- `src/lib/algorithm/matching-evaluation/metrics.ts`: aggregate, sliced, fairness, robustness, and bootstrap calculations.
- `src/lib/algorithm/matching-evaluation/__tests__/`: determinism, independence, baseline, metric, and acceptance-criterion tests.
- `scripts/evaluate-matching.ts`: calibration/final modes plus JSON and Markdown report output.
- `README.md` and `ARCHITECTURE.md`: lifecycle, evaluation commands, limitations, and defensible claims.

## 11. Verification Strategy

### 11.1 Pure algorithm tests

Test eligibility behaviour, every normalized component, configuration rejection, estimated pickup time, urgency response, tie-breaking, immutability of inputs, and deterministic output.

### 11.2 Server and database tests

Against a throwaway Postgres/Supabase-compatible database, verify:

- empty finalization creates an audit run but leaves the task posted;
- successful finalization creates candidates and changes the task to matched;
- the active match-run reference points to the successful snapshot;
- stale or repeated finalization returns `not_posted`;
- concurrent claim/finalization attempts yield exactly one reservation;
- outcome rows follow offer, acceptance, decline, pickup, completion, cancellation, and dispute events;
- migration constraints and RLS/service-role boundaries are correct.

### 11.3 Evaluation tests

Verify seeded determinism, generator independence from matcher modules, metric calculations on small hand-computable fixtures, baseline correctness, calibration/final seed separation, configuration freezing, report metadata, and acceptance-criterion failure behaviour.

### 11.4 Project verification

Run:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npx tsx scripts/evaluate-matching.ts --mode calibration
npx tsx scripts/evaluate-matching.ts --mode final
```

The final report is generated only after the selected configuration is frozen.

## 12. Rollout and Claims

1. Ship the no-candidate state fix and atomic finalization first.
2. Ship matcher validation, urgency, and deterministic ordering behind a new algorithm version.
3. Run golden tests and calibration evaluation.
4. Freeze the selected configuration and version.
5. Run the final deterministic evaluation once and publish all required result tables, including failures.
6. Begin collecting real outcomes.
7. After sufficient real matches exist, evaluate simulated-to-real transfer and recalibrate only in a new algorithm version.

The academic claim is limited to: the matcher is an explainable multi-criteria ranking adapted to Melange's operating constraints, and it outperforms declared simple baselines on a reproducible independent simulation. Real-world superiority is not claimed until supported by collected production outcomes.
