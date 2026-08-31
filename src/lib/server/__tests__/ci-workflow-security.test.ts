import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface AutomationSource {
  name: string;
  source: string;
}

function readYamlFiles(directory: string): AutomationSource[] {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return readYamlFiles(path);
    if (!/\.ya?ml$/i.test(entry.name)) return [];
    return [{ name: entry.name, source: readFileSync(path, "utf8") }];
  });
}

const workflowDirectory = resolve(process.cwd(), ".github/workflows");
const workflows = readYamlFiles(workflowDirectory);
const compositeActions = readYamlFiles(
  resolve(process.cwd(), ".github/actions"),
);
const allAutomationSources = [...workflows, ...compositeActions]
  .map(({ source }) => source)
  .join("\n");

describe("CI workflow supply-chain security", () => {
  it.each(workflows)(
    "$name grants the GitHub token read-only repository access",
    ({ source }) => {
      const permissionLines = source
        .match(/^permissions:\s*\r?\n((?:^[ \t]+[^\r\n]*(?:\r?\n|$))*)/m)?.[1]
        ?.split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      expect(permissionLines).toEqual(["contents: read"]);
      expect(source).not.toMatch(/^[ \t]+permissions:/m);
    },
  );

  it("pins every external action to an immutable commit", () => {
    expect(allAutomationSources).not.toMatch(
      /\{[^\r\n]*(?:["']?uses["']?)\s*:/i,
    );
    const actionReferences = [
      ...allAutomationSources.matchAll(
        /^\s+(?:-\s+)?(?:["']?uses["']?)\s*:\s*([^\s#]+)/gm,
      ),
    ].map(([, reference]) => reference);

    expect(actionReferences.length).toBeGreaterThan(0);
    for (const reference of actionReferences) {
      if (reference.startsWith("./")) continue;
      expect(reference).toMatch(/^[^@\s]+@[0-9a-f]{40}$/);
    }
  });

  it("pins every service container to an immutable image digest", () => {
    expect(allAutomationSources).not.toMatch(
      /\{[^\r\n]*(?:["']?image["']?)\s*:/i,
    );
    const serviceImages = [
      ...allAutomationSources.matchAll(
        /^\s+(?:["']?image["']?)\s*:\s*([^\s#]+)/gm,
      ),
    ].map(([, reference]) => reference);

    expect(serviceImages.length).toBeGreaterThan(0);
    for (const image of serviceImages) {
      expect(image).toMatch(/^[^@\s]+@sha256:[0-9a-f]{64}$/);
    }
  });
});
