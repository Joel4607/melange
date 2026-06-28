import { describe, it, expect } from "vitest";
import { evaluateFraud, DEFAULT_FRAUD_CONFIG } from "../fraud";
import type { FraudContext } from "../types";

const task = { lat: 5.65, lng: -0.187 };
const ACCEPT = Date.UTC(2026, 0, 1, 10, 0, 0);

describe("evaluateFraud", () => {
  it("clears an honest completion", () => {
    const ctx: FraudContext = {
      proofLocation: { lat: 5.6501, lng: -0.187 },
      taskLocation: task,
      taskDistanceKm: 4,
      acceptedAt: ACCEPT,
      completedAt: ACCEPT + 30 * 60_000, // 30 minutes
      recentCancellations: 0,
      disputesWithSameCounterparty: 0,
    };
    const res = evaluateFraud(ctx);
    expect(res.action).toBe("clear");
    expect(res.escalate).toBe(false);
    expect(res.risk).toBeLessThan(DEFAULT_FRAUD_CONFIG.softThreshold);
  });

  it("flags a proof far from the task location", () => {
    const ctx: FraudContext = {
      proofLocation: { lat: 5.8, lng: -0.4 },
      taskLocation: task,
    };
    const res = evaluateFraud(ctx);
    const finding = res.findings.find((f) => f.ruleType === "gps_mismatch");
    expect(finding?.triggered).toBe(true);
  });

  it("flags an impossible completion speed", () => {
    const ctx: FraudContext = {
      taskDistanceKm: 50,
      acceptedAt: ACCEPT,
      completedAt: ACCEPT + 60_000, // 1 minute for 50km
    };
    const res = evaluateFraud(ctx);
    const finding = res.findings.find((f) => f.ruleType === "impossible_speed");
    expect(finding?.triggered).toBe(true);
  });

  it("escalates (hard) when multiple strong rules fire", () => {
    const ctx: FraudContext = {
      proofLocation: { lat: 5.9, lng: -0.5 },
      taskLocation: task,
      taskDistanceKm: 50,
      acceptedAt: ACCEPT,
      completedAt: ACCEPT + 60_000,
    };
    const res = evaluateFraud(ctx);
    expect(res.action).toBe("exclude");
    expect(res.escalate).toBe(true);
    expect(res.risk).toBeGreaterThanOrEqual(DEFAULT_FRAUD_CONFIG.hardThreshold);
  });

  it("applies a soft penalty for a single moderate signal", () => {
    const ctx: FraudContext = {
      recentCancellations: DEFAULT_FRAUD_CONFIG.cancellationThreshold,
      disputesWithSameCounterparty: 0,
    };
    const res = evaluateFraud(ctx);
    expect(res.action).toBe("penalize");
    expect(res.escalate).toBe(false);
  });

  it("keeps aggregated risk within [0, 1]", () => {
    const ctx: FraudContext = {
      proofLocation: { lat: 6.5, lng: -1 },
      taskLocation: task,
      taskDistanceKm: 100,
      acceptedAt: ACCEPT,
      completedAt: ACCEPT + 30_000,
      recentCancellations: 10,
      disputesWithSameCounterparty: 10,
    };
    const res = evaluateFraud(ctx);
    expect(res.risk).toBeGreaterThanOrEqual(0);
    expect(res.risk).toBeLessThanOrEqual(1);
  });
});
