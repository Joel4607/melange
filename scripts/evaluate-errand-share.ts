import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  evaluateErrandSharing,
  stableStringify,
} from "../src/lib/algorithm/errand-share-evaluation/metrics";
import type {
  ErrandShareEvaluationReport,
  UrgencySlice,
} from "../src/lib/algorithm/errand-share-evaluation/types";
import type { Urgency } from "../src/lib/algorithm/types";

const REPORT_DIRECTORY = resolve(process.cwd(), "reports", "errand-share");

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function urgencyLabel(urgency: Urgency): string {
  if (urgency === "express") return "ASAP Express";
  if (urgency === "normal") return "Today";
  return "Whenever";
}

function urgencyRow(urgency: Urgency, slice: UrgencySlice): string {
  return `| ${urgencyLabel(urgency)} | ${slice.scenarios} | ${slice.eligible} | ${slice.paired} | ${percent(slice.pairingRate)} |`;
}

export function renderErrandShareMarkdown(report: ErrandShareEvaluationReport): string {
  const urgencyRows = (["express", "normal", "low"] as const)
    .map((urgency) => urgencyRow(urgency, report.metrics.urgencySlices[urgency]))
    .join("\n");
  const rejectionRows = Object.entries(report.metrics.rejectionReasons)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([reason, count]) => `| \`${reason}\` | ${count} |`)
    .join("\n") || "| _No rejected candidates_ | 0 |";
  const metrics = report.metrics;

  return `# Errand-Share deterministic simulation\n\n` +
    `> Evidence status: **SIMULATED**. This report is repeatable engineering evidence, not a claim about production outcomes.\n\n` +
    `- Evaluation version: \`${report.evaluationVersion}\`\n` +
    `- Generator version: \`${report.generatorVersion}\`\n` +
    `- Algorithm version: \`${report.algorithmVersion}\`\n` +
    `- Configuration version: \`${report.configVersion}\`\n` +
    `- Seed: \`${report.seed}\`\n` +
    `- Scenarios: \`${report.scenarioCount}\`\n\n` +
    `## Aggregate results\n\n` +
    `| Metric | Simulated result |\n` +
    `|---|---:|\n` +
    `| Eligible errands | ${metrics.eligibleErrands} |\n` +
    `| Paired errands | ${metrics.pairedErrands} |\n` +
    `| Pairs | ${metrics.pairCount} |\n` +
    `| Pairing rate | ${percent(metrics.pairingRate)} |\n` +
    `| Direct no-sharing baseline | ${metrics.noSharingBaselineKm.toFixed(3)} km |\n` +
    `| Shared-route distance | ${metrics.sharedRouteKm.toFixed(3)} km |\n` +
    `| Distance saved | ${metrics.distanceSavedKm.toFixed(3)} km (${percent(metrics.distanceSavingRate)}) |\n` +
    `| Mean accepted detour | ${metrics.meanDetourKm.toFixed(3)} km |\n` +
    `| Maximum accepted detour | ${metrics.maximumDetourKm.toFixed(3)} km |\n` +
    `| Deadline violations | ${metrics.deadlineViolations} |\n` +
    `| Detour violations | ${metrics.detourViolations} |\n` +
    `| Simulated cancellation rate | ${percent(metrics.simulatedCancellationRate)} |\n` +
    `| Simulated completion rate | ${percent(metrics.simulatedCompletionRate)} |\n\n` +
    `## Urgency slices\n\n` +
    `| Mode | Scenarios | Eligible | Paired | Pairing rate |\n` +
    `|---|---:|---:|---:|---:|\n${urgencyRows}\n\n` +
    `ASAP Express is deliberately ineligible for sharing. Today and Whenever may pair only when the route meets the stricter Today deadline.\n\n` +
    `## Candidate rejection reasons\n\n` +
    `| Reason | Count |\n|---|---:|\n${rejectionRows}\n\n` +
    `## Evidence boundary\n\n${report.limitation}\n`;
}

export function writeErrandShareReport(
  report: ErrandShareEvaluationReport = evaluateErrandSharing(),
): { jsonPath: string; markdownPath: string } {
  const jsonPath = resolve(REPORT_DIRECTORY, "simulation.json");
  const markdownPath = resolve(REPORT_DIRECTORY, "simulation.md");
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, stableStringify(report));
  writeFileSync(markdownPath, renderErrandShareMarkdown(report));
  return { jsonPath, markdownPath };
}

function main(): void {
  const report = evaluateErrandSharing();
  const paths = writeErrandShareReport(report);
  console.log(
    `Errand-Share simulation: ${report.metrics.pairCount} pairs, ${report.metrics.hardConstraintViolations} hard-constraint violations.`,
  );
  console.log(`Reports: ${paths.jsonPath} and ${paths.markdownPath}`);
}

const executedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (executedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
