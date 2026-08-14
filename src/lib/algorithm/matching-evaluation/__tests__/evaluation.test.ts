import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  generateScenarios,
  bootstrapMeanInterval,
  ndcgAtK,
  normalizedRegret,
  oracleUtility,
  rankLegacyCurrent,
  selectHighestTrust,
  selectNearest,
  topChoiceStability,
  evaluateAllStrategies,
  eligibleCandidates,
} from "../index";
import { CALIBRATED_MATCH_CONFIG, DEFAULT_MATCH_CONFIG } from "../../matching";
import type { SimulatedScenario } from "../types";

describe("matching evaluation", () => {
  it("generates byte-identical scenarios for the same seed", () => {
    const first = generateScenarios({ seed: 20260814, count: 8 });
    const second = generateScenarios({ seed: 20260814, count: 8 });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("changes the scenarios when the seed changes", () => {
    const first = generateScenarios({ seed: 20260814, count: 3 });
    const second = generateScenarios({ seed: 20260815, count: 3 });
    expect(first).not.toEqual(second);
  });

  it("uses a recurring simulated runner pool so concentration is measurable", () => {
    const scenarios = generateScenarios({ seed: 20260814, count: 20 });
    const ids = scenarios.flatMap((scenario) =>
      scenario.candidates.map(({ candidate }) => candidate.runnerId),
    );
    expect(new Set(ids).size).toBeLessThan(ids.length);
  });

  it("calculates hand-computable ranking metrics", () => {
    expect(normalizedRegret(1, 0.9)).toBeCloseTo(0.1);
    expect(normalizedRegret(0, 0)).toBe(0);
    expect(ndcgAtK([3, 2, 1], [3, 2, 1], 3)).toBeCloseTo(1);
    expect(ndcgAtK([1, 2, 3], [3, 2, 1], 3)).toBeLessThan(1);
  });

  it("produces deterministic bounded bootstrap intervals", () => {
    const first = bootstrapMeanInterval([0, 1, 1, 1], 20260816, 200);
    const second = bootstrapMeanInterval([0, 1, 1, 1], 20260816, 200);
    expect(first).toEqual(second);
    expect(first.lower).toBeGreaterThanOrEqual(0);
    expect(first.upper).toBeLessThanOrEqual(1);
    expect(first.lower).toBeLessThanOrEqual(0.75);
    expect(first.upper).toBeGreaterThanOrEqual(0.75);
  });

  it("measures top-choice stability under ten-percent weight perturbations", () => {
    const scenarios = generateScenarios({ seed: 20260814, count: 30 });
    const stability = topChoiceStability(scenarios, DEFAULT_MATCH_CONFIG);
    expect(stability).toBeGreaterThanOrEqual(0);
    expect(stability).toBeLessThanOrEqual(1);
  });

  it("implements nearest and highest-trust baselines", () => {
    const scenario = generateScenarios({ seed: 77, count: 1 })[0];
    const eligible = eligibleCandidates(scenario);
    const nearest = [...eligible].sort((a, b) =>
      scenario.candidates.find(({ candidate }) => candidate.runnerId === a.runnerId)!.distanceKm -
        scenario.candidates.find(({ candidate }) => candidate.runnerId === b.runnerId)!.distanceKm)[0];
    const trusted = [...eligible].sort(
      (a, b) => b.trust - a.trust || a.runnerId.localeCompare(b.runnerId),
    )[0];

    expect(selectNearest(scenario)?.runnerId).toBe(nearest?.runnerId);
    expect(selectHighestTrust(scenario)?.runnerId).toBe(trusted?.runnerId);
  });

  it("preserves a frozen adapter for the pre-v2 production matcher", () => {
    const scenario = generateScenarios({ seed: 79, count: 1 })[0];
    const ranked = rankLegacyCurrent(scenario);
    expect(ranked.length).toBeGreaterThan(0);
    expect(rankLegacyCurrent(scenario).map((candidate) => candidate.runnerId)).toEqual(
      ranked.map((candidate) => candidate.runnerId),
    );
  });

  it("preserves legacy input order when scores tie", () => {
    const source = generateScenarios({ seed: 80, count: 1 })[0];
    const first = source.candidates.find(({ candidate }) =>
      eligibleCandidates(source).some(({ runnerId }) => runnerId === candidate.runnerId),
    )!;
    const scenario: SimulatedScenario = {
      ...source,
      candidates: [
        { ...first, candidate: { ...first.candidate, runnerId: "runner-z" } },
        { ...first, candidate: { ...first.candidate, runnerId: "runner-a" } },
      ],
    };
    expect(rankLegacyCurrent(scenario).map(({ runnerId }) => runnerId)).toEqual([
      "runner-z",
      "runner-a",
    ]);
  });

  it("reports promised metadata, fairness, slices, and paired intervals", () => {
    const scenarios = generateScenarios({ seed: 91, count: 40 });
    const report = evaluateAllStrategies(scenarios, DEFAULT_MATCH_CONFIG, 91);
    expect(report.generatorVersion).toMatch(/matching-generator/);
    expect(report.pairedDifferences).toHaveLength(5);
    for (const comparison of report.pairedDifferences) {
      expect(comparison.interval.lower).toBeLessThanOrEqual(comparison.meanDifference);
      expect(comparison.interval.upper).toBeGreaterThanOrEqual(comparison.meanDifference);
    }
    for (const strategy of report.strategies) {
      expect(strategy.metrics.selectionConcentration).toBeGreaterThan(0);
      expect(strategy.slices.distance.length).toBeGreaterThan(0);
      expect(strategy.slices.activeLoad.length).toBeGreaterThan(0);
    }
  });

  it("keeps the calibrated production configuration identical to the frozen report", () => {
    const report = JSON.parse(
      readFileSync("reports/matching/calibration.json", "utf8"),
    ) as { config: typeof CALIBRATED_MATCH_CONFIG };
    expect(CALIBRATED_MATCH_CONFIG).toEqual(report.config);
  });

  it("keeps the hidden oracle bounded and deterministic", () => {
    const scenario = generateScenarios({ seed: 101, count: 1 })[0];
    for (const runner of scenario.candidates) {
      const first = oracleUtility(scenario.task, runner);
      const second = oracleUtility(scenario.task, runner);
      expect(first).toBe(second);
      expect(first).toBeGreaterThanOrEqual(0);
      expect(first).toBeLessThanOrEqual(1);
    }
  });

  it("does not let the generator or oracle import matcher scoring", () => {
    const generator = readFileSync(
      new URL("../generator.ts", import.meta.url),
      "utf8",
    );
    const oracle = readFileSync(new URL("../oracle.ts", import.meta.url), "utf8");
    for (const source of [generator, oracle]) {
      expect(source).not.toMatch(/from\s+["']\.\.\/matching["']/);
      expect(source).not.toContain("DEFAULT_MATCH_CONFIG");
      expect(source).not.toContain("rankRunners");
    }
  });

  it("exports scenarios with at least one eligible candidate", () => {
    const scenarios: SimulatedScenario[] = generateScenarios({ seed: 88, count: 20 });
    expect(scenarios).toHaveLength(20);
    for (const scenario of scenarios) {
      expect(
        scenario.candidates.some(({ candidate }) =>
          candidate.available &&
          candidate.active &&
          candidate.verified &&
          candidate.fraudAction !== "exclude" &&
          candidate.location !== null,
        ),
      ).toBe(true);
    }
  });
});
