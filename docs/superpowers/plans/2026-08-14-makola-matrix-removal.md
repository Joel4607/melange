# Makola-Matrix Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every Makola-Matrix runtime, API, algorithm, data, generator, navigation, and active academic-claim surface while preserving ordinary market and grocery errands.

**Architecture:** Delete the isolated feature vertically from UI through APIs, pure algorithms, datasets, generator, and tests. Remove its dashboard and algorithm-barrel references, retain a small source-level regression test against reintroduction, then use the Next.js route table and repository scans to prove the application no longer exposes the feature.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Vitest 4, ESLint 9

**Spec:** `docs/superpowers/specs/2026-08-14-makola-matrix-removal-design.md`

## Global Constraints

- Remove Makola-Matrix completely; do not leave disabled routes, placeholders, redirects, or compatibility endpoints.
- Preserve ordinary market-run, grocery-shopping, pharmacy, delivery, and marketplace copy.
- Do not alter matching, task lifecycle, payments, trust, disputes, Telegram, or Errand-Share behavior.
- Do not add a database migration; the removed feature has no Supabase records.
- Keep the removal design, this plan, and the regression test as audit evidence.
- Deliver the verified removal in one pull request against `main`.

---

### Task 1: Remove the Makola-Matrix vertical slice

**Files:**
- Create: `src/app/app/__tests__/makola-removal.test.ts`
- Modify: `src/app/app/dashboard-shell.tsx`
- Modify: `src/lib/algorithm/index.ts`
- Delete: `src/app/app/market/page.tsx`
- Delete: `src/app/api/market/price/route.ts`
- Delete: `src/app/api/market/route/route.ts`
- Delete: `src/lib/algorithm/market-price.ts`
- Delete: `src/lib/algorithm/market-routing.ts`
- Delete: `src/lib/algorithm/__tests__/market-price.test.ts`
- Delete: `src/lib/algorithm/__tests__/market-routing.test.ts`
- Delete: `src/lib/algorithm/data/market-price-history.json`
- Delete: `src/lib/algorithm/data/madina-market-zones.json`
- Delete: `scripts/market-seed.ts`

**Interfaces:**
- Consumes: repository root from `process.cwd()` and the existing dashboard/algorithm barrel source files.
- Produces: an application with no `/app/market` or `/api/market/*` route and no Makola algorithm exports.

- [ ] **Step 1: Add the failing removal regression test**

Create `src/app/app/__tests__/makola-removal.test.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const removedPaths = [
  "src/app/app/market/page.tsx",
  "src/app/api/market/price/route.ts",
  "src/app/api/market/route/route.ts",
  "src/lib/algorithm/market-price.ts",
  "src/lib/algorithm/market-routing.ts",
  "src/lib/algorithm/__tests__/market-price.test.ts",
  "src/lib/algorithm/__tests__/market-routing.test.ts",
  "src/lib/algorithm/data/market-price-history.json",
  "src/lib/algorithm/data/madina-market-zones.json",
  "scripts/market-seed.ts",
] as const;

describe("Makola-Matrix removal", () => {
  it.each(removedPaths)("removes %s", (path) => {
    expect(existsSync(resolve(process.cwd(), path))).toBe(false);
  });

  it("removes navigation and algorithm exports", () => {
    const dashboard = readFileSync(
      resolve(process.cwd(), "src/app/app/dashboard-shell.tsx"),
      "utf8",
    );
    const algorithmIndex = readFileSync(
      resolve(process.cwd(), "src/lib/algorithm/index.ts"),
      "utf8",
    );

    expect(dashboard).not.toContain("/app/market");
    expect(dashboard).not.toContain("Makola-Matrix");
    expect(algorithmIndex).not.toContain("./market-price");
    expect(algorithmIndex).not.toContain("./market-routing");
  });
});
```

- [ ] **Step 2: Run the new test and confirm the red state**

Run:

```bash
npx vitest run src/app/app/__tests__/makola-removal.test.ts
```

Expected: FAIL because all ten removed paths still exist and the navigation/barrel still contain Makola references.

- [ ] **Step 3: Remove the navigation item and unused icon import**

