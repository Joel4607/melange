import { afterEach, describe, expect, it } from "vitest";

import { getSiteUrl, resolveTelegramWebhookUrl } from "../env";

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const originalVercelUrl = process.env.VERCEL_URL;

function restoreEnvironment() {
  if (originalSiteUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  }

  if (originalVercelUrl === undefined) {
    delete process.env.VERCEL_URL;
  } else {
    process.env.VERCEL_URL = originalVercelUrl;
  }
}

afterEach(restoreEnvironment);

describe("getSiteUrl", () => {
  it("requires an explicit canonical URL instead of using the Vercel deployment URL", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_URL = "untrusted-preview.vercel.app";

    expect(() => getSiteUrl()).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it.each([
    "not-a-url",
    "ftp://melange.example",
    "http://melange.example",
    "https://user:password@melange.example",
    "https://melange.example/app",
    "https://melange.example/app/..",
    "https://melange.example\\app\\..",
    "https://melange.example?preview=true",
    "https://melange.example?",
    "https://melange.example#fragment",
    "https://melange.example#",
  ])("rejects invalid canonical URL %s", (siteUrl) => {
    process.env.NEXT_PUBLIC_SITE_URL = siteUrl;

    expect(() => getSiteUrl()).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it("returns the normalized HTTPS origin", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "  https://melange.example/  ";
    process.env.VERCEL_URL = "preview.vercel.app";

    expect(getSiteUrl()).toBe("https://melange.example");
  });

  it.each([
    "http://localhost:3000/",
    "http://127.0.0.1:3000/",
    "http://[::1]:3000/",
  ])(
    "permits loopback HTTP for local development: %s",
    (siteUrl) => {
      process.env.NEXT_PUBLIC_SITE_URL = siteUrl;

      expect(getSiteUrl()).toBe(siteUrl.slice(0, -1));
    },
  );
});

describe("resolveTelegramWebhookUrl", () => {
  it("builds the default webhook endpoint from the canonical origin", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://melange.example/";

    expect(resolveTelegramWebhookUrl()).toBe(
      "https://melange.example/api/telegram/webhook",
    );
  });

  it("preserves an explicit operator-provided webhook URL", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;

    expect(
      resolveTelegramWebhookUrl("https://tunnel.example/custom-webhook"),
    ).toBe("https://tunnel.example/custom-webhook");
  });
});
