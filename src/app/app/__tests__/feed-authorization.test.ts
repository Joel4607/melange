import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const feedSource = readFileSync(
  new URL("../feed/page.tsx", import.meta.url),
  "utf8",
);

describe("runner feed authorization", () => {
  it("redirects unverified runners before loading any posted errands", () => {
    const verificationGate = feedSource.indexOf(
      'if (!verified) redirect("/app/verify");',
    );
    const firstTaskQuery = feedSource.indexOf('.from("tasks")');
    const firstShareQuery = feedSource.indexOf('.from("errand_share_groups")');

    expect(verificationGate).toBeGreaterThan(-1);
    expect(firstTaskQuery).toBeGreaterThan(verificationGate);
    expect(firstShareQuery).toBeGreaterThan(verificationGate);
  });

  it("uses only the canonical profile verification flag for authorization", () => {
    expect(feedSource).toContain(
      "const verified = userProfile?.verified ?? false;",
    );
    expect(feedSource).not.toMatch(/profile\?\.verified\s*\|\|/);
  });
});
