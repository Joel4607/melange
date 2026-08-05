/**
 * Market Price Prediction — Makola-Matrix Module
 *
 * Predicts the current price of a market item using an Exponentially-Weighted
 * Moving Average (EWMA) over a rolling 12-week window, with a multiplicative
 * seasonal adjustment calibrated on Accra/Legon market price patterns.
 *
 * Algorithm:
 *   price_t = Σ(w_i × obs_{t-i}) / Σ(w_i)
 *   w_i     = exp(-λ × i),  i = 0 (most recent) … window-1
 *
 * Confidence interval (90 %): predicted ± 1.645 × rolling stdDev of errors
 *
 * Academic framing: EWMA is the correct baseline choice for noisy, non-linear
 * commodity prices in informal markets. It outperforms OLS on hold-out data
 * (see scripts/market-seed.ts for the result table), requires no external
 * dependencies, and is explainable to a market vendor without ML training.
 *
 * ponytail: EWMA with seasonal index. Upgrade to seasonal decomposition
 * (STL) when you have ≥3 years of verified data.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One weekly price observation for one item. */
export interface PriceObservation {
  /** ISO date string of the week start (Monday). */
  weekStart: string;
  /** Observed price in GHS (varies by unit per item — see catalogue). */
  priceGHS: number;
}

/** A catalogue entry describing an item and its observed price range. */
export interface MarketItem {
  /** Machine-readable key, e.g. "tomatoes". */
  key: string;
  /** Human-readable name, e.g. "Tomatoes (1 kg)". */
  label: string;
  /** Unit, e.g. "per kg", "per cup", "per piece". */
  unit: string;
  /** Minimum observed price in GHS (dry season / scarcity). */
  minGHS: number;
  /** Maximum observed price in GHS (rainy season / glut). */
  maxGHS: number;
  /**
   * Month-of-year seasonal multiplier (index 0 = January … 11 = December).
   * Values > 1 = more expensive than the annual mean; < 1 = cheaper.
   * Calibrated against GSS CPI food sub-indices and Accra market reports.
   */
  seasonalIndex: number[];
}

/** Output of the price prediction function. */
export interface PricePrediction {
  item: string;
  /** EWMA-predicted price in GHS. */
  predicted: number;
  /** Lower bound of the 90 % confidence interval. */
  lower: number;
  /** Upper bound of the 90 % confidence interval. */
  upper: number;
  /** Direction of the recent 4-week trend. */
  trend: "rising" | "stable" | "falling";
  /** The seasonal multiplier applied for the target month. */
  seasonalMultiplier: number;
  /** Number of historical observations used. */
  observationsUsed: number;
}

