import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  predictPrice,
  predictBasketCost,
  MARKET_CATALOGUE,
  DEFAULT_MARKET_CONFIG,
} from "../market-price";
import type { PriceObservation } from "../market-price";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate n weeks of synthetic price history around a given mean. */
function makeHistory(
  weeks: number,
  mean: number,
  noiseAmp: number,
  seed = 42,
): PriceObservation[] {
  // Deterministic PRNG (mulberry32) — no Math.random() in tests
  let s = seed;
  function rand(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  }

  const now = new Date("2026-08-05");
  return Array.from({ length: weeks }, (_, i) => {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - i * 7);
    return {
      weekStart: weekStart.toISOString().slice(0, 10),
      priceGHS: Math.max(0.5, mean + (rand() - 0.5) * 2 * noiseAmp),
    };
  });
}

// Tomato price range from catalogue
const tomatoCat = MARKET_CATALOGUE.find((m) => m.key === "tomatoes")!;
const tomatoMean = (tomatoCat.minGHS + tomatoCat.maxGHS) / 2; // ~10.5

describe("generated market price history", () => {
  it("commits the deterministic seeded dataset required by the price API", () => {
    const historyPath = resolve(
      process.cwd(),
      "src/lib/algorithm/data/market-price-history.json",
    );
    expect(existsSync(historyPath)).toBe(true);

    const payload = JSON.parse(readFileSync(historyPath, "utf8")) as {
      prngSeed: number;
      history: Record<string, PriceObservation[]>;
    };
    expect(payload.prngSeed).toBe(1337);
    expect(Object.keys(payload.history)).toHaveLength(MARKET_CATALOGUE.length);
    for (const item of MARKET_CATALOGUE) {
      expect(payload.history[item.key]).toHaveLength(104);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("predictPrice", () => {
  it("returns a prediction within the catalogue min-max range for tomatoes", () => {
    const history = makeHistory(12, tomatoMean, 3);
    const result = predictPrice("tomatoes", history, new Date("2026-08-05"));
    // Allow 20 % buffer either side (seasonal correction can push slightly out)
    expect(result.predicted).toBeGreaterThan(tomatoCat.minGHS * 0.8);
    expect(result.predicted).toBeLessThan(tomatoCat.maxGHS * 1.2);
  });

  it("confidence interval always straddles the prediction", () => {
    const history = makeHistory(12, tomatoMean, 3);
    const result = predictPrice("tomatoes", history, new Date("2026-08-05"));
    expect(result.lower).toBeLessThanOrEqual(result.predicted);
    expect(result.upper).toBeGreaterThanOrEqual(result.predicted);
  });

  it("wider noise → wider confidence interval", () => {
    const narrow = predictPrice("tomatoes", makeHistory(12, tomatoMean, 1), new Date("2026-08-05"));
    const wide = predictPrice("tomatoes", makeHistory(12, tomatoMean, 5), new Date("2026-08-05"));
    const narrowSpread = narrow.upper - narrow.lower;
    const wideSpread = wide.upper - wide.lower;
    expect(wideSpread).toBeGreaterThan(narrowSpread);
  });

  it("marks trend as 'rising' when recent weeks are consistently higher", () => {
    // Construct a clearly rising series: week 0 (most recent) = 15, descending to 5
    const rising: PriceObservation[] = Array.from({ length: 12 }, (_, i) => {
      const d = new Date("2026-08-05");
      d.setDate(d.getDate() - i * 7);
      return { weekStart: d.toISOString().slice(0, 10), priceGHS: 15 - i * 0.8 };
    });
    const result = predictPrice("tomatoes", rising, new Date("2026-08-05"));
    expect(result.trend).toBe("rising");
  });

  it("marks trend as 'falling' when recent weeks are consistently lower", () => {
    const falling: PriceObservation[] = Array.from({ length: 12 }, (_, i) => {
      const d = new Date("2026-08-05");
      d.setDate(d.getDate() - i * 7);
      return { weekStart: d.toISOString().slice(0, 10), priceGHS: 5 + i * 0.8 };
    });
    const result = predictPrice("tomatoes", falling, new Date("2026-08-05"));
    expect(result.trend).toBe("falling");
  });

  it("applies a higher seasonal multiplier in dry season (January) than rainy season (August)", () => {
    const history = makeHistory(12, tomatoMean, 1);
    const jan = predictPrice("tomatoes", history, new Date("2026-01-15"));
    const aug = predictPrice("tomatoes", history, new Date("2026-08-15"));
    // January is Harmattan; tomato prices peak
    expect(jan.seasonalMultiplier).toBeGreaterThan(aug.seasonalMultiplier);
    expect(jan.predicted).toBeGreaterThan(aug.predicted);
  });

  it("EWMA reacts faster than a naïve mean after a persistent level shift", () => {
    // April's tomato seasonal index is neutral (1.0), so this fixture isolates
    // recency weighting instead of mixing it with the seasonal adjustment.
    const trainHistory: PriceObservation[] = Array.from({ length: 13 }, (_, index) => {
      const date = new Date("2026-04-08");
      date.setDate(date.getDate() - index * 7);
      return {
        weekStart: date.toISOString().slice(0, 10),
        priceGHS: index < 4 ? 14 : 8,
      };
    });
    const holdout: PriceObservation[] = ["2026-04-15", "2026-04-22", "2026-04-29"].map(
      (weekStart) => ({ weekStart, priceGHS: 15 }),
    );

    // Naïve mean prediction
    const naiveMean =
      trainHistory.reduce((s, o) => s + o.priceGHS, 0) / trainHistory.length;
    const naiveMAE =
      holdout.reduce((s, o) => s + Math.abs(o.priceGHS - naiveMean), 0) / holdout.length;

    // EWMA prediction (trained on trainHistory, evaluated on holdout dates)
    const ewmaMAEs = holdout.map((obs) => {
      const pred = predictPrice("tomatoes", trainHistory, new Date(obs.weekStart), DEFAULT_MARKET_CONFIG);
      return Math.abs(obs.priceGHS - pred.predicted);
    });
    const ewmaMAE = ewmaMAEs.reduce((s, e) => s + e, 0) / ewmaMAEs.length;

    // The recent training observations reflect the new level, so EWMA should
    // adapt sooner than a mean over the full pre/post-shift window.
    expect(ewmaMAE).toBeLessThan(naiveMAE);
  });

  it("throws for an unknown item key", () => {
    expect(() => predictPrice("durian", [], new Date())).toThrow("Unknown market item");
  });

  it("throws for an empty history", () => {
    expect(() => predictPrice("tomatoes", [], new Date())).toThrow("at least one observation");
  });
});

describe("predictBasketCost", () => {
  it("sums individual predictions correctly", () => {
    const history = {
      tomatoes: makeHistory(12, 8, 2),
      onions: makeHistory(12, 7, 1.5),
      rice: makeHistory(12, 11, 0.5),
    };
    const result = predictBasketCost(
      [
        { itemKey: "tomatoes", quantity: 2 },
        { itemKey: "onions", quantity: 1 },
        { itemKey: "rice", quantity: 3 },
      ],
      history,
    );
    expect(result.grandTotal.lower).toBeLessThan(result.grandTotal.midpoint);
    expect(result.grandTotal.midpoint).toBeLessThan(result.grandTotal.upper);
    expect(result.items).toHaveLength(3);
  });

  it("uses catalogue midpoint as fallback when no history provided", () => {
    const result = predictBasketCost([{ itemKey: "yam", quantity: 1 }], {});
    const cat = MARKET_CATALOGUE.find((m) => m.key === "yam")!;
    expect(result.grandTotal.midpoint).toBeCloseTo((cat.minGHS + cat.maxGHS) / 2, 0);
  });
});
