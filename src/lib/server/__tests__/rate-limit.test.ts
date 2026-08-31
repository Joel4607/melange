import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServiceClient: vi.fn(),
  redisConfigured: vi.fn(),
  redisPipeline: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  getServiceClient: mocks.getServiceClient,
}));

vi.mock("../redis", () => ({
  redisConfigured: mocks.redisConfigured,
  redisPipeline: mocks.redisPipeline,
}));

import {
  enforceRateLimit,
  RateLimitError,
  withinRateLimit,
} from "../rate-limit";

function configureDatabaseFallback(data: boolean | null, error: object | null = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  mocks.getServiceClient.mockReturnValue({ rpc });
  return rpc;
}

describe("rate-limit backend fallback", () => {
  beforeEach(() => {
    mocks.getServiceClient.mockReset();
    mocks.redisConfigured.mockReset();
    mocks.redisPipeline.mockReset();
  });

  it("requires the durable database decision after Redis accepts a hit", async () => {
    mocks.redisConfigured.mockReturnValue(true);
    mocks.redisPipeline.mockResolvedValue([1, 1]);
    const rpc = configureDatabaseFallback(false);

    await expect(withinRateLimit("post-errand", "user-1", 5, 300)).resolves.toBe(false);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("lets Redis reject an over-limit hit without touching the database", async () => {
    mocks.redisConfigured.mockReturnValue(true);
    mocks.redisPipeline.mockResolvedValue([6, 1]);

    await expect(withinRateLimit("post-errand", "user-1", 5, 300)).resolves.toBe(false);
    expect(mocks.getServiceClient).not.toHaveBeenCalled();
  });

  it.each([
    { allowed: true, expected: true },
    { allowed: false, expected: false },
  ])("uses the durable database decision when Redis is not configured", async ({ allowed, expected }) => {
    mocks.redisConfigured.mockReturnValue(false);
    const rpc = configureDatabaseFallback(allowed);

    await expect(withinRateLimit("post-errand", "user-1", 5, 300)).resolves.toBe(expected);
    expect(rpc).toHaveBeenCalledWith("consume_rate_limit", {
      p_key: "rl:post-errand:user-1",
      p_limit: 5,
      p_window_seconds: 300,
    });
  });

  it("falls back to the database when Redis errors", async () => {
    mocks.redisConfigured.mockReturnValue(true);
    mocks.redisPipeline.mockRejectedValue(new Error("Redis unavailable"));
    configureDatabaseFallback(false);

    await expect(withinRateLimit("location-ping", "runner-1", 30, 60)).resolves.toBe(false);
  });

  it("keeps one durable budget across Redis failure and recovery", async () => {
    mocks.redisConfigured.mockReturnValue(true);
    mocks.redisPipeline
      .mockResolvedValueOnce([1, 1])
      .mockRejectedValueOnce(new Error("Redis unavailable"))
      .mockResolvedValueOnce([1, 1]);
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null });
    mocks.getServiceClient.mockReturnValue({ rpc });

    await expect(withinRateLimit("post-errand", "user-1", 2, 300)).resolves.toBe(true);
    await expect(withinRateLimit("post-errand", "user-1", 2, 300)).resolves.toBe(true);
    await expect(withinRateLimit("post-errand", "user-1", 2, 300)).resolves.toBe(false);
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it("fails closed when the durable fallback errors", async () => {
    mocks.redisConfigured.mockReturnValue(false);
    configureDatabaseFallback(null, { message: "database unavailable" });

    await expect(withinRateLimit("post-errand", "user-1", 5, 300)).resolves.toBe(false);
    await expect(enforceRateLimit("post-errand", "user-1", 5, 300)).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });

  it("fails closed when the durable fallback throws", async () => {
    mocks.redisConfigured.mockReturnValue(false);
    const rpc = vi.fn().mockRejectedValue(new Error("database unavailable"));
    mocks.getServiceClient.mockReturnValue({ rpc });

    await expect(withinRateLimit("post-errand", "user-1", 5, 300)).resolves.toBe(false);
  });
});
