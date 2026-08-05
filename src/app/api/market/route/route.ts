import { NextResponse } from "next/server";
import { routeThroughZones } from "@/lib/algorithm/market-routing";
import type { ZoneGraph } from "@/lib/algorithm/market-routing";
import madinaRaw from "@/lib/algorithm/data/madina-market-zones.json";

const MADINA = madinaRaw as ZoneGraph;

/**
 * POST /api/market/route
 * Body: { items: string[] }
 *
 * Returns the optimal walking route through Madina Market zones for the
 * given shopping list, computed by a nearest-neighbour greedy TSP heuristic.
 */
export async function POST(req: Request) {
  let body: { items?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json(
      { error: "Body must contain a non-empty `items` array of strings" },
      { status: 400 },
    );
  }

  const items: string[] = body.items
    .filter((i): i is string => typeof i === "string" && i.trim().length > 0)
    .map((i) => i.trim());

  if (items.length === 0) {
    return NextResponse.json({ error: "All items were empty strings" }, { status: 400 });
  }

  const route = routeThroughZones(items, MADINA);

  return NextResponse.json({
    ...route,
    market: MADINA.market,
    algorithm: "Nearest-Neighbour Greedy TSP (O(n²), n = required zones)",
    note: "Path starts and ends at the main entrance. Walking times assume 0.8 m/s through a crowded market.",
  });
}
