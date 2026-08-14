# Matching Evaluation - Calibration

- Evaluation version: `matching-evaluation-v1`
- Generator version: `matching-generator-v1`
- Generator seed: `20260814`
- Bootstrap seed: `20260816`
- Scenarios: `5000`
- Algorithm: `matching-v2`
- Configuration: `matching-v2-calibrated`
- Weight perturbation stability: `99.45%`

## Strategy results

| Strategy | Successful on time | NDCG@5 | Regret | Pickup minutes | Selection concentration | Eligibility violations |
|---|---:|---:|---:|---:|---:|---:|
| random-eligible | 19.22% | 0.873 | 0.322 | 31.84 | 0.021 | 0 |
| nearest-eligible | 23.78% | 0.932 | 0.185 | 25.73 | 0.021 | 0 |
| highest-trust | 21.78% | 0.892 | 0.277 | 31.43 | 0.029 | 0 |
| equal-weight | 27.40% | 0.970 | 0.084 | 24.48 | 0.022 | 0 |
| current-config | 26.24% | 0.959 | 0.114 | 25.02 | 0.023 | 0 |
| proposed-config | 27.70% | 0.973 | 0.078 | 24.37 | 0.022 | 0 |

## Paired successful-on-time differences

| Baseline | Proposed difference | 95% lower | 95% upper |
|---|---:|---:|---:|
| random-eligible | 8.48% | 7.46% | 9.68% |
| nearest-eligible | 3.92% | 3.00% | 4.82% |
| highest-trust | 5.92% | 4.94% | 6.88% |
| equal-weight | 0.30% | -0.08% | 0.66% |
| current-config | 1.46% | 0.84% | 2.06% |

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
