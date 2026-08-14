import { describe, expect, it } from "vitest";
import {
  parseEvaluationArgs,
  renderEvaluationMarkdown,
  stableStringify,
} from "../../../../../scripts/evaluate-matching";
import { DEFAULT_MATCH_CONFIG } from "../../matching";
import type { MatchingEvaluationReport } from "../types";

function reportFixture(): MatchingEvaluationReport {
  return {
    evaluationVersion: "matching-evaluation-v1",
    generatorVersion: "matching-generator-v1",
    generatorSeed: 20260815,
    bootstrapSeed: 20260816,
    scenarioCount: 10,
    generatedAt: "deterministic",
    algorithmVersion: "matching-v2",
    configVersion: "matching-v2-calibrated",
    config: { ...DEFAULT_MATCH_CONFIG, configVersion: "matching-v2-calibrated" },
    weightPerturbationStability: 0.9,
    pairedDifferences: [],
    urgencyTargets: DEFAULT_MATCH_CONFIG.urgencyTargetMinutes,
    strategies: [],
    acceptanceCriteria: {
      zeroEligibilityViolations: true,
      ndcgAtLeast085: true,
    },
  };
}

describe("matching evaluation CLI", () => {
  it("parses calibration and final modes", () => {
    expect(parseEvaluationArgs(["--mode", "calibration"])).toEqual({ mode: "calibration" });
    expect(parseEvaluationArgs(["--mode=final"])).toEqual({ mode: "final" });
  });

  it("rejects missing and unknown modes", () => {
    expect(() => parseEvaluationArgs([])).toThrow(/--mode/i);
    expect(() => parseEvaluationArgs(["--mode", "preview"])).toThrow(/calibration.*final/i);
  });

  it("serializes reports with stable key ordering", () => {
    expect(stableStringify({ z: 1, a: { y: 2, b: 3 } })).toBe(
      '{\n  "a": {\n    "b": 3,\n    "y": 2\n  },\n  "z": 1\n}\n',
    );
  });

  it("renders reproducibility metadata and acceptance criteria", () => {
    const markdown = renderEvaluationMarkdown(reportFixture(), "Final");
    expect(markdown).toContain("# Matching Evaluation - Final");
    expect(markdown).toContain("20260815");
    expect(markdown).toContain("matching-generator-v1");
    expect(markdown).toContain("matching-v2-calibrated");
    expect(markdown).toContain("zeroEligibilityViolations");
    expect(markdown).toContain("PASS");
    expect(markdown).toContain("Weight perturbation stability: `90.00%`");
  });
});
