# Disable Service-Worker Fetch Interception Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the service worker from intercepting network requests and remove all legacy Mélange Cache Storage entries without breaking push notifications.

**Architecture:** `public/sw.js` will remain a plain, directly registered service worker, but its responsibilities will be reduced to lifecycle cleanup and push handling. A Vitest test will execute the worker in a mocked service-worker global context and verify the registered event set and activation cleanup behavior.

**Tech Stack:** JavaScript service worker, Next.js 16 App Router, TypeScript, Vitest, Node `vm`

**Spec:** `docs/superpowers/specs/2026-08-25-disable-service-worker-fetch-design.md`

## Global Constraints

- Keep `/sw.js` registered through the existing root-layout registration.
- Do not register a service-worker `fetch` listener.
- Delete every Cache Storage entry whose name starts with `melange-` during activation.
- Keep push notification and notification-click behavior unchanged.
- Do not add dependencies or modify unrelated routing behavior.
- Deliver through `agent/disable-service-worker-fetch` and a pull request against `main`.

---

### Task 1: Replace Request Caching with Lifecycle Cleanup

**Files:**
- Create: `src/app/__tests__/service-worker.test.ts`
- Modify: `public/sw.js:1-113`

**Interfaces:**
- Consumes: Browser service-worker globals `self`, `caches`, install events, and activate events.
- Produces: A worker with listeners for `install`, `activate`, `push`, and `notificationclick`, and no listener for `fetch`.

- [ ] **Step 1: Write the failing service-worker behavior test**

Create `src/app/__tests__/service-worker.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

type WorkerListener = (event: { waitUntil?: (work: Promise<unknown>) => void }) => void;

async function loadWorker(cacheNames: string[] = []) {
  const listeners = new Map<string, WorkerListener>();
  const deleteCache = vi.fn(async () => true);
  const claim = vi.fn(async () => undefined);
  const skipWaiting = vi.fn();
  const source = await readFile(
    new URL("../../../public/sw.js", import.meta.url),
    "utf8",
  );

  const worker = {
    addEventListener: vi.fn((type: string, listener: WorkerListener) => {
      listeners.set(type, listener);
    }),
    skipWaiting,
    clients: { claim, openWindow: vi.fn() },
    registration: { showNotification: vi.fn() },
  };
  const cacheStorage = {
    keys: vi.fn(async () => cacheNames),
    delete: deleteCache,
  };

  vm.runInNewContext(source, { self: worker, caches: cacheStorage, Promise });

  return { listeners, deleteCache, claim, skipWaiting };
}

describe("service worker routing policy", () => {
  it("does not intercept fetches while retaining lifecycle and push listeners", async () => {
    const { listeners } = await loadWorker();

    expect([...listeners.keys()].sort()).toEqual([
      "activate",
      "install",
      "notificationclick",
      "push",
    ]);
    expect(listeners.has("fetch")).toBe(false);
  });

  it("removes only legacy Melange caches before claiming clients", async () => {
    const { listeners, deleteCache, claim } = await loadWorker([
      "melange-v1",
      "melange-v3",
      "unrelated-cache",
    ]);
    let activation: Promise<unknown> | undefined;

    listeners.get("activate")?.({
      waitUntil(work) {
        activation = work;
      },
    });
    await activation;

    expect(deleteCache).toHaveBeenCalledTimes(2);
    expect(deleteCache).toHaveBeenCalledWith("melange-v1");
    expect(deleteCache).toHaveBeenCalledWith("melange-v3");
    expect(deleteCache).not.toHaveBeenCalledWith("unrelated-cache");
    expect(claim).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the focused test and verify the unsafe worker fails it**

Run:

```powershell
npx vitest run src/app/__tests__/service-worker.test.ts
```

Expected: FAIL because the current worker registers a `fetch` listener and preserves `melange-v3` instead of deleting every `melange-*` cache.

- [ ] **Step 3: Replace the caching lifecycle with cleanup-only behavior**

Replace `public/sw.js` with:

```js
const LEGACY_CACHE_PREFIX = "melange-";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(
        keys
          .filter((key) => key.startsWith(LEGACY_CACHE_PREFIX))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    }),
  );
});

self.addEventListener("push", (event) => {
  let payload;
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = {};
  }

  const {
    title = "Mélange",
    body = "You have a new notification.",
    icon = "/icon-192x192.png",
    badge = "/icon-192x192.png",
    data = {},
  } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      data,
      requireInteraction: false,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/app";
  event.waitUntil(self.clients.openWindow(url));
});
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
npx vitest run src/app/__tests__/service-worker.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit the tested implementation**

```powershell
git add public/sw.js src/app/__tests__/service-worker.test.ts
git commit -m "fix: stop caching authenticated app routes"
```

---

### Task 2: Verify and Deliver the Security Fix

**Files:**
- Verify: `public/sw.js`
- Verify: `src/app/__tests__/service-worker.test.ts`
- Verify: entire project

**Interfaces:**
- Consumes: The cleanup-only service worker from Task 1.
- Produces: A verified branch and GitHub pull request against `main`.

- [ ] **Step 1: Prove request interception and cache writes are absent**

Run:

```powershell
rg -n 'addEventListener\("fetch"|caches\.open|cache\.put|staleWhileRevalidate|respondWith' public/sw.js
```

Expected: no matches and exit code 1.

- [ ] **Step 2: Run the complete automated test suite**

Run `npm test` and expect all test files and tests to pass.

- [ ] **Step 3: Run static verification**

Run each command separately:

```powershell
npm run typecheck
npm run lint
git diff origin/main --check
```

Expected: all commands exit successfully with no type, lint, or whitespace errors.

- [ ] **Step 4: Run the production build**

Run `npm run build` and expect the Next.js production build to complete successfully.

- [ ] **Step 5: Confirm the branch contains only the approved change**

Run:

```powershell
git status --short --branch
git diff --stat origin/main...HEAD
git log --oneline origin/main..HEAD
```

Expected: clean status; the diff contains the design, implementation plan, `public/sw.js`, and the service-worker test only.

- [ ] **Step 6: Push the branch and create the pull request**

```powershell
git push -u origin agent/disable-service-worker-fetch
gh pr create --base main --head agent/disable-service-worker-fetch --title "Stop service worker from caching account pages" --body "Disables all service-worker fetch interception, clears legacy Melange caches on activation, preserves push notifications, and adds regression coverage for the worker event policy."
```

Expected: GitHub returns the new pull-request URL.
