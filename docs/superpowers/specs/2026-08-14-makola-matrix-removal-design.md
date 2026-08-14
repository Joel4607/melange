# Makola-Matrix Removal Design

**Date:** 2026-08-14
**Status:** Accepted
**Scope:** Complete removal of the Makola-Matrix feature from Melange

## Goal

Remove Makola-Matrix and all of its academic, predictive, routing, data, API,
and interface claims. Melange will retain its ordinary grocery-shopping and
market-errand use cases, but it will no longer claim to predict market prices,
optimize movement through Madina Market, or provide a Makola-Matrix feature.

This work follows the completed matching feature and will be delivered as one
separate pull request.

## Why Remove It

The price history is simulated, while the interface describes the output as a
price oracle with a 90% confidence interval and refers to calibration against
external data and field observations. The repository does not contain the
traceable source observations required to validate those claims. The routing
feature uses a conceptual market graph and a nearest-neighbour heuristic while
some documentation describes its output as optimal. Removing the feature is
more defensible than retaining claims that the current evidence cannot support.

## Removal Boundary

### Delete interface and API surfaces

- `src/app/app/market/page.tsx`
- `src/app/api/market/price/route.ts`
- `src/app/api/market/route/route.ts`
- the Makola-Matrix navigation item in
  `src/app/app/dashboard-shell.tsx`

After removal, `/app/market`, `/api/market/price`, and `/api/market/route` are
not supported application routes. They may resolve through the framework's
normal not-found behavior; no compatibility redirect or replacement endpoint
will be added.

### Delete algorithms, data, generator, and tests

- `src/lib/algorithm/market-price.ts`
- `src/lib/algorithm/market-routing.ts`
- `src/lib/algorithm/__tests__/market-price.test.ts`
- `src/lib/algorithm/__tests__/market-routing.test.ts`
- `src/lib/algorithm/data/market-price-history.json`
- `src/lib/algorithm/data/madina-market-zones.json`
- `scripts/market-seed.ts`
- the two Makola module exports in `src/lib/algorithm/index.ts`

No database migration or data cleanup is required because Makola-Matrix stores
no application records in Supabase.

### Remove documentation and claims

Search the tracked repository for Makola-Matrix names, module paths, route
paths, generated dataset names, Madina zone-map references, and price-oracle
claims. Remove any remaining feature-specific references discovered by that
scan. Matching evaluation reports and documentation remain unchanged except
for text that explicitly describes Makola-Matrix as a current feature.

## Preserved Product Behavior

The words "market," "marketplace," and "grocery" are not removed globally.
Melange remains an errand marketplace, and users may still post market runs,
grocery shopping, restocking, pharmacy pickups, and deliveries as ordinary
errands. Matching, task lifecycle, payments, trust, disputes, Telegram support,
and the future Errand-Share feature are outside this removal boundary.

## User Experience After Removal

Authenticated users no longer see Makola-Matrix in the dashboard navigation.
All other navigation and errand flows retain their existing ordering and
behavior. No replacement card, placeholder, "coming soon" page, or disabled
feature is shown.

## Error and Compatibility Behavior

The deleted API endpoints have no documented external consumers in the
repository. Requests to deleted Makola routes receive the application's normal
not-found response. No deprecation layer is justified for this unvalidated
feature, and leaving one would preserve code and claims that the removal is
intended to eliminate.

## Verification

The implementation is complete only when all of the following hold:

1. A repository-wide tracked-file scan finds no Makola-Matrix runtime code,
   active product documentation, API, dataset, generator, or academic claims.
   The removal design and implementation plan remain as an audit record.
2. Generic market-errand and grocery-shopping product copy is still present.
3. The dashboard navigation renders without a Makola-Matrix entry.
4. `npm run lint` passes.
5. `npm run typecheck` passes.
6. `npm test -- --run` passes with the remaining test suite.
7. `npm run build` passes and the generated route table contains no
   `/app/market` or `/api/market/*` route.
8. The final Git diff contains only Makola removal and its design/plan
   documentation.

## Delivery

Implement and verify the removal as one commit series on
`agent/remove-makola-matrix`, then publish one pull request against `main`.
Errand-Share design and implementation begin only after this removal pull
request is reviewed and merged.
