// ============================================================================
// Fixed-window rate limiting (Redis prefilter + durable Postgres authority).
//
// Redis can reject an over-limit hit quickly, but every potentially allowed hit
// is also counted atomically in Postgres. Keeping one authoritative grant state
// prevents a Redis outage or recovery from opening a second independent quota.
// If Postgres cannot make the durable decision, the request is denied.
// ============================================================================

import { getServiceClient } from "@/lib/supabase/service";
import { redisConfigured, redisPipeline } from "./redis";

export class RateLimitError extends Error {
  constructor() {
    super("You're doing that too often — please wait a moment and try again.");
    this.name = "RateLimitError";
  }
}

/**
 * Count a hit against `name:id` and report whether it stayed within `limit`
 * hits per `windowSeconds`.
 */
export async function withinRateLimit(
  name: string,
  id: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  if (redisConfigured()) {
    const window = Math.floor(Date.now() / 1000 / windowSeconds);
    const key = `rl:${name}:${id}:${window}`;
    try {
      const [count] = await redisPipeline([
        ["INCR", key],
        ["EXPIRE", key, windowSeconds],
      ]);
      if (Number(count) > limit) {
        return false;
      }
    } catch {
      // Postgres remains authoritative when Redis is unavailable.
    }
  }

  try {
    const { data, error } = await getServiceClient().rpc("consume_rate_limit", {
      p_key: `rl:${name}:${id}`,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

/** Like `withinRateLimit`, but throws a user-facing `RateLimitError`. */
export async function enforceRateLimit(
  name: string,
  id: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  if (!(await withinRateLimit(name, id, limit, windowSeconds))) {
    throw new RateLimitError();
  }
}
