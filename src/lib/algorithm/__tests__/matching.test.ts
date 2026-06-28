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

  it("all component scores are within [0, 1]", () => {
    const ranked = rankRunners(baseTask, [
      runner("a", { location: { lat: 5.9, lng: -0.4 }, activeLoad: 3 }),
    ]);
    const c = ranked[0].components;
    for (const v of [c.proximity, c.trust, c.availability, c.urgencyFit]) {
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
      weights: { proximity: 0.8, trust: 0.1, availability: 0.05, urgency: 0.05 },
    });
    const trustHeavy = rankRunners(baseTask, candidates, {
      ...DEFAULT_MATCH_CONFIG,
      weights: { proximity: 0.1, trust: 0.8, availability: 0.05, urgency: 0.05 },
    });

    expect(proximityHeavy[0].runnerId).toBe("close");
    expect(trustHeavy[0].runnerId).toBe("far");
  });
});