export interface MarketPriceConfig {
  /** EWMA decay constant λ. Higher = faster decay (more weight on recent). */
  decayLambda: number;
  /** Rolling window of weeks used for EWMA and stdDev. */
  windowWeeks: number;
  /** Number of recent weeks used to determine trend direction. */
  trendWeeks: number;
  /** z-score for confidence interval (1.645 = 90 %). */
  ciZScore: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_MARKET_CONFIG: MarketPriceConfig = {
  decayLambda: 0.3,
  windowWeeks: 12,
  trendWeeks: 4,
  ciZScore: 1.645,
};

/**
 * Catalogue of items tracked at Madina Market, Accra.
 * Prices calibrated from Ghana Statistical Service CPI food sub-indices
 * and UG Legon student field observations (August 2026).
 */
export const MARKET_CATALOGUE: MarketItem[] = [
  {
    key: "tomatoes",
    label: "Tomatoes",
    unit: "per kg",
    minGHS: 3,
    maxGHS: 18,
    // Expensive Dec–Feb (dry/Harmattan), cheap Jun–Sep (rainy/harvest)
    seasonalIndex: [1.55, 1.45, 1.25, 1.0, 0.85, 0.65, 0.55, 0.55, 0.65, 0.85, 1.05, 1.40],
  },
  {
    key: "onions",
    label: "Onions",
    unit: "per kg",
    minGHS: 4,
    maxGHS: 15,
    // Mild seasonality — slight shortage in Mar–May before northern harvest
    seasonalIndex: [1.20, 1.25, 1.30, 1.15, 1.05, 0.90, 0.80, 0.80, 0.85, 0.90, 1.00, 1.10],
  },
  {
    key: "pepper",
    label: "Pepper (Scotch Bonnet)",
    unit: "per cup",
    minGHS: 3,
    maxGHS: 20,
    // Very volatile — follows tomato curve closely
    seasonalIndex: [1.50, 1.40, 1.20, 0.95, 0.80, 0.65, 0.55, 0.55, 0.65, 0.85, 1.05, 1.35],
  },
  {
    key: "plantain",
    label: "Plantain",
    unit: "per finger",
    minGHS: 1,
    maxGHS: 5,
    // Cheap in mid-rainy season (Jul–Sep), expensive in Jan–Mar
    seasonalIndex: [1.35, 1.40, 1.30, 1.10, 0.95, 0.80, 0.65, 0.65, 0.70, 0.90, 1.05, 1.25],
  },
  {
    key: "yam",
    label: "Yam",
    unit: "per kg",
    minGHS: 6,
    maxGHS: 25,
    // Cheapest Aug–Nov after Volta/Brong-Ahafo harvest; scarce Jan–Jun
    seasonalIndex: [1.40, 1.45, 1.35, 1.20, 1.10, 1.00, 0.80, 0.60, 0.60, 0.65, 0.75, 1.15],
  },
  {
    key: "rice",
    label: "Rice (local)",
    unit: "per kg",
    minGHS: 8,
    maxGHS: 14,
    // Relatively stable — mild upward pressure Dec–Mar
    seasonalIndex: [1.10, 1.10, 1.05, 1.00, 1.00, 0.98, 0.95, 0.95, 0.97, 1.00, 1.02, 1.08],
  },
  {
    key: "palm_oil",
    label: "Palm Oil",
    unit: "per 750 ml bottle",
    minGHS: 12,
    maxGHS: 28,
    // Higher Jan–Apr; drops Jun–Sep with palm fruit season
    seasonalIndex: [1.30, 1.25, 1.20, 1.15, 1.05, 0.85, 0.75, 0.75, 0.80, 0.90, 1.00, 1.20],
  },
  {
    key: "smoked_fish",
    label: "Smoked Fish (herrings)",
    unit: "per piece",
    minGHS: 5,
    maxGHS: 20,
    // Slightly more expensive during Lent (Mar) and Harmattan
    seasonalIndex: [1.15, 1.10, 1.25, 1.05, 1.00, 0.90, 0.85, 0.85, 0.90, 0.95, 1.00, 1.10],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Population standard deviation of an array. Returns 0 for length < 2. */
function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// ---------------------------------------------------------------------------
// Core algorithm
// ---------------------------------------------------------------------------

/**
 * Predict the current price of a market item using EWMA.
 *
 * @param itemKey   Key from MARKET_CATALOGUE (e.g. "tomatoes")
 * @param history   Weekly observations, most-recent-first. Must be ≥ 1.
 * @param targetDate  The date for which to predict (for seasonal adjustment).
 * @param config    Optional override of EWMA parameters.
 */
export function predictPrice(
  itemKey: string,
  history: PriceObservation[],
  targetDate: Date = new Date(),
  config: MarketPriceConfig = DEFAULT_MARKET_CONFIG,
): PricePrediction {
  const item = MARKET_CATALOGUE.find((m) => m.key === itemKey);
  if (!item) throw new Error(`Unknown market item: ${itemKey}`);
  if (history.length === 0) throw new Error("predictPrice requires at least one observation");

  const { decayLambda, windowWeeks, trendWeeks, ciZScore } = config;

  // Sort descending (most-recent first), take the window
  const sorted = [...history].sort(
    (a, b) => new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime(),
  );
  const window = sorted.slice(0, windowWeeks);

  // --- EWMA ---
  const weights = window.map((_, i) => Math.exp(-decayLambda * i));
  const weightSum = weights.reduce((s, w) => s + w, 0);
  const rawPredicted =
    window.reduce((s, obs, i) => s + weights[i] * obs.priceGHS, 0) / weightSum;

  // --- Seasonal adjustment ---
  const month = targetDate.getMonth(); // 0-indexed
  const seasonalMultiplier = item.seasonalIndex[month];
  // The EWMA already contains seasonal signal; apply a mild correction
  // (half the deviation from neutral) to avoid double-counting
  const correction = 1 + (seasonalMultiplier - 1) * 0.5;
  const predicted = clamp(rawPredicted * correction, item.minGHS * 0.8, item.maxGHS * 1.2);

  // --- Confidence interval from rolling residuals ---
  // Compute 1-step-ahead errors for the window (using EWMA on sub-windows)
  const errors: number[] = [];
  for (let t = 1; t < Math.min(window.length, 8); t++) {
    const subWindow = window.slice(t); // older observations
    if (subWindow.length === 0) break;
    const subWeights = subWindow.map((_, i) => Math.exp(-decayLambda * i));
    const subSum = subWeights.reduce((s, w) => s + w, 0);
    const subPredicted =
      subWindow.reduce((s, obs, i) => s + subWeights[i] * obs.priceGHS, 0) / subSum;
    errors.push(Math.abs(window[t - 1].priceGHS - subPredicted));
  }
  const sd = stdDev(errors.length > 0 ? errors : [rawPredicted * 0.15]);
  const margin = ciZScore * sd;

  // --- Trend (last trendWeeks vs previous trendWeeks) ---
  const recentSlice = window.slice(0, trendWeeks).map((o) => o.priceGHS);
  const olderSlice = window.slice(trendWeeks, trendWeeks * 2).map((o) => o.priceGHS);
  let trend: "rising" | "stable" | "falling" = "stable";
  if (recentSlice.length > 0 && olderSlice.length > 0) {
    const recentMean = recentSlice.reduce((s, v) => s + v, 0) / recentSlice.length;
    const olderMean = olderSlice.reduce((s, v) => s + v, 0) / olderSlice.length;
    const pctChange = (recentMean - olderMean) / olderMean;
    if (pctChange > 0.05) trend = "rising";
    else if (pctChange < -0.05) trend = "falling";
  }

  return {
    item: item.label,
    predicted: Math.round(predicted * 100) / 100,
    lower: Math.max(item.minGHS * 0.5, Math.round((predicted - margin) * 100) / 100),
    upper: Math.min(item.maxGHS * 1.3, Math.round((predicted + margin) * 100) / 100),
    trend,
    seasonalMultiplier,
    observationsUsed: window.length,
  };
}

/**
 * Estimate the total cost of a shopping basket.
 * Returns individual predictions and a grand total range.
 */
export function predictBasketCost(
  basket: { itemKey: string; quantity: number }[],
  history: Record<string, PriceObservation[]>,
  targetDate: Date = new Date(),
  config: MarketPriceConfig = DEFAULT_MARKET_CONFIG,
): {
  items: Array<PricePrediction & { quantity: number; totalMin: number; totalMax: number }>;
  grandTotal: { lower: number; upper: number; midpoint: number };
} {
  const items = basket.map(({ itemKey, quantity }) => {
    const h = history[itemKey] ?? [];
    if (h.length === 0) {
      const cat = MARKET_CATALOGUE.find((m) => m.key === itemKey);
      if (!cat) throw new Error(`Unknown item: ${itemKey}`);
      // Fallback: midpoint of catalogue range when no history
      const mid = (cat.minGHS + cat.maxGHS) / 2;
      return {
        item: cat.label,
        predicted: mid,
        lower: cat.minGHS,
        upper: cat.maxGHS,
        trend: "stable" as const,
        seasonalMultiplier: cat.seasonalIndex[targetDate.getMonth()],
        observationsUsed: 0,
        quantity,
        totalMin: cat.minGHS * quantity,
        totalMax: cat.maxGHS * quantity,
      };
    }
    const pred = predictPrice(itemKey, h, targetDate, config);
    return { ...pred, quantity, totalMin: pred.lower * quantity, totalMax: pred.upper * quantity };
  });

  const grandTotal = {
    lower: Math.round(items.reduce((s, i) => s + i.totalMin, 0) * 100) / 100,
    upper: Math.round(items.reduce((s, i) => s + i.totalMax, 0) * 100) / 100,
    midpoint:
      Math.round(items.reduce((s, i) => s + i.predicted * i.quantity, 0) * 100) / 100,
  };

  return { items, grandTotal };
}
