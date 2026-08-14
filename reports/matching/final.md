# Matching Evaluation - Final

- Evaluation version: `matching-evaluation-v1`
- Generator version: `matching-generator-v1`
- Generator seed: `20260815`
- Bootstrap seed: `20260816`
- Scenarios: `5000`
- Algorithm: `matching-v2`
- Configuration: `matching-v2-calibrated`
- Weight perturbation stability: `99.28%`

## Strategy results

| Strategy | Successful on time | NDCG@5 | Regret | Pickup minutes | Selection concentration | Eligibility violations |
|---|---:|---:|---:|---:|---:|---:|
| random-eligible | 18.94% | 0.874 | 0.323 | 32.05 | 0.021 | 0 |
| nearest-eligible | 23.40% | 0.931 | 0.187 | 26.00 | 0.021 | 0 |
| highest-trust | 20.86% | 0.884 | 0.298 | 31.94 | 0.029 | 0 |
| equal-weight | 26.86% | 0.965 | 0.097 | 24.94 | 0.022 | 0 |
| current-config | 26.04% | 0.953 | 0.128 | 25.54 | 0.023 | 0 |
| proposed-config | 27.34% | 0.967 | 0.091 | 24.78 | 0.022 | 0 |

## Paired successful-on-time differences

| Baseline | Proposed difference | 95% lower | 95% upper |
|---|---:|---:|---:|
| random-eligible | 8.40% | 7.28% | 9.46% |
| nearest-eligible | 3.94% | 2.98% | 4.98% |
| highest-trust | 6.48% | 5.40% | 7.44% |
| equal-weight | 0.48% | 0.08% | 0.84% |
| current-config | 1.30% | 0.64% | 1.82% |

## Acceptance criteria

| Criterion | Result |
|---|---|
| zeroEligibilityViolations | PASS |
| ndcgAtLeast085 | PASS |
| regretAtMost010 | PASS |
| noWorseThanCurrent | PASS |
| beatsStrongestSingleByFivePercent | PASS |
| urgencySliceNonRegression | PASS |
| weightStabilityAtLeast075 | PASS |

## Limitation

These results come from an independent deterministic simulation. They do not establish real-world superiority; production outcomes must be evaluated separately.
