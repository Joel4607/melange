import { describe, it, expect } from "vitest";
import { routeThroughZones, buildAdjacency, formatWalkTime } from "../market-routing";
import type { ZoneGraph } from "../market-routing";
import madinaRaw from "../data/madina-market-zones.json";

const MADINA = madinaRaw as ZoneGraph;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("routeThroughZones — Madina Market", () => {
  it("returns an empty route for an empty shopping list", () => {
    const result = routeThroughZones([], MADINA);
    expect(result.steps).toHaveLength(0);
    expect(result.totalWalkSeconds).toBe(0);
    expect(result.unmappedItems).toHaveLength(0);
  });

  it("visits every required zone exactly once", () => {
    const list = ["tomatoes", "rice", "soap", "smoked fish"];
    const result = routeThroughZones(list, MADINA);
    const visitedIds = result.steps.map((s) => s.zoneId);
    // No duplicate zone ids
    expect(new Set(visitedIds).size).toBe(visitedIds.length);
    // Every mapped item appears in some step's itemsCollected
    const collected = result.steps.flatMap((s) => s.itemsCollected);
    for (const item of list.filter((i) => !result.unmappedItems.includes(i))) {
      expect(collected).toContain(item);
    }
  });

  it("cumulative time of last step is less than totalWalkSeconds (return leg adds to total)", () => {
    const result = routeThroughZones(["tomatoes", "rice"], MADINA);
    expect(result.steps.length).toBeGreaterThan(0);
    const lastStep = result.steps[result.steps.length - 1];
    expect(lastStep.cumulativeSeconds).toBeLessThan(result.totalWalkSeconds);
  });

  it("each step's cumulativeSeconds equals sum of all legSeconds up to that step", () => {
    const result = routeThroughZones(["tomatoes", "onions", "yam", "palm oil"], MADINA);
    let running = 0;
    for (const step of result.steps) {
      running += step.legSeconds;
      expect(step.cumulativeSeconds).toBe(running);
    }
  });

  it("all leg times are positive (graph is connected through all required zones)", () => {
    const list = ["tomatoes", "rice", "soap", "yam", "smoked fish"];
    const result = routeThroughZones(list, MADINA);
    for (const step of result.steps) {
      expect(step.legSeconds).toBeGreaterThan(0);
    }
  });

  it("reports unmapped items rather than crashing", () => {
    const result = routeThroughZones(["tomatoes", "durian", "exotic_fruit_xyz"], MADINA);
    expect(result.unmappedItems).toContain("durian");
    expect(result.unmappedItems).toContain("exotic_fruit_xyz");
  });

  /**
   * KEY ACADEMIC RESULT: greedy path ≤ random order time.
   *
   * We compare the greedy NN path against the estimated random-order time
   * (average leg method) for several shopping list sizes.
   * The greedy path should always be no worse.
   */
  it("greedy path is no worse than random ordering for a 3-item list", () => {
    const result = routeThroughZones(["tomatoes", "rice", "soap"], MADINA);
    expect(result.totalWalkSeconds).toBeLessThanOrEqual(result.randomOrderSeconds + 1); // +1 for rounding
  });

  it("greedy path is no worse than random ordering for a 6-item list", () => {
    const result = routeThroughZones(
      ["tomatoes", "onions", "rice", "soap", "yam", "smoked fish"],
      MADINA,
    );
    expect(result.totalWalkSeconds).toBeLessThanOrEqual(result.randomOrderSeconds + 1);
  });

  it("savingsPct is non-negative", () => {
    const result = routeThroughZones(["tomatoes", "rice", "soap", "palm oil", "yam"], MADINA);
    expect(result.savingsPct).toBeGreaterThanOrEqual(0);
  });

  it("larger shopping lists do not take less time than smaller ones (monotonicity)", () => {
    const small = routeThroughZones(["tomatoes", "rice"], MADINA);
    const large = routeThroughZones(["tomatoes", "rice", "soap", "yam", "palm oil"], MADINA);
    expect(large.totalWalkSeconds).toBeGreaterThanOrEqual(small.totalWalkSeconds);
  });
});

describe("buildAdjacency", () => {
  it("produces a bidirectional adjacency map (all edges symmetric)", () => {
    const adj = buildAdjacency(MADINA);
    for (const edge of MADINA.edges) {
      expect(adj.get(edge.from)?.get(edge.to)).toBe(edge.walkSeconds);
      expect(adj.get(edge.to)?.get(edge.from)).toBe(edge.walkSeconds);
    }
  });

  it("entrance node has at least 2 neighbours", () => {
    const adj = buildAdjacency(MADINA);
    expect((adj.get("entrance")?.size ?? 0)).toBeGreaterThanOrEqual(2);
  });
});

describe("formatWalkTime", () => {
  it("formats seconds-only correctly", () => {
    expect(formatWalkTime(45)).toBe("45s");
  });
  it("formats minutes and seconds correctly", () => {
    expect(formatWalkTime(125)).toBe("2m 5s");
  });
  it("formats exact minutes correctly", () => {
    expect(formatWalkTime(120)).toBe("2m 0s");
  });
});
