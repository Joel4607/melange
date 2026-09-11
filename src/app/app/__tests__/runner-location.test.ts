import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseRunnerLocation, runnerFilterParams } from "../runners/runner-location";
import { setRunnerSearchLocation } from "../runners/location-actions";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), setCookie: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.setCookie }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "buyer-a" } }, error: null });
});

describe("SEC-014 runner search location", () => {
  it("strips every GPS parameter from filter navigation while retaining other filters", () => {
    expect(runnerFilterParams("category=Delivery&lat=5.123456&lat=6.654321&lng=-0.123456&sort=distance&from=landing").toString())
      .toBe("category=Delivery&sort=distance&from=landing");
  });

  it("preserves precise coordinates only for the signed-in account that set them", () => {
    const raw = '{"userId":"buyer-a","lat":5.123456,"lng":-0.123456}';
    expect(parseRunnerLocation(raw, "buyer-a")).toEqual({ lat: 5.123456, lng: -0.123456 });
    expect(parseRunnerLocation(raw, "buyer-b")).toBeNull();
  });

  it.each([undefined, "not-json", "null", "{}", '{"userId":"buyer-a","lat":91,"lng":0}',
    '{"userId":"buyer-a","lat":0,"lng":-181}', '{"userId":"buyer-a","lat":"5","lng":0}'])
    ("ignores invalid or out-of-range cookie data: %s", (raw) => {
      expect(parseRunnerLocation(raw, "buyer-a")).toBeNull();
    });

  it("writes an expiring, HttpOnly, path-scoped cookie through the authenticated action", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(await setRunnerSearchLocation({ lat: 5.123456, lng: -0.123456 })).toEqual({});
      expect(mocks.setCookie).toHaveBeenCalledWith("melange-runner-location",
        '{"userId":"buyer-a","lat":5.123456,"lng":-0.123456}', {
          httpOnly: true, secure: true, sameSite: "strict", path: "/app/runners", maxAge: 1800,
        });
    } finally { vi.unstubAllEnvs(); }
  });

  it("clears the same cookie path immediately", async () => {
    expect(await setRunnerSearchLocation(null)).toEqual({});
    expect(mocks.setCookie).toHaveBeenCalledWith("melange-runner-location", "",
      expect.objectContaining({ path: "/app/runners", maxAge: 0, httpOnly: true }));
  });

  it("does not save location for an unauthenticated request", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await setRunnerSearchLocation({ lat: 5, lng: 0 })).toHaveProperty("error");
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it.each([{ lat: NaN, lng: 0 }, { lat: 0, lng: Infinity }, { lat: -91, lng: 0 },
    { lat: 0, lng: 181 }, { lat: "5", lng: 0 }, {}, undefined])
    ("rejects invalid action input without writing a cookie: %j", async (value) => {
      expect(await setRunnerSearchLocation(value)).toHaveProperty("error");
      expect(mocks.setCookie).not.toHaveBeenCalled();
    });
});
