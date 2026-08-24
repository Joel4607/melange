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

import Home from "@/app/page";
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

  it("preserves the landing-page origin when authentication redirects to login", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await updateSession(
      new NextRequest("https://melange.test/app/runners?from=landing"),
    );

    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/app/runners?from=landing");
  });
});
