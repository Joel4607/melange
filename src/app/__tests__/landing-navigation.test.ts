import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();

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
        returns: async () => ({ data: [], error: null }),
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

  it("lets signed-in visitors open the get-started chooser", async () => {
    const response = await updateSession(
      new NextRequest("https://melange.test/get-started"),
    );

    expect(response.headers.get("location")).toBeNull();
  });
});
