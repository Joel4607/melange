import { describe, expect, it } from "vitest";
import { evaluateErrandSharing, stableStringify } from "../metrics";

describe("Errand-Share deterministic evaluation", () => {
  it("is byte-stable for the same seed and changes with a different seed", () => {
    const first = stableStringify(evaluateErrandSharing({ seed: 4607, count: 250 }));
    const repeat = stableStringify(evaluateErrandSharing({ seed: 4607, count: 250 }));
    const different = stableStringify(evaluateErrandSharing({ seed: 4608, count: 250 }));

    expect(repeat).toBe(first);
    expect(different).not.toBe(first);
  });

  it("labels all evidence simulated and reports bounded metrics", () => {
    const report = evaluateErrandSharing({ seed: 4607, count: 500 });
    expect(report.evidence).toBe("simulated");
    expect(report.scenarioCount).toBe(500);
    for (const value of [
      report.metrics.pairingRate,
      report.metrics.distanceSavingRate,
      report.metrics.simulatedCancellationRate,
      report.metrics.simulatedCompletionRate,
    ]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("beats or equals the direct no-sharing baseline without hard violations", () => {
    const report = evaluateErrandSharing({ seed: 4607, count: 1000 });
    expect(report.metrics.sharedRouteKm).toBeLessThanOrEqual(
      report.metrics.noSharingBaselineKm,
    );
    expect(report.metrics.distanceSavedKm).toBeGreaterThanOrEqual(0);
    expect(report.metrics.deadlineViolations).toBe(0);
    expect(report.metrics.detourViolations).toBe(0);
    expect(report.metrics.hardConstraintViolations).toBe(0);
  });

  it("uses stable recursive JSON key ordering", () => {
    expect(stableStringify({ z: 1, a: { y: 2, b: 3 } })).toBe(
      '{\n  "a": {\n    "b": 3,\n    "y": 2\n  },\n  "z": 1\n}\n',
    );
  });
});
