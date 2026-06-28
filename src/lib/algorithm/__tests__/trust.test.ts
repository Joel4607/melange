import { describe, it, expect } from "vitest";
import { computeTrust, DEFAULT_TRUST_CONFIG } from "../trust";
import type { TrustEvent } from "../types";

const NOW = Date.UTC(2026, 0, 1);
const DAY = 86_400_000;

describe("computeTrust", () => {
  it("returns a neutral-ish score for a brand-new runner (cold start)", () => {
    const { trust } = computeTrust({ events: [], verified: false, now: NOW });
    expect(trust).toBeGreaterThan(0.3);
    expect(trust).toBeLessThan(0.7);
  });

  it("gives a verified new runner a higher cold-start trust than unverified", () => {
    const unverified = computeTrust({ events: [], verified: false, now: NOW }).trust;
    const verified = computeTrust({ events: [], verified: true, now: NOW }).trust;
    expect(verified).toBeGreaterThan(unverified);
  });

  it("rewards consistent completions and good ratings", () => {
    const events: TrustEvent[] = [];
    for (let i = 0; i < 20; i++) {
      events.push({ type: "completed", value: 1, at: NOW - i * DAY });
      events.push({ type: "rating", value: 5, at: NOW - i * DAY });
    }
    const { trust } = computeTrust({ events, verified: true, now: NOW });
    expect(trust).toBeGreaterThan(0.85);
  });

  it("penalises disputes and cancellations", () => {
    const good: TrustEvent[] = Array.from({ length: 10 }, (_, i) => ({
      type: "completed" as const,
      value: 1,
      at: NOW - i * DAY,
    }));
    const bad: TrustEvent[] = [
      ...good,
      ...Array.from({ length: 8 }, (_, i) => ({
        type: "dispute_lost" as const,
        value: 1,
        at: NOW - i * DAY,
      })),
    ];
    const goodTrust = computeTrust({ events: good, verified: true, now: NOW }).trust;
    const badTrust = computeTrust({ events: bad, verified: true, now: NOW }).trust;
    expect(badTrust).toBeLessThan(goodTrust);
  });

  it("weights recent behaviour more than old behaviour (time decay)", () => {
    const recentBad: TrustEvent[] = [
      { type: "completed", value: 1, at: NOW - 365 * DAY },
      { type: "cancelled", value: 1, at: NOW - 1 * DAY },
    ];
    const oldBad: TrustEvent[] = [
      { type: "completed", value: 1, at: NOW - 1 * DAY },
      { type: "cancelled", value: 1, at: NOW - 365 * DAY },
    ];
    const recent = computeTrust({ events: recentBad, verified: false, now: NOW }).trust;
    const old = computeTrust({ events: oldBad, verified: false, now: NOW }).trust;
    expect(old).toBeGreaterThan(recent);
  });

  it("applies a fraud-risk penalty", () => {
    const events: TrustEvent[] = Array.from({ length: 10 }, (_, i) => ({
      type: "completed" as const,
      value: 1,
      at: NOW - i * DAY,
    }));
    const clean = computeTrust({ events, verified: true, now: NOW }).trust;
    const flagged = computeTrust({
      events,
      verified: true,
      fraudRisk: 0.8,
      now: NOW,
    }).trust;
    expect(flagged).toBeLessThan(clean);
  });

  it("keeps trust within [0, 1]", () => {
    const events: TrustEvent[] = Array.from({ length: 5 }, (_, i) => ({
      type: "completed" as const,
      value: 1,
      at: NOW - i * DAY,
    }));
    const { trust } = computeTrust(
      { events, verified: true, fraudRisk: 1, now: NOW },
      DEFAULT_TRUST_CONFIG,
    );
    expect(trust).toBeGreaterThanOrEqual(0);
    expect(trust).toBeLessThanOrEqual(1);
  });
});
