// ============================================================================
// Minimal Upstash Redis REST client (server-only).
//
// Upstash exposes Redis over plain HTTPS, which fits Vercel's serverless model
// (no persistent connections). A raw `fetch` keeps us dependency-free: each
// command is a JSON array POSTed to the REST endpoint.
//
// Redis is an optimisation layer here, never a source of truth — callers must
// degrade gracefully when it is unconfigured or unreachable.
// ============================================================================

function config(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

export function redisConfigured(): boolean {
  return config() !== null;
}

type RedisReply = { result?: unknown; error?: string };

/** Run a single Redis command, e.g. `redis(["INCR", "counter"])`. */
export async function redis(command: (string | number)[]): Promise<unknown> {
  const conf = config();
  if (!conf) throw new Error("redis: not configured");
  const { url, token } = conf;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(command.map(String)),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`redis: HTTP ${res.status}`);
  const data = (await res.json()) as RedisReply;
  if (data.error) throw new Error(`redis: ${data.error}`);
  return data.result ?? null;
}

/** Run several commands in one round trip; returns one result per command. */
export async function redisPipeline(
  commands: (string | number)[][],
): Promise<unknown[]> {
  const conf = config();
  if (!conf) throw new Error("redis: not configured");
  const { url, token } = conf;
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(commands.map((c) => c.map(String))),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`redis: HTTP ${res.status}`);
  const data = (await res.json()) as RedisReply[];
  return data.map((reply) => {
    if (reply.error) throw new Error(`redis: ${reply.error}`);
    return reply.result ?? null;
  });
}
