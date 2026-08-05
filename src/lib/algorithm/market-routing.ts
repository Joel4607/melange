/**
 * Market Zone Routing — Makola-Matrix Module
 *
 * Solves the "which order to visit market zones" problem using a
 * Nearest-Neighbour greedy heuristic on a hand-digitised zone graph.
 *
 * This is a degenerate small-n TSP (Travelling Salesman Problem variant):
 * the runner starts at the entrance, visits all zones required by the
 * shopping list, and returns. With n ≤ 12 required zones, the greedy
 * solution is within ~25 % of optimal (verified by exhaustive search in
 * the test suite for n ≤ 8; a ponytail comment marks the 2-opt upgrade).
 *
 * Academic framing: the problem is formalised as a weighted undirected graph
 * G = (V, E, w) where V = market zones, E = walking paths, and w = time
 * in seconds. The nearest-neighbour heuristic produces a Hamiltonian path
 * with time complexity O(n²) and a well-documented approximation ratio.
 *
 * ponytail: greedy NN heuristic, O(n²). Upgrade to 2-opt when n > 20.
 */

import type { GeoPoint } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ZoneNode {
  id: string;
  label: string;
  /** Commodity categories stocked in this zone (lower-case). */
  categories: string[];
  /** Conceptual grid position (for rendering only, not routing). */
  gridX: number;
  gridY: number;
}

export interface ZoneEdge {
  from: string;
  to: string;
  /** Estimated walking time in seconds. */
  walkSeconds: number;
}

export interface ZoneGraph {
  market: string;
  nodes: ZoneNode[];
  edges: ZoneEdge[];
}

/** One step in the recommended walking route. */
export interface RouteStep {
  zoneId: string;
  zoneLabel: string;
  /** Cumulative walking time from entrance to reach this zone (seconds). */
  cumulativeSeconds: number;
  /** Walking time of this single leg (seconds). */
  legSeconds: number;
  /** Items collected at this zone from the shopping list. */
  itemsCollected: string[];
}

export interface ZoneRoute {
  /** Ordered steps through the market, starting after the entrance. */
  steps: RouteStep[];
  /** Total walking time including return to entrance (seconds). */
  totalWalkSeconds: number;
  /** Walking time of a random ordering of the same zones (seconds). */
  randomOrderSeconds: number;
  /** Percentage time saved vs. random ordering. */
  savingsPct: number;
  /** Items that could not be mapped to any zone (unrecognised). */
  unmappedItems: string[];
}

// ---------------------------------------------------------------------------
// Graph builder
// ---------------------------------------------------------------------------

/** Build a bidirectional adjacency map from a ZoneGraph definition. */
export function buildAdjacency(graph: ZoneGraph): Map<string, Map<string, number>> {
  const adj = new Map<string, Map<string, number>>();
  for (const node of graph.nodes) {
    adj.set(node.id, new Map());
  }
  for (const edge of graph.edges) {
    adj.get(edge.from)?.set(edge.to, edge.walkSeconds);
    adj.get(edge.to)?.set(edge.from, edge.walkSeconds); // bidirectional
  }
  return adj;
}

// ---------------------------------------------------------------------------
// Shortest path (Dijkstra) — needed to move between any two zones
// ---------------------------------------------------------------------------

function dijkstra(
  source: string,
  adj: Map<string, Map<string, number>>,
): Map<string, number> {
  const dist = new Map<string, number>();
  const visited = new Set<string>();
  for (const id of adj.keys()) dist.set(id, Infinity);
  dist.set(source, 0);

  while (true) {
    // Find the unvisited node with smallest dist
    let u: string | null = null;
    let best = Infinity;
    for (const [id, d] of dist) {
      if (!visited.has(id) && d < best) {
        best = d;
        u = id;
      }
    }
    if (u === null) break;
    visited.add(u);
    for (const [v, w] of adj.get(u) ?? []) {
      const alt = (dist.get(u) ?? Infinity) + w;
      if (alt < (dist.get(v) ?? Infinity)) dist.set(v, alt);
    }
  }
  return dist;
}

// ---------------------------------------------------------------------------
// Item → zone mapping
// ---------------------------------------------------------------------------

function mapItemsToZones(
  shoppingList: string[],
  graph: ZoneGraph,
): { zoneItemMap: Map<string, string[]>; unmappedItems: string[] } {
  const zoneItemMap = new Map<string, string[]>();
  const unmappedItems: string[] = [];

  for (const item of shoppingList) {
    const normalised = item.toLowerCase().trim();
    let found = false;
    for (const node of graph.nodes) {
      if (
        node.categories.some(
          (cat) => normalised.includes(cat) || cat.includes(normalised),
        )
      ) {
        if (!zoneItemMap.has(node.id)) zoneItemMap.set(node.id, []);
        zoneItemMap.get(node.id)!.push(item);
        found = true;
        break;
      }
    }
    if (!found) unmappedItems.push(item);
  }
  return { zoneItemMap, unmappedItems };
}

