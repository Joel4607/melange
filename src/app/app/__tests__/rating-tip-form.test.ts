import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const componentPath = resolve(
  process.cwd(),
  "src/app/app/errands/[id]/rating-tip-form.tsx",
);
const component = existsSync(componentPath)
  ? readFileSync(componentPath, "utf8")
  : "";
const tracking = readFileSync(
  resolve(process.cwd(), "src/app/app/errands/[id]/page.tsx"),
  "utf8",
);

describe("rating and demo-tip form", () => {
  it("selects a rating before one explicit submission", () => {
    expect(component).toContain('name="stars"');
    expect(component).toContain('type="button"');
    expect(component).toContain("aria-pressed");
    expect(component).not.toContain("formAction");
    expect(component.match(/type="submit"/g)).toHaveLength(1);
  });

  it("offers no-tip, preset, and custom demo-tip choices", () => {
    for (const label of ["No tip", "GHS 5", "GHS 10", "GHS 20", "Custom"]) {
      expect(component).toContain(label);
    }
    expect(component).toContain('name="tip"');
    expect(component).toContain("DEMO_MONEY_NOTICE");
    expect(component).toContain("Submit rating and demo tip");
  });

  it("reuses one component for completed and resolved errands", () => {
    expect(tracking).toContain("RatingTipForm");
    expect(tracking.match(/<RatingTipForm/g)).toHaveLength(2);
    expect(tracking).not.toContain("formAction={rateRunner.bind");
  });
});
