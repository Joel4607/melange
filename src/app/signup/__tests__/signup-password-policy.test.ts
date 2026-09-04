import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SignupForm } from "../signup-form";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

describe("signup password policy", () => {
  it("requires the browser form to match the hardened Supabase policy", () => {
    const html = renderToStaticMarkup(createElement(SignupForm));

    expect(html).toContain('minLength="12"');
    expect(html).toContain('pattern="(?=.*[A-Za-z])(?=.*\\d).{12,}"');
    expect(html).toContain("At least 12 characters with a letter and a number");
  });
});