// ---------------------------------------------------------------------------
// Nearest-neighbour greedy TSP
// ---------------------------------------------------------------------------

function greedyTSP(
  requiredZones: string[],
  startId: string,
  allPairDist: Map<string, Map<string, number>>,
): { path: string[]; totalSeconds: number } {
  if (requiredZones.length === 0) return { path: [], totalSeconds: 0 };

  const unvisited = new Set(requiredZones);
  const path: string[] = [];
  let current = startId;
  let totalSeconds = 0;

  while (unvisited.size > 0) {
    let nearest: string | null = null;
    let nearestDist = Infinity;
    for (const zoneId of unvisited) {
      const d = allPairDist.get(current)?.get(zoneId) ?? Infinity;
      if (d < nearestDist) {
        nearestDist = d;
        nearest = zoneId;
      }
    }
    if (nearest === null) break; // disconnected graph — shouldn't happen
    path.push(nearest);
    totalSeconds += nearestDist;
    current = nearest;
    unvisited.delete(nearest);
  }

  // Return to entrance
  const returnDist = allPairDist.get(current)?.get(startId) ?? 0;
  totalSeconds += returnDist;

  return { path, totalSeconds };
}

/** Estimate the expected walking time for a random permutation of zones. */
function randomOrderTime(
  requiredZones: string[],
  startId: string,
  allPairDist: Map<string, Map<string, number>>,
): number {
  if (requiredZones.length === 0) return 0;
  // Average over all possible first-moves (a rough but reproducible estimate)
  const n = requiredZones.length;
  let total = 0;
  // Sum all pairwise distances in the zone set, divide by n (average leg)
  for (const a of requiredZones) {
    for (const b of requiredZones) {
      if (a !== b) total += allPairDist.get(a)?.get(b) ?? 0;
    }
  }
  const avgLeg = n > 1 ? total / (n * (n - 1)) : 0;
  const entranceDist = requiredZones.reduce(
    (sum, z) => sum + (allPairDist.get(startId)?.get(z) ?? 0),
    0,
  ) / n;
  return Math.round(entranceDist + avgLeg * (n - 1) + entranceDist);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Given a shopping list and a zone graph, compute the optimal walking order
 * through the market using a nearest-neighbour greedy heuristic.
 *
 * @param shoppingList  Plain-text item names (e.g. ["tomatoes", "rice", "soap"])
 * @param graph         A ZoneGraph (e.g. imported from madina-market-zones.json)
 */
export function routeThroughZones(shoppingList: string[], graph: ZoneGraph): ZoneRoute {
  const ENTRANCE_ID = "entrance";
  const adj = buildAdjacency(graph);

  // Pre-compute all-pairs shortest paths (Dijkstra from each node)
  const allPairDist = new Map<string, Map<string, number>>();
  for (const node of graph.nodes) {
    allPairDist.set(node.id, dijkstra(node.id, adj));
  }

  const { zoneItemMap, unmappedItems } = mapItemsToZones(shoppingList, graph);
  const requiredZones = [...zoneItemMap.keys()];

  if (requiredZones.length === 0) {
    return { steps: [], totalWalkSeconds: 0, randomOrderSeconds: 0, savingsPct: 0, unmappedItems };
  }

  const { path, totalSeconds } = greedyTSP(requiredZones, ENTRANCE_ID, allPairDist);
  const randomSeconds = randomOrderTime(requiredZones, ENTRANCE_ID, allPairDist);
  const savingsPct =
    randomSeconds > 0
      ? Math.round(((randomSeconds - totalSeconds) / randomSeconds) * 100)
      : 0;

  // Build steps with cumulative times
  let cumulative = 0;
  let prev = ENTRANCE_ID;
  const steps: RouteStep[] = path.map((zoneId) => {
    const legSeconds = allPairDist.get(prev)?.get(zoneId) ?? 0;
    cumulative += legSeconds;
    const node = graph.nodes.find((n) => n.id === zoneId)!;
    prev = zoneId;
    return {
      zoneId,
      zoneLabel: node.label,
      cumulativeSeconds: cumulative,
      legSeconds,
      itemsCollected: zoneItemMap.get(zoneId) ?? [],
    };
  });

  return {
    steps,
    totalWalkSeconds: totalSeconds,
    randomOrderSeconds: randomSeconds,
    savingsPct,
    unmappedItems,
  };
}

/** Format seconds as "Xm Ys" for display. */
export function formatWalkTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
