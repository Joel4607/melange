// ============================================================================
// Fixed-window rate limiting (Redis).
//
// One INCR + EXPIRE per hit: the counter key embeds the current window index,
// so it resets automatically each window. Fails open — if Redis is missing or
// unreachable the request proceeds (rate limiting is protection, not a
// dependency).
// ============================================================================

import { redisConfigured, redisPipeline } from "./redis";

export class RateLimitError extends Error {
  constructor() {
    super("You're doing that too often — please wait a moment and try again.");
    this.name = "RateLimitError";
  }
}

/**
 * Count a hit against `name:id` and report whether it stayed within `limit`
 * hits per `windowSeconds`. Fails open when Redis is unavailable.
 */
export async function withinRateLimit(
  name: string,
  id: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  if (!redisConfigured()) return true;
  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  const key = `rl:${name}:${id}:${window}`;
  try {
    const [count] = await redisPipeline([
      ["INCR", key],
      ["EXPIRE", key, windowSeconds],
    ]);
    return Number(count) <= limit;
  } catch {
    return true;
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
