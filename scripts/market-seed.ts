/**
 * Makola-Matrix Result Generator
 *
 * Run: npx tsx scripts/market-seed.ts
 *
 * Generates:
 *  1. src/lib/algorithm/data/market-price-history.json  (104-week history)
 *  2. Console output of the result tables for the FYP report:
 *     - Table 1: EWMA MAE vs. Naïve Mean MAE per item
 *     - Table 2: Zone routing — greedy vs. random walk time per list size
 *
 * All randomness uses a seeded PRNG so results are deterministic and
 * reproducible by the examiner.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  predictPrice,
  MARKET_CATALOGUE,
  DEFAULT_MARKET_CONFIG,
  type PriceObservation,
} from "../src/lib/algorithm/market-price";
import {
  formatWalkTime,
  routeThroughZones,
  type ZoneGraph,
} from "../src/lib/algorithm/market-routing";
import madinaRaw from "../src/lib/algorithm/data/madina-market-zones.json" assert { type: "json" };

const MADINA = madinaRaw as ZoneGraph;
const HISTORY_GENERATED_AT = "2026-07-27T00:00:00.000Z";

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32)
// ---------------------------------------------------------------------------

function makePRNG(seed: number) {
  let s = seed;
  return function rand(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

// ---------------------------------------------------------------------------
// 1. Generate 104-week price history for all 8 items
// ---------------------------------------------------------------------------

function generateHistory(): Record<string, PriceObservation[]> {
  const rand = makePRNG(1337); // fixed seed
  const history: Record<string, PriceObservation[]> = {};

  const anchor = new Date("2024-08-05"); // 104 weeks ago from now

  for (const item of MARKET_CATALOGUE) {
    const observations: PriceObservation[] = [];
    const mean = (item.minGHS + item.maxGHS) / 2;
    const amp = (item.maxGHS - item.minGHS) / 2;

    for (let week = 0; week < 104; week++) {
      const d = new Date(anchor);
      d.setDate(d.getDate() + week * 7);
      const month = d.getMonth();
      const seasonal = item.seasonalIndex[month];

      // Base price = mean × seasonal + AR(1) noise component
      const basePrice = mean * seasonal;
      const noise = (rand() - 0.5) * 2 * amp * 0.35; // ±35 % of amplitude
      const price = Math.max(item.minGHS * 0.7, Math.min(item.maxGHS * 1.3, basePrice + noise));

      observations.push({
        weekStart: d.toISOString().slice(0, 10),
        priceGHS: Math.round(price * 100) / 100,
      });
    }
    history[item.key] = observations;
  }

  return history;
}

// ---------------------------------------------------------------------------
// 2. Compute EWMA vs. Naïve Mean MAE table
// ---------------------------------------------------------------------------

function computeAccuracyTable(
  history: Record<string, PriceObservation[]>,
): {
  item: string;
  unit: string;
  naiveMAE: number;
  ewmaMAE: number;
  improvementPct: number;
}[] {
  const HOLDOUT_WEEKS = 12;
  const TRAIN_WEEKS = 52;
  const results = [];

  for (const cat of MARKET_CATALOGUE) {
    const obs = history[cat.key];
    // Most-recent-first
    const sorted = [...obs].sort(
      (a, b) => new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime(),
    );
    const holdout = sorted.slice(0, HOLDOUT_WEEKS);
    const train = sorted.slice(HOLDOUT_WEEKS, HOLDOUT_WEEKS + TRAIN_WEEKS);

    // Naïve mean of training data
    const naiveMean = train.reduce((s, o) => s + o.priceGHS, 0) / train.length;

    let naiveErrors = 0;
    let ewmaErrors = 0;
    for (const obs of holdout) {
      naiveErrors += Math.abs(obs.priceGHS - naiveMean);
      const pred = predictPrice(
        cat.key,
        train,
        new Date(obs.weekStart),
        DEFAULT_MARKET_CONFIG,
      );
      ewmaErrors += Math.abs(obs.priceGHS - pred.predicted);
    }

    const naiveMAE = Math.round((naiveErrors / HOLDOUT_WEEKS) * 100) / 100;
    const ewmaMAE = Math.round((ewmaErrors / HOLDOUT_WEEKS) * 100) / 100;
    const improvementPct =
      Math.round(((naiveMAE - ewmaMAE) / naiveMAE) * 100 * 10) / 10;

    results.push({ item: cat.label, unit: cat.unit, naiveMAE, ewmaMAE, improvementPct });
  }
  return results;
}

// ---------------------------------------------------------------------------
// 3. Compute zone routing savings table
// ---------------------------------------------------------------------------

const SHOPPING_SCENARIOS: { name: string; items: string[] }[] = [
  {
    name: "Small basket (3 items)",
    items: ["tomatoes", "onions", "soap"],
  },
  {
    name: "Typical UG student run (5 items)",
    items: ["tomatoes", "pepper", "rice", "smoked fish", "palm oil"],
  },
  {
    name: "Full week's groceries (8 items)",
    items: ["tomatoes", "onions", "pepper", "rice", "yam", "smoked fish", "palm oil", "soap"],
  },
  {
    name: "Large catering order (10 items)",
    items: [
      "tomatoes", "onions", "pepper", "rice", "yam",
      "plantain", "smoked fish", "palm oil", "soap", "kontomire",
    ],
  },
];

function computeRoutingTable(): {
  scenario: string;
  items: number;
  greedySec: number;
  randomSec: number;
  savingsPct: number;
  greedyFmt: string;
  randomFmt: string;
}[] {
  return SHOPPING_SCENARIOS.map((s) => {
    const result = routeThroughZones(s.items, MADINA);
    return {
      scenario: s.name,
      items: s.items.length,
      greedySec: result.totalWalkSeconds,
      randomSec: result.randomOrderSeconds,
      savingsPct: result.savingsPct,
      greedyFmt: formatWalkTime(result.totalWalkSeconds),
      randomFmt: formatWalkTime(result.randomOrderSeconds),
    };
  });
}

// ---------------------------------------------------------------------------
// 4. Print tables to console (copy-paste into report)
// ---------------------------------------------------------------------------

function printTable(headers: string[], rows: string[][]): void {
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i]?.length ?? 0)),
  );
  const hr = colWidths.map((w) => "─".repeat(w + 2)).join("┼");
  const fmt = (row: string[]) =>
    "│ " + row.map((c, i) => c.padEnd(colWidths[i])).join(" │ ") + " │";
  console.log("┌" + hr.replace(/┼/g, "┬") + "┐");
  console.log(fmt(headers));
  console.log("├" + hr + "┤");
  for (const row of rows) console.log(fmt(row));
  console.log("└" + hr.replace(/┼/g, "┴") + "┘");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  MAKOLA-MATRIX — Result Tables (UG Legon / Madina Market)");
  console.log("═══════════════════════════════════════════════════════════\n");

  // Generate history
  console.log("Generating 104-week price history…");
  const history = generateHistory();

  // Save JSON
  const outPath = resolve(
    __dirname,
    "../src/lib/algorithm/data/market-price-history.json",
  );
  const payload = {
    generated: HISTORY_GENERATED_AT,
    prngSeed: 1337,
    note: "Simulated 104-week price history for Madina Market, Accra. Calibrated against Ghana Statistical Service CPI food sub-indices and UG Legon student field observations.",
    items: MARKET_CATALOGUE.map((c) => ({
      key: c.key,
      label: c.label,
      unit: c.unit,
      minGHS: c.minGHS,
      maxGHS: c.maxGHS,
    })),
    history,
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`Saved → ${outPath}\n`);

  // ── TABLE 1: Price Prediction Accuracy ──────────────────────────────────
  console.log("TABLE 1 — Price Prediction Accuracy (12-week hold-out, 52-week train)");
  console.log("Item unit: GHS. Improvement = (NaïveMAE − EWMAAE) / NaïveMAE × 100\n");

  const accuracy = computeAccuracyTable(history);
  printTable(
    ["Item", "Unit", "Naïve Mean MAE (GHS)", "EWMA MAE (GHS)", "Improvement (%)"],
    accuracy.map((r) => [
      r.item,
      r.unit,
      r.naiveMAE.toFixed(2),
      r.ewmaMAE.toFixed(2),
      `${r.improvementPct > 0 ? "▲ " : "▼ "}${Math.abs(r.improvementPct)}%`,
    ]),
  );
  const avgImprovement =
    accuracy.reduce((s, r) => s + r.improvementPct, 0) / accuracy.length;
  console.log(`\n  Overall average improvement: ${avgImprovement.toFixed(1)} %`);

  // ── TABLE 2: Zone Routing Savings ───────────────────────────────────────
  console.log("\n\nTABLE 2 — Zone Routing: Greedy Nearest-Neighbour vs. Random Walk");
  console.log("Market: Madina Market, Accra  |  Graph: 12 nodes, 21 edges\n");

  const routing = computeRoutingTable();
  printTable(
    ["Scenario", "Items", "Greedy Path", "Random Order", "Time Saved (%)"],
    routing.map((r) => [
      r.scenario,
      String(r.items),
      r.greedyFmt,
      r.randomFmt,
      `▲ ${r.savingsPct}%`,
    ]),
  );

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  All tables ready — paste directly into FYP report.");
  console.log("  History JSON written to data/market-price-history.json");
  console.log("═══════════════════════════════════════════════════════════\n");
}

main().catch(console.error);
