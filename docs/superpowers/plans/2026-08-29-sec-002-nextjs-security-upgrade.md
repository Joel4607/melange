# SEC-002 Next.js Security Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the audited Next.js production vulnerabilities, including the Windows-hosted unauthenticated RCE, by upgrading to the first patched 16.x release.

**Architecture:** Keep the framework and its ESLint rules on the same exact version. Treat the npm advisory result as the security regression check, then run the complete application verification gate and inspect the resolved dependency tree before committing.

**Tech Stack:** Next.js 16, React 19, npm, Vitest, ESLint, TypeScript

**Spec:** GitHub Security Advisory GHSA-p293-qw3h-jr36 and the SEC-002 audit finding in this task

## Global Constraints

- Upgrade `next` and `eslint-config-next` together to exactly `16.3.3`.
- Do not change React or unrelated direct dependency versions.
- Keep `package-lock.json` synchronized through npm.
- Require a clean production audit and the existing test, lint, typecheck, and build gates.

---

### Task 1: Upgrade the vulnerable framework packages

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: Existing Next.js application and npm lockfile
- Produces: A dependency tree resolving `next@16.3.3` and `eslint-config-next@16.3.3`

- [x] **Step 1: Run the failing security check**

Run: `npm audit --omit=dev --json`

Expected: FAIL with production vulnerabilities rooted in the current `next@16.2.9` tree.

- [x] **Step 2: Install the patched framework and matching lint configuration**

Run: `npm install --save-exact next@16.3.3 && npm install --save-dev --save-exact eslint-config-next@16.3.3`

Expected: `package.json` and `package-lock.json` resolve both packages at `16.3.3` without changing React.

- [x] **Step 3: Verify the resolved direct dependencies**

Run: `npm ls next eslint-config-next react react-dom --depth=0`

Expected: Next packages are `16.3.3`; React packages remain `19.2.4`.

- [x] **Step 4: Re-run the security check**

Run: `npm audit --omit=dev --json`

Expected: PASS with zero production vulnerabilities.

- [x] **Step 5: Run the application verification gate**

Run: `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`.

Expected: All commands exit successfully.

- [x] **Step 6: Commit the isolated security upgrade**

```bash
git add package.json package-lock.json docs/superpowers/plans/2026-08-29-sec-002-nextjs-security-upgrade.md
git commit -m "fix: upgrade Next.js security release"
```
