"use client";

import { useState, useTransition } from "react";
import {
  ShoppingBasket,
  TrendingUp,
  TrendingDown,
  Minus,
  MapPin,
  Clock,
  Plus,
  X,
  Zap,
  ChevronRight,
  BarChart3,
  Route,
  Info,
} from "lucide-react";
import { MARKET_CATALOGUE } from "@/lib/algorithm/market-price";

// ---------------------------------------------------------------------------
// Types (mirrors API responses)
// ---------------------------------------------------------------------------

interface PricePrediction {
  item: string;
  predicted: number;
  lower: number;
  upper: number;
  trend: "rising" | "stable" | "falling";
  seasonalMultiplier: number;
  observationsUsed: number;
  currency: string;
  market: string;
}

interface RouteStep {
  zoneId: string;
  zoneLabel: string;
  cumulativeSeconds: number;
  legSeconds: number;
  itemsCollected: string[];
}

interface ZoneRouteResult {
  steps: RouteStep[];
  totalWalkSeconds: number;
  randomOrderSeconds: number;
  savingsPct: number;
  unmappedItems: string[];
  market: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function TrendBadge({ trend }: { trend: "rising" | "stable" | "falling" }) {
  if (trend === "rising")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
        <TrendingUp className="h-3 w-3" /> Rising
      </span>
    );
  if (trend === "falling")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
        <TrendingDown className="h-3 w-3" /> Falling
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
      <Minus className="h-3 w-3" /> Stable
    </span>
  );
}

// ---------------------------------------------------------------------------
// Price Oracle Panel
// ---------------------------------------------------------------------------

