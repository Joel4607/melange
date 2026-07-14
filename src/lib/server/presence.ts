// ============================================================================
// Runner live-location presence (Redis).
//
// Available runners ping their GPS position every ~30s. Writing each ping to
// Postgres is wasteful — the positions are ephemeral and only the latest one
// matters. Instead the live position lives in a Redis geo set with a TTL
// heartbeat, and Postgres only gets a periodic durable sync.
//
//   runners:live          GEO set  runnerId -> (lng, lat)
//   runner:beat:{id}      heartbeat, expires after HEARTBEAT_TTL_S — a geo
//                         entry without a fresh heartbeat is considered stale
//   runner:dbsync:{id}    present while the Postgres copy is fresh enough;
//                         its expiry signals "sync the next ping to Postgres"
//
// Everything degrades gracefully: without Redis, callers fall back to writing
// and reading Postgres exactly as before.
// ============================================================================

import { redisConfigured, redisPipeline } from "./redis";

const GEO_KEY = "runners:live";
const HEARTBEAT_TTL_S = 120;
const DB_SYNC_INTERVAL_S = 300;

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Record a runner's live position. Returns whether the ping was absorbed by
 * Redis (`live`) and whether the caller should also persist it to Postgres
 * (`syncToDb` — always true when Redis is unavailable, otherwise only once
 * per DB_SYNC_INTERVAL_S so the durable copy never goes too stale).
 */
export async function publishRunnerLocation(
  runnerId: string,
  lat: number,
  lng: number,
): Promise<{ live: boolean; syncToDb: boolean }> {
  if (!redisConfigured()) return { live: false, syncToDb: true };
  try {
    const results = await redisPipeline([
      ["GEOADD", GEO_KEY, lng, lat, runnerId],
      ["SET", `runner:beat:${runnerId}`, Date.now(), "EX", HEARTBEAT_TTL_S],
      ["SET", `runner:dbsync:${runnerId}`, "1", "EX", DB_SYNC_INTERVAL_S, "NX"],
    ]);
    // SET ... NX returns OK only when the key was absent -> time to sync.
    return { live: true, syncToDb: results[2] === "OK" };
  } catch {
    return { live: false, syncToDb: true };
  }
}

/** Drop a runner's live presence (e.g. when they toggle unavailable). */
export async function clearRunnerPresence(runnerId: string): Promise<void> {
  if (!redisConfigured()) return;
  try {
    await redisPipeline([
      ["ZREM", GEO_KEY, runnerId],
      ["DEL", `runner:beat:${runnerId}`],
      ["DEL", `runner:dbsync:${runnerId}`],
    ]);
  } catch {
    /* best-effort */
  }
}

/**
 * Fetch fresh live positions for the given runners. Only entries with a live
 * heartbeat count; stale or missing runners are simply absent from the map.
 */
export async function liveRunnerLocations(
  runnerIds: string[],
): Promise<Map<string, LatLng>> {
  const live = new Map<string, LatLng>();
  if (!redisConfigured() || runnerIds.length === 0) return live;
  try {
    const [positions, beats] = (await redisPipeline([
      ["GEOPOS", GEO_KEY, ...runnerIds],
      ["MGET", ...runnerIds.map((id) => `runner:beat:${id}`)],
    ])) as [([string, string] | null)[], (string | null)[]];

    runnerIds.forEach((id, i) => {
      const pos = positions[i];
      if (!pos || beats[i] == null) return;
      live.set(id, { lng: Number(pos[0]), lat: Number(pos[1]) });
    });
  } catch {
    /* fall back to Postgres coords */
  }
  return live;
}
