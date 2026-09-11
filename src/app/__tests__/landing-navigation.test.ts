import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const getCookie = vi.fn();
const getRows = vi.fn();

vi.mock("next/headers", () => ({ cookies: async () => ({ get: getCookie }) }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

vi.mock("@/lib/supabase/service", () => ({
  getServiceClient: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        neq: () => query,
        contains: () => query,
        gte: () => query,
        in: () => query,
        returns: getRows,
      };
      return query;
    },
  }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser } }),
}));

vi.mock("@/app/app/runners/runner-filters", () => ({
  RunnerFilters: () => null,
}));

vi.mock("@/app/app/post/post-form", () => ({
  CATEGORIES: [],
  PostForm: () => null,
}));

import Home from "@/app/page";
import PostErrandPage from "@/app/app/post/page";
import { RunnerCard } from "@/app/app/runners/runner-card";
import RunnersPage from "@/app/app/runners/page";
import { updateSession } from "@/lib/supabase/middleware";

describe("landing-page onboarding navigation", () => {
  beforeEach(() => {
    getUser.mockResolvedValue({ data: { user: { id: "buyer-1" } } });
    getCookie.mockReset();
    getRows.mockReset().mockResolvedValue({ data: [], error: null });
  });

  it("offers signup directly from the landing-page header", () => {
    const html = renderToStaticMarkup(Home());

    expect(html).toMatch(/<a[^>]*href="\/get-started"[^>]*>Get started<\/a>/);
  });

  it("marks runner searches as coming from the landing page", () => {
    const html = renderToStaticMarkup(Home());

    expect(html.match(/href="\/app\/runners\?from=landing"/g)).toHaveLength(2);
  });

  it("marks quick matches as coming from the landing page", () => {
    const html = renderToStaticMarkup(Home());

    expect(html).toContain('href="/app/post?from=landing"');
  });

  it("returns landing-page runner searches to the landing page", async () => {
    const html = renderToStaticMarkup(
      await RunnersPage({ searchParams: Promise.resolve({ from: "landing" }) }),
    );

    expect(html).toContain('href="/"');
    expect(html).not.toContain('href="/app"');
  });

  it("keeps dashboard runner searches returning to the dashboard", async () => {
    const html = renderToStaticMarkup(
      await RunnersPage({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain('href="/app"');
  });

  it("redirects old GPS links to a coordinate-free runner URL", async () => {
    await expect(RunnersPage({ searchParams: Promise.resolve({
      lat: ["5.123456", "6.654321"], lng: "-0.123456", sort: "distance", from: "landing",
    }) })).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/app/runners?sort=distance&from=landing;307;",
    });
    expect(getRows).not.toHaveBeenCalled();
  });

  it("sorts nearest runners using the private cookie, without coordinates in links", async () => {
    getCookie.mockReturnValue({ value: '{"userId":"buyer-1","lat":5.123456,"lng":-0.123456}' });
    getRows.mockResolvedValueOnce({ data: [
      { user_id: "far", current_lat: 6, current_lng: 0, trust_score: 1, verified: true,
        capabilities: [], profiles: { name: "Far Runner", verified: true } },
      { user_id: "near", current_lat: 5.123456, current_lng: -0.123456, trust_score: 0.5, verified: true,
        capabilities: [], profiles: { name: "Near Runner", verified: true } },
    ], error: null });
    const html = renderToStaticMarkup(await RunnersPage({ searchParams: Promise.resolve({ sort: "distance" }) }));
    expect(html).toContain("0.0 km away");
    expect(html.indexOf("Near Runner")).toBeLessThan(html.indexOf("Far Runner"));
    expect(html).not.toContain("5.123456");
    expect(html).not.toContain("-0.123456");
  });

  it("returns landing-page quick matches to the landing page", async () => {
    const html = renderToStaticMarkup(
      await PostErrandPage({ searchParams: Promise.resolve({ from: "landing" }) }),
    );

    expect(html).not.toContain('href="/app"');
  });

  it("keeps the landing origin when requesting a runner", () => {
    const html = renderToStaticMarkup(
      RunnerCard({
        runner: {
          user_id: "11111111-1111-4111-8111-111111111111",
          profiles: { name: "Ama Mensah", verified: true },
          trust_score: 0.9,
          capabilities: ["Market Runs"],
          completed: 5,
          distanceKm: 1.2,
        },
        fromLanding: true,
      }),
    );

    expect(html).toContain("from=landing");
  });

  it("preserves the landing-page origin when authentication redirects to login", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await updateSession(
      new NextRequest("https://melange.test/app/runners?from=landing"),
    );

    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/app/runners?from=landing");
  });

  it("cleans old GPS links before a logged-out request can copy them into login", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await updateSession(new NextRequest(
      "https://melange.test/app/runners?from=landing&lat=5.123456&lng=-0.123456",
    ));
    const location = response.headers.get("location")!;
    expect(location).toBe("https://melange.test/app/runners?from=landing");
    expect(location).not.toContain("5.123456");
  });

  it("lets signed-in visitors open the get-started chooser", async () => {
    const response = await updateSession(
      new NextRequest("https://melange.test/get-started"),
    );

    expect(response.headers.get("location")).toBeNull();
  });
});