function PriceOracle() {
  const [selectedItem, setSelectedItem] = useState("tomatoes");
  const [result, setResult] = useState<PricePrediction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handlePredict() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(
        `/api/market/price?item=${encodeURIComponent(selectedItem)}&date=${new Date().toISOString().slice(0, 10)}`,
      );
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Prediction failed");
      else setResult(data as PricePrediction);
    });
  }

  return (
    <div className="rounded-2xl border border-cream-deep bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50">
          <BarChart3 className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <h2 className="font-semibold text-ink">Price Oracle</h2>
          <p className="text-xs text-muted">EWMA prediction · Madina Market, Accra</p>
        </div>
      </div>

      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="item-select">
          Select item
        </label>
        <select
          id="item-select"
          value={selectedItem}
          onChange={(e) => { setSelectedItem(e.target.value); setResult(null); }}
          className="w-full rounded-xl border border-cream-deep bg-cream px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-green/40"
        >
          {MARKET_CATALOGUE.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label} ({item.unit})
            </option>
          ))}
        </select>
      </div>

      <button
        id="predict-price-btn"
        onClick={handlePredict}
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-green px-4 py-2.5 text-sm font-medium text-cream transition hover:bg-green-deep disabled:opacity-50"
      >
        <Zap className="h-4 w-4" />
        {isPending ? "Predicting…" : "Predict today's price"}
      </button>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {result && (
        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-cream-deep bg-cream p-4">
            <div className="mb-1 flex items-start justify-between">
              <span className="text-sm text-muted">{result.item}</span>
              <TrendBadge trend={result.trend} />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-green-deep">
                GHS {result.predicted.toFixed(2)}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted">
              <Info className="h-3 w-3 shrink-0" />
              90% CI: GHS {result.lower.toFixed(2)} – GHS {result.upper.toFixed(2)}
            </div>

            {/* Confidence band visualisation */}
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-[10px] text-muted">
                <span>GHS {result.lower.toFixed(2)}</span>
                <span>GHS {result.upper.toFixed(2)}</span>
              </div>
              <div className="relative h-3 w-full rounded-full bg-cream-deep">
                <div
                  className="absolute h-3 rounded-full bg-amber-200"
                  style={{
                    left: "0%",
                    right: "0%",
                  }}
                />
                {/* Predicted marker */}
                <div
                  className="absolute top-0 h-3 w-1 rounded-full bg-amber-600"
                  style={{
                    left: `${Math.min(
                      95,
                      Math.max(
                        5,
                        ((result.predicted - result.lower) /
                          (result.upper - result.lower)) *
                          100,
                      ),
                    )}%`,
                    transform: "translateX(-50%)",
                  }}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg bg-cream p-3">
              <p className="text-muted">Seasonal factor</p>
              <p className="mt-0.5 font-semibold text-ink">
                {result.seasonalMultiplier.toFixed(2)}×
              </p>
            </div>
            <div className="rounded-lg bg-cream p-3">
              <p className="text-muted">History used</p>
              <p className="mt-0.5 font-semibold text-ink">
                {result.observationsUsed} weeks
              </p>
            </div>
          </div>

          <p className="text-[11px] text-muted">
            Algorithm: Exponentially-Weighted Moving Average (λ = 0.3, 12-week window)
            with Ghana seasonal adjustment. Market: {result.market}.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zone Planner Panel
// ---------------------------------------------------------------------------

function ZonePlanner() {
  const [inputValue, setInputValue] = useState("");
  const [items, setItems] = useState<string[]>(["tomatoes", "rice", "soap"]);
  const [result, setResult] = useState<ZoneRouteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function addItem() {
    const trimmed = inputValue.trim();
    if (!trimmed || items.includes(trimmed.toLowerCase())) return;
    setItems((prev) => [...prev, trimmed.toLowerCase()]);
    setInputValue("");
    setResult(null);
  }

  function removeItem(item: string) {
    setItems((prev) => prev.filter((i) => i !== item));
    setResult(null);
  }

  function handleRoute() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/market/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Routing failed");
      else setResult(data as ZoneRouteResult);
    });
  }

  return (
    <div className="rounded-2xl border border-cream-deep bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-green/10">
          <Route className="h-5 w-5 text-green-deep" />
        </div>
        <div>
          <h2 className="font-semibold text-ink">Zone Planner</h2>
          <p className="text-xs text-muted">Greedy TSP · Nearest-neighbour heuristic</p>
        </div>
      </div>

      {/* Shopping list builder */}
      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-medium text-ink">Shopping list</label>
        <div className="mb-2 flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1.5 rounded-full border border-cream-deep bg-cream px-3 py-1 text-xs font-medium text-ink capitalize"
            >
              {item}
              <button
                type="button"
                onClick={() => removeItem(item)}
                aria-label={`Remove ${item}`}
                className="text-muted hover:text-red-500 transition"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            id="item-input"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
            placeholder="Add item (e.g. kontomire)"
            className="min-w-0 flex-1 rounded-xl border border-cream-deep bg-cream px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-green/40"
          />
          <button
            type="button"
            onClick={addItem}
            disabled={!inputValue.trim()}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cream-deep bg-cream text-green-deep transition hover:bg-green hover:text-cream disabled:opacity-40"
            aria-label="Add item"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <button
        id="plan-route-btn"
        onClick={handleRoute}
        disabled={isPending || items.length === 0}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-green px-4 py-2.5 text-sm font-medium text-cream transition hover:bg-green-deep disabled:opacity-50"
      >
        <MapPin className="h-4 w-4" />
        {isPending ? "Routing…" : "Plan my route"}
      </button>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {result && (
        <div className="mt-5 space-y-4">
          {/* Summary bar */}
          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            <div className="rounded-xl border border-cream-deep bg-cream p-3">
              <p className="text-muted">Greedy path</p>
              <p className="mt-0.5 text-base font-bold text-green-deep">
                {fmtTime(result.totalWalkSeconds)}
              </p>
            </div>
            <div className="rounded-xl border border-cream-deep bg-cream p-3">
              <p className="text-muted">Random order</p>
              <p className="mt-0.5 text-base font-bold text-ink">
                {fmtTime(result.randomOrderSeconds)}
              </p>
            </div>
            <div className="rounded-xl border border-cream-deep bg-amber-50 p-3">
              <p className="text-amber-700">Time saved</p>
              <p className="mt-0.5 text-base font-bold text-amber-700">
                ▲ {result.savingsPct}%
              </p>
            </div>
          </div>

          {/* Step-by-step route */}
          <div>
            <p className="mb-2 text-xs font-medium text-muted uppercase tracking-wider">
              Recommended walking order
            </p>
            <ol className="space-y-2">
              {/* Entrance */}
              <li className="flex items-center gap-3 rounded-xl border border-cream-deep bg-cream px-4 py-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-green text-[11px] font-bold text-cream">
                  🚪
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">Main Entrance</p>
                  <p className="text-xs text-muted">Start here</p>
                </div>
              </li>

              {result.steps.map((step, idx) => (
                <li key={step.zoneId} className="flex items-start gap-3 rounded-xl border border-cream-deep bg-white px-4 py-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-green/10 text-xs font-bold text-green-deep">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{step.zoneLabel}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {step.itemsCollected.map((item) => (
                        <span
                          key={item}
                          className="rounded-full bg-green/10 px-2 py-0.5 text-[11px] font-medium text-green-deep capitalize"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-medium text-ink">+{fmtTime(step.legSeconds)}</p>
                    <p className="text-[11px] text-muted">{fmtTime(step.cumulativeSeconds)} in</p>
                  </div>
                </li>
              ))}

              {/* Return */}
              <li className="flex items-center gap-3 rounded-xl border border-dashed border-cream-deep bg-cream/50 px-4 py-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-cream-deep text-[11px] font-bold text-muted">
                  ↩
                </span>
                <p className="text-sm text-muted">Return to entrance</p>
                <div className="ml-auto flex items-center gap-1 text-xs font-medium text-green-deep">
                  <Clock className="h-3 w-3" />
                  {fmtTime(result.totalWalkSeconds)} total
                </div>
              </li>
            </ol>
          </div>

          {result.unmappedItems.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <strong>Not mapped to a zone:</strong>{" "}
              {result.unmappedItems.join(", ")} — ask a vendor inside.
            </div>
          )}

          <p className="text-[11px] text-muted">
            Algorithm: Nearest-Neighbour Greedy TSP on a 12-node zone graph
            (Madina Market, Accra). Walk times at 0.8 m/s. Start and end at the
            taxi drop-off / main entrance.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MakolaMatrixPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-cream-deep bg-white px-6 py-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-50">
            <ShoppingBasket className="h-6 w-6 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-green-deep">Makola-Matrix</h1>
            <p className="mt-1 text-sm text-muted">
              Market intelligence for Madina Market, Accra — the UG Legon student&apos;s
              nearest open-air market.
            </p>
            <div className="mt-3 flex flex-wrap gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-muted">
                <ChevronRight className="h-3 w-3 text-green" />
                Price Oracle: EWMA price prediction with 90% confidence interval
              </span>
              <span className="flex items-center gap-1.5 text-muted">
                <ChevronRight className="h-3 w-3 text-green" />
                Zone Planner: Greedy nearest-neighbour TSP over 12 market zones
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Two-column layout on wide screens */}
      <div className="grid gap-6 lg:grid-cols-2">
        <PriceOracle />
        <ZonePlanner />
      </div>

      {/* Academic context box */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50 px-6 py-5">
        <h3 className="mb-2 text-sm font-semibold text-blue-900">
          Academic Contribution
        </h3>
        <p className="text-xs leading-relaxed text-blue-800">
          Makola-Matrix applies <strong>Predictive Analytics</strong> (EWMA with
          Ghana seasonal adjustment) and <strong>micro-spatial routing</strong>{" "}
          (degenerate TSP) to informal, digitally-unrepresented African markets.
          The price model is validated against a simulated 104-week dataset
          calibrated from GSS CPI food sub-indices; the routing heuristic is
          compared against random-order baselines across four shopping-list sizes.
          Both result tables are reproducible via{" "}
          <code className="rounded bg-blue-100 px-1">npx tsx scripts/market-seed.ts</code>.
        </p>
      </div>
    </div>
  );
}
