import { NextResponse } from "next/server";
import { predictPrice, MARKET_CATALOGUE } from "@/lib/algorithm/market-price";
import type { PriceObservation } from "@/lib/algorithm/market-price";

// Load history once at module level (Next.js caches module imports)
// ponytail: no Redis, no DB — pure JSON file, sufficient for demo scale.
let historyCache: Record<string, PriceObservation[]> | null = null;

async function getHistory(): Promise<Record<string, PriceObservation[]>> {
  if (historyCache) return historyCache;
  try {
    // Dynamic import so the JSON is bundled and not a runtime FS read
    const data = await import("@/lib/algorithm/data/market-price-history.json");
    historyCache = (data as { history: Record<string, PriceObservation[]> }).history ?? {};
  } catch {
    historyCache = {};
  }
  return historyCache;
}

/**
 * GET /api/market/price?item=tomatoes&date=2026-08-05
 *
 * Returns an EWMA price prediction for one market item.
 * Falls back to catalogue midpoint when no history is loaded.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const itemKey = searchParams.get("item")?.toLowerCase().trim();
  const dateStr = searchParams.get("date");

  if (!itemKey) {
    return NextResponse.json({ error: "Missing ?item= parameter" }, { status: 400 });
  }

  const catalogueItem = MARKET_CATALOGUE.find((m) => m.key === itemKey);
  if (!catalogueItem) {
    return NextResponse.json(
      {
        error: `Unknown item "${itemKey}". Valid items: ${MARKET_CATALOGUE.map((m) => m.key).join(", ")}`,
      },
      { status: 404 },
    );
  }

  const targetDate = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(targetDate.getTime())) {
    return NextResponse.json({ error: "Invalid ?date= value" }, { status: 400 });
  }

  const history = await getHistory();
  const itemHistory = history[itemKey] ?? [];

  // Need at least 1 observation; fall back to a single midpoint observation
  const effectiveHistory =
    itemHistory.length > 0
      ? itemHistory
      : [
          {
            weekStart: new Date().toISOString().slice(0, 10),
            priceGHS: (catalogueItem.minGHS + catalogueItem.maxGHS) / 2,
          },
        ];

  const prediction = predictPrice(itemKey, effectiveHistory, targetDate);

  return NextResponse.json({
    ...prediction,
    currency: "GHS",
    market: "Madina Market, Accra",
    note: "Prediction uses Exponentially-Weighted Moving Average (EWMA) with Ghana seasonal adjustment.",
  });
}
