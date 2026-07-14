// The Redis layer is an optimisation, never a dependency: when Upstash is not
// configured (as in this test env), every helper must degrade gracefully.

import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

import { redisConfigured } from "../redis";
import {
  clearRunnerPresence,
  liveRunnerLocations,
  publishRunnerLocation,
} from "../presence";
import { enforceRateLimit, withinRateLimit } from "../rate-limit";

describe("without Redis configured", () => {
  it("reports unconfigured", () => {
    expect(redisConfigured()).toBe(false);
  });

  it("location pings fall back to a Postgres write", async () => {
    await expect(publishRunnerLocation("r1", 5.6, -0.18)).resolves.toEqual({
      live: false,
      syncToDb: true,
    });
  });

  it("live location lookups return no entries", async () => {
    const live = await liveRunnerLocations(["r1", "r2"]);
    expect(live.size).toBe(0);
  });

  it("clearing presence is a no-op", async () => {
    await expect(clearRunnerPresence("r1")).resolves.toBeUndefined();
  });

  it("rate limits fail open", async () => {
    await expect(withinRateLimit("post-errand", "u1", 1, 60)).resolves.toBe(true);
    await expect(withinRateLimit("post-errand", "u1", 1, 60)).resolves.toBe(true);
    await expect(enforceRateLimit("post-errand", "u1", 1, 60)).resolves.toBeUndefined();
  });
});
