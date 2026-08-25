import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

type WorkerListener = (event: {
  waitUntil?: (work: Promise<unknown>) => void;
}) => void;

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

  return { listeners, deleteCache, claim };
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
