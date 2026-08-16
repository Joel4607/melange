import { describe, it, expect } from "vitest";
import { rankRunners, DEFAULT_MATCH_CONFIG } from "../matching";
import type { RunnerCandidate, TaskRequest } from "../types";

const pickup = { lat: 5.65, lng: -0.187 };

const baseTask: TaskRequest = { pickup, urgency: "normal" };

function runner(
  id: string,
  over: Partial<RunnerCandidate> = {},
): RunnerCandidate {
  return {
    runnerId: id,
    location: pickup,
    trust: 0.5,
    activeLoad: 0,
    available: true,
    active: true,
    verified: true,
    fraudAction: "clear",
    ...over,
  };
}

describe("rankRunners", () => {
  it("ranks a closer runner above a far one, all else equal", () => {
    const near = runner("near", { location: pickup });
    const far = runner("far", { location: { lat: 5.75, lng: -0.187 } });
    const ranked = rankRunners(baseTask, [far, near]);
    expect(ranked[0].runnerId).toBe("near");
    expect(ranked[0].rank).toBe(1);
  });

  it("ranks a higher-trust runner above a lower-trust one when distance is equal", () => {
    const trusted = runner("trusted", { trust: 0.95 });
    const untrusted = runner("untrusted", { trust: 0.1 });
    const ranked = rankRunners(baseTask, [untrusted, trusted]);
    expect(ranked[0].runnerId).toBe("trusted");
  });

  it("prefers a less-loaded runner via the availability term", () => {
    const free = runner("free", { activeLoad: 0 });
    const busy = runner("busy", { activeLoad: 5 });
    const ranked = rankRunners(baseTask, [busy, free]);
    expect(ranked[0].runnerId).toBe("free");
  });

  it("excludes unavailable runners", () => {
    const ranked = rankRunners(baseTask, [
      runner("a", { available: false }),
      runner("b", { available: true }),
    ]);
    expect(ranked.map((r) => r.runnerId)).toEqual(["b"]);
  });

  it("filters by capability when the task has a category", () => {
    const task: TaskRequest = { ...baseTask, category: "pharmacy" };
    const ranked = rankRunners(task, [
      runner("can", { capabilities: ["pharmacy", "groceries"] }),
      runner("cannot", { capabilities: ["groceries"] }),
      runner("any", { capabilities: [] }),
    ]);
    const ids = ranked.map((r) => r.runnerId);
    expect(ids).toContain("can");
    expect(ids).toContain("any");
    expect(ids).not.toContain("cannot");
  });

  it("requires every capability for a shared opportunity", () => {
    const task: TaskRequest = {
      ...baseTask,
      requiredCapabilities: ["pharmacy", "groceries"],
    };
    const ranked = rankRunners(task, [
      runner("both", { capabilities: ["groceries", "pharmacy", "fragile"] }),
      runner("partial", { capabilities: ["pharmacy"] }),
      runner("any", { capabilities: [] }),
    ]);

    expect(ranked.map((result) => result.runnerId)).toEqual(["any", "both"]);
  });

  it("charges shared opportunities for both load units", () => {
    const candidate = runner("runner", { activeLoad: 1 });
    const single = rankRunners({ ...baseTask, loadUnits: 1 }, [candidate])[0];
    const shared = rankRunners({ ...baseTask, loadUnits: 2 }, [candidate])[0];

    expect(single.components.capacity).toBeCloseTo(1 / 2);
    expect(shared.components.capacity).toBeCloseTo(1 / 3);
    expect(shared.components.capacity).toBeLessThan(single.components.capacity);
  });

  it("preserves the legacy single-task ordering", () => {
    const ranked = rankRunners(baseTask, [
      runner("far-trusted", {
        location: { lat: 5.69, lng: -0.187 },
        trust: 0.95,
      }),
      runner("near-busy", { activeLoad: 2, trust: 0.8 }),
      runner("near-free", { trust: 0.5 }),
    ]);

    expect(ranked.map((result) => result.runnerId)).toEqual([
      "near-free",
      "near-busy",
      "far-trusted",
    ]);
  });

  it("all component scores are within [0, 1]", () => {
    const ranked = rankRunners(baseTask, [
      runner("a", { location: { lat: 5.9, lng: -0.4 }, activeLoad: 3 }),
    ]);
    const c = ranked[0].components;
    for (const v of [c.proximity, c.trust, c.capacity, c.urgencyFit]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("weights are sensitive: raising trust weight can reorder results", () => {
    const closeLowTrust = runner("close", {
      location: pickup,
      trust: 0.1,
    });
    const farHighTrust = runner("far", {
      location: { lat: 5.69, lng: -0.187 },
      trust: 0.99,
    });
    const candidates = [closeLowTrust, farHighTrust];

    const proximityHeavy = rankRunners(baseTask, candidates, {
      ...DEFAULT_MATCH_CONFIG,
      weights: { proximity: 0.8, trust: 0.1, capacity: 0.05, urgency: 0.05 },
    });
    const trustHeavy = rankRunners(baseTask, candidates, {
      ...DEFAULT_MATCH_CONFIG,
      weights: { proximity: 0.1, trust: 0.8, capacity: 0.05, urgency: 0.05 },
    });

    expect(proximityHeavy[0].runnerId).toBe("close");
    expect(trustHeavy[0].runnerId).toBe("far");
  });

  it.each([
    ["inactive", { active: false }],
    ["unverified", { verified: false }],
    ["fraud-excluded", { fraudAction: "exclude" as const }],
    ["unlocated", { location: null }],
  ])("excludes %s candidates before scoring", (_label, override) => {
    const ranked = rankRunners(baseTask, [runner("eligible"), runner("blocked", override)]);
    expect(ranked.map((result) => result.runnerId)).toEqual(["eligible"]);
  });

  it("uses an estimated pickup-time urgency signal", () => {
    const candidate = runner("runner", {
      location: { lat: 5.69, lng: -0.187 },
      activeLoad: 2,
    });
    const express = rankRunners({ ...baseTask, urgency: "express" }, [candidate])[0];
    const low = rankRunners({ ...baseTask, urgency: "low" }, [candidate])[0];

    expect(express.components.estimatedPickupMinutes).toBeGreaterThan(0);
    expect(express.components.urgencyFit).toBeLessThan(low.components.urgencyFit);
  });

  it("breaks exact ties deterministically by runner id", () => {
    const ranked = rankRunners(baseTask, [runner("runner-b"), runner("runner-a")]);
    expect(ranked.map((result) => result.runnerId)).toEqual(["runner-a", "runner-b"]);
  });

  it("rejects invalid matcher configuration", () => {
    expect(() =>
      rankRunners(baseTask, [runner("runner")], {
        ...DEFAULT_MATCH_CONFIG,
        weights: { proximity: 1, trust: 1, capacity: 0, urgency: 0 },
      }),
    ).toThrow(/sum to 1/i);
  });

  it("does not mutate the candidate array", () => {
    const candidates = [runner("runner-b"), runner("runner-a")];
    const snapshot = structuredClone(candidates);
    rankRunners(baseTask, candidates);
    expect(candidates).toEqual(snapshot);
  });
});
