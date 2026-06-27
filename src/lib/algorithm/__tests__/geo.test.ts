import { describe, it, expect } from "vitest";
import { haversineKm } from "../geo";

describe("haversineKm", () => {
  it("is zero for the same point", () => {
    expect(haversineKm({ lat: 5.6, lng: -0.18 }, { lat: 5.6, lng: -0.18 })).toBe(
      0,
    );
  });

  it("is symmetric", () => {
    const a = { lat: 5.6037, lng: -0.187 };
    const b = { lat: 5.65, lng: -0.2 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 9);
  });

  it("matches a known distance (Accra ~ 1 degree latitude ≈ 111km)", () => {
    const d = haversineKm({ lat: 5, lng: 0 }, { lat: 6, lng: 0 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });
});
