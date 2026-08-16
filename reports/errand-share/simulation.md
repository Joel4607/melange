# Errand-Share deterministic simulation

> Evidence status: **SIMULATED**. This report is repeatable engineering evidence, not a claim about production outcomes.

- Evaluation version: `errand-share-evaluation-v1`
- Generator version: `errand-share-generator-v1`
- Algorithm version: `errand-share-v1`
- Configuration version: `accra-v1`
- Seed: `4607`
- Scenarios: `1000`

## Aggregate results

| Metric | Simulated result |
|---|---:|
| Eligible errands | 809 |
| Paired errands | 800 |
| Pairs | 400 |
| Pairing rate | 98.89% |
| Direct no-sharing baseline | 4317.308 km |
| Shared-route distance | 2842.470 km |
| Distance saved | 1474.838 km (34.16%) |
| Mean accepted detour | 0.171 km |
| Maximum accepted detour | 0.946 km |
| Deadline violations | 0 |
| Detour violations | 0 |
| Simulated cancellation rate | 8.50% |
| Simulated completion rate | 83.13% |

## Urgency slices

| Mode | Scenarios | Eligible | Paired | Pairing rate |
|---|---:|---:|---:|---:|
| ASAP Express | 191 | 0 | 0 | 0.00% |
| Today | 403 | 403 | 396 | 98.26% |
| Whenever | 406 | 406 | 404 | 99.51% |

ASAP Express is deliberately ineligible for sharing. Today and Whenever may pair only when the route meets the stricter Today deadline.

## Candidate rejection reasons

| Reason | Count |
|---|---:|
| `detour_ratio_exceeded` | 7 |
| `pickup_too_far` | 1208 |

## Evidence boundary

Deterministic simulation supports repeatable engineering validation only; production outcomes are required for real-world claims.
