import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  processDueShareWindows: vi.fn(),
}));

vi.mock("@/lib/server/errand-share", () => ({
  processDueShareWindows: mocks.processDueShareWindows,
}));

import { GET } from "../route";

describe("Errand-Share sweep route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ERRAND_SHARE_CRON_SECRET;
  });

  it("returns 503 when the scheduler secret is not configured", async () => {
    const response = await GET(new Request("http://localhost/internal"));
    expect(response.status).toBe(503);
    expect(mocks.processDueShareWindows).not.toHaveBeenCalled();
  });

  it("rejects missing, malformed and incorrect bearer credentials", async () => {
    process.env.ERRAND_SHARE_CRON_SECRET = "correct-secret";
    for (const authorization of [undefined, "Basic abc", "Bearer wrong-secret"]) {
      const headers = authorization ? { authorization } : undefined;
      const response = await GET(new Request("http://localhost/internal", { headers }));
      expect(response.status).toBe(401);
    }
    expect(mocks.processDueShareWindows).not.toHaveBeenCalled();
  });

  it("runs a bounded sweep after timing-safe authorization", async () => {
    process.env.ERRAND_SHARE_CRON_SECRET = "correct-secret";
    mocks.processDueShareWindows.mockResolvedValue({ claimed: 2, matched: 1, failed: 1 });

    const response = await GET(new Request("http://localhost/internal", {
      headers: { authorization: "Bearer correct-secret" },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ claimed: 2, matched: 1, failed: 1 });
    expect(mocks.processDueShareWindows).toHaveBeenCalledWith(25);
  });
});
