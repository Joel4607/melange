import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  getUser: vi.fn(),
  refreshedCookies: null as
    | Array<{
        name: string;
        value: string;
        options: { httpOnly?: boolean; path?: string; sameSite?: "lax" };
      }>
    | null,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: {
      cookies: {
        setAll: (cookies: NonNullable<typeof auth.refreshedCookies>) => void;
      };
    },
  ) => ({
    auth: {
      getUser: async () => {
        if (auth.refreshedCookies) options.cookies.setAll(auth.refreshedCookies);
        return auth.getUser();
      },
    },
  }),
}));

import nextConfig from "../../../../next.config";
import { config, proxy } from "@/proxy";

function directive(csp: string, name: string): string[] {
  const value = csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `));
  return value?.split(/\s+/).slice(1) ?? [];
}

function responseNonce(csp: string): string {
  const source = directive(csp, "script-src").find((value) => value.startsWith("'nonce-"));
  if (!source) throw new Error("script-src nonce is missing");
  return source.slice("'nonce-".length, -1);
}

describe("request-scoped Content Security Policy", () => {
  beforeEach(() => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    auth.refreshedCookies = null;
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_MAP_TILE_URL", "https://tiles.example.com/{z}/{x}/{y}.png");
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses a fresh nonce and removes executable inline-script bypasses in production", async () => {
    const first = await proxy(new NextRequest("https://melange.test/app"));
    const second = await proxy(new NextRequest("https://melange.test/app"));
    const firstCsp = first.headers.get("content-security-policy") ?? "";
    const secondCsp = second.headers.get("content-security-policy") ?? "";
    const scriptSources = directive(firstCsp, "script-src");

    expect(responseNonce(firstCsp)).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(responseNonce(secondCsp)).not.toBe(responseNonce(firstCsp));
    expect(scriptSources).toContain("'strict-dynamic'");
    expect(scriptSources).not.toContain("'unsafe-inline'");
    expect(scriptSources).not.toContain("'unsafe-eval'");
  });

  it("forwards the same CSP to Next.js that it sends to the browser", async () => {
    const response = await proxy(new NextRequest("https://melange.test/app"));
    const browserCsp = response.headers.get("content-security-policy");

    expect(browserCsp).toBeTruthy();
    expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(
      browserCsp,
    );
  });

  it("preserves the nonce header when Supabase refreshes authentication cookies", async () => {
    auth.refreshedCookies = [
      {
        name: "sb-session",
        value: "refreshed-token",
        options: { httpOnly: true, path: "/", sameSite: "lax" },
      },
    ];

    const response = await proxy(new NextRequest("https://melange.test/app"));
    const browserCsp = response.headers.get("content-security-policy");

    expect(response.headers.get("set-cookie")).toContain("sb-session=refreshed-token");
    expect(response.headers.get("x-middleware-request-cookie")).toContain(
      "sb-session=refreshed-token",
    );
    expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(
      browserCsp,
    );
  });

  it("preserves refreshed cookies when an unauthenticated request redirects", async () => {
    auth.refreshedCookies = [
      {
        name: "sb-session",
        value: "",
        options: { httpOnly: true, path: "/", sameSite: "lax" },
      },
    ];
    auth.getUser.mockResolvedValue({ data: { user: null } });

    const response = await proxy(new NextRequest("https://melange.test/app"));

    expect(response.status).toBe(307);
    expect(response.headers.get("set-cookie")).toContain("sb-session=");
    expect(response.headers.get("content-security-policy")).toContain("script-src");
  });

  it("protects the static offline document with the request-scoped CSP", async () => {
    const response = await proxy(new NextRequest("https://melange.test/offline.html"));
    const csp = response.headers.get("content-security-policy") ?? "";

    expect(responseNonce(csp)).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
  });

  it("keeps the offline document compatible with a strict script and style policy", () => {
    const html = readFileSync(resolve(process.cwd(), "public/offline.html"), "utf8");

    expect(html).not.toMatch(/<style\b/i);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).toContain('href="/offline.css"');
  });

  it("runs the proxy for image-shaped paths that can fall through to an HTML 404", () => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        nextConfig: {},
        url: "/missing.png",
      }),
    ).toBe(true);
  });

  it.each([
    { url: "/_next/static/chunks/app.js", expected: false },
    { url: "/_next/image?url=%2Ficon.png&w=64&q=75", expected: false },
    { url: "/_next/static", expected: true },
    { url: "/_next/static-page", expected: true },
    { url: "/_next/image-shaped", expected: true },
    { url: "/_next/image/extra", expected: true },
  ])("matches only real Next asset endpoints for $url", ({ url, expected }) => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        nextConfig: {},
        url,
      }),
    ).toBe(expected);
  });

  it("allows only the configured browser connection and image origins", async () => {
    const response = await proxy(new NextRequest("https://melange.test/app"));
    const csp = response.headers.get("content-security-policy") ?? "";

    expect(directive(csp, "connect-src")).toEqual([
      "'self'",
      "https://project.supabase.co",
      "wss://project.supabase.co",
    ]);
    expect(directive(csp, "img-src")).toEqual([
      "'self'",
      "data:",
      "blob:",
      "https://project.supabase.co",
      "https://tiles.example.com",
    ]);
  });

  it("keeps unsafe-eval limited to development and scopes inline CSS to attributes", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const response = await proxy(new NextRequest("http://localhost:3000/app"));
    const csp = response.headers.get("content-security-policy") ?? "";

    expect(directive(csp, "script-src")).toContain("'unsafe-eval'");
    expect(directive(csp, "script-src")).not.toContain("'unsafe-inline'");
    expect(directive(csp, "style-src").some((value) => value.startsWith("'nonce-"))).toBe(
      true,
    );
    expect(directive(csp, "style-src-attr")).toEqual(["'unsafe-inline'"]);
  });

  it("allows only Next.js's exact built-in error-page style by hash", async () => {
    const response = await proxy(new NextRequest("https://melange.test/missing.png"));
    const styleSources = directive(
      response.headers.get("content-security-policy") ?? "",
      "style-src",
    );

    expect(styleSources).toContain(
      "'sha256-Z5XTK23DFuEMs0PwnyZDO9SWxemQ5HxcpVaBNuUJyWY='",
    );
    expect(styleSources).not.toContain("'unsafe-inline'");
  });

  it("does not turn malformed configured URLs into CSP sources", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "javascript:alert(1)");
    vi.stubEnv("NEXT_PUBLIC_MAP_TILE_URL", "https://tiles.example.com;script-src *");

    const response = await proxy(new NextRequest("https://melange.test/app"));
    const csp = response.headers.get("content-security-policy") ?? "";

    expect(csp).not.toContain("javascript:");
    expect(csp).not.toContain("tiles.example.com");
    expect(csp.match(/script-src/g)).toHaveLength(2);
  });

  it("permits insecure configured origins only in explicit development mode", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_MAP_TILE_URL", "http://tiles.example.test/{z}/{x}/{y}.png");

    const response = await proxy(new NextRequest("http://localhost:3000/app"));
    const csp = response.headers.get("content-security-policy") ?? "";

    expect(directive(csp, "connect-src")).toEqual(["'self'"]);
    expect(directive(csp, "img-src")).toEqual(["'self'", "data:", "blob:"]);
  });

  it("applies the enforcing CSP to authentication redirects", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null } });

    const response = await proxy(new NextRequest("https://melange.test/app"));

    expect(response.status).toBe(307);
    expect(response.headers.get("content-security-policy")).toContain("script-src");
  });

  it("does not install a competing static CSP in next.config", async () => {
    const headerRules = await nextConfig.headers?.();
    const headerNames = headerRules
      ?.flatMap((rule) => rule.headers)
      .map((header) => header.key.toLowerCase());

    expect(headerNames).not.toContain("content-security-policy");
  });
});