In `src/app/app/dashboard-shell.tsx`, remove `ShoppingBasket` from the `lucide-react` import and delete this buyer navigation entry:

```tsx
{ href: "/app/market", label: "Makola-Matrix", icon: <ShoppingBasket className="h-5 w-5" /> },
```

- [ ] **Step 4: Remove the algorithm barrel exports**

Delete these lines from `src/lib/algorithm/index.ts`:

```ts
export * from "./market-price";
export * from "./market-routing";
```

- [ ] **Step 5: Delete the ten isolated feature files**

Delete exactly the ten files listed in this task's `Delete` block. Do not delete generic market/grocery product pages or copy.

- [ ] **Step 6: Run the focused test and verify the green state**

Run:

```bash
npx vitest run src/app/app/__tests__/makola-removal.test.ts
```

Expected: PASS with 11 tests: ten absent paths plus one navigation/export assertion.

- [ ] **Step 7: Run adjacent algorithm and action tests**

Run:

```bash
npx vitest run src/lib/algorithm/__tests__ src/app/app/__tests__
```

Expected: PASS. The removed market test files are absent; matching and application action tests remain green.

- [ ] **Step 8: Commit the complete runtime removal**

```bash
git add src/app/app/__tests__/makola-removal.test.ts src/app/app/dashboard-shell.tsx src/lib/algorithm/index.ts scripts/market-seed.ts src/app/app/market/page.tsx src/app/api/market/price/route.ts src/app/api/market/route/route.ts src/lib/algorithm/market-price.ts src/lib/algorithm/market-routing.ts src/lib/algorithm/__tests__/market-price.test.ts src/lib/algorithm/__tests__/market-routing.test.ts src/lib/algorithm/data/market-price-history.json src/lib/algorithm/data/madina-market-zones.json
git commit -m "refactor: remove Makola-Matrix"
```

---

### Task 2: Prove repository and production removal

**Files:**
- Verify: all tracked runtime and active documentation files
- Verify: generated Next.js route table
- Preserve: `src/app/page.tsx`, `src/app/get-started/page.tsx`, and `src/app/layout.tsx` generic market/grocery copy

**Interfaces:**
- Consumes: Task 1's removed runtime surface.
- Produces: reproducible evidence that the remaining application builds and does not expose Makola routes.

- [ ] **Step 1: Scan for prohibited active references**

Run:

```bash
rg -n "Makola-Matrix|Makola Matrix|market-price|market-routing|market-price-history|madina-market-zones|market-seed|/app/market|/api/market" . -g "!node_modules/**" -g "!.next/**" -g "!.git/**" -g "!docs/superpowers/specs/2026-08-14-makola-matrix-removal-design.md" -g "!docs/superpowers/plans/2026-08-14-makola-matrix-removal.md" -g "!src/app/app/__tests__/makola-removal.test.ts"
```

Expected: no output and exit code `1`, meaning no active reference matched.

- [ ] **Step 2: Confirm generic product use cases remain**

Run:

```bash
rg -n "market runs|Grocery Shopping|errand marketplace" src/app README.md
```

Expected: matches remain in generic landing/onboarding/product copy.

- [ ] **Step 3: Run repository lint and type-check**

Run:

```bash
npm run lint
npm run typecheck
```

Expected: both commands exit `0` with no errors or warnings.

- [ ] **Step 4: Run the full test suite**

Run:

```bash
npm test -- --run
```

Expected: all remaining test files and tests pass.

- [ ] **Step 5: Run the production build and inspect routes**

Run:

```bash
npm run build
```

Expected: exit `0`; the printed route table contains neither `/app/market` nor `/api/market/price` nor `/api/market/route`.

- [ ] **Step 6: Verify diff scope and worktree state**

Run:

```bash
git diff --check origin/main...HEAD
git diff --name-status origin/main...HEAD
git status --short
```

Expected: no whitespace errors; only the accepted design, implementation plan, one removal test, two edited references, and ten deleted feature files appear; the worktree is clean.

- [ ] **Step 7: Publish one removal pull request**

Push `agent/remove-makola-matrix` and open one PR against `main`. The PR description must state that generic market/grocery errands remain, list the removed surfaces, and include lint, type-check, test, build, route-table, and reference-scan evidence.
