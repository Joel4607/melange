import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_MATCH_CONFIG } from "../src/lib/algorithm/matching";
import type { MatchConfig } from "../src/lib/algorithm/types";
import {
  BOOTSTRAP_SEED,
  CALIBRATION_SEED,
  DEFAULT_SCENARIO_COUNT,
  FINAL_SEED,
  evaluateAllStrategies,
  evaluateStrategy,
  generateScenarios,
} from "../src/lib/algorithm/matching-evaluation";
import {
  createMatcherRanker,
  rankHighestTrust,
  rankNearest,
} from "../src/lib/algorithm/matching-evaluation/baselines";
import type {
  MatchingEvaluationReport,
  StrategyEvaluation,
} from "../src/lib/algorithm/matching-evaluation/types";

export type EvaluationMode = "calibration" | "final";

export function parseEvaluationArgs(args: string[]): { mode: EvaluationMode } {
  const inline = args.find((arg) => arg.startsWith("--mode="))?.slice("--mode=".length);
  const position = args.indexOf("--mode");
  const value = inline ?? (position >= 0 ? args[position + 1] : undefined);
  if (value !== "calibration" && value !== "final") {
    throw new Error("Required --mode must be calibration or final");
  }
  return { mode: value };
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortKeys(item)]),
    );
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function strategyRow(strategy: StrategyEvaluation): string {
  const metrics = strategy.metrics;
  return `| ${strategy.name} | ${percent(metrics.successfulOnTimeRate)} | ${metrics.ndcgAt5.toFixed(3)} | ${metrics.normalizedRegret.toFixed(3)} | ${metrics.meanPickupMinutes.toFixed(2)} | ${metrics.selectionConcentration.toFixed(3)} | ${metrics.eligibilityViolations} |`;
}

export function renderEvaluationMarkdown(
  report: MatchingEvaluationReport,
  label: string,
): string {
  const criteria = Object.entries(report.acceptanceCriteria)
    .map(([name, passed]) => `| ${name} | ${passed ? "PASS" : "FAIL"} |`)
    .join("\n");
  const strategies = report.strategies.map(strategyRow).join("\n") ||
    "| _No strategies in fixture_ | - | - | - | - | - | - |";
  const differences = report.pairedDifferences
    .map((difference) =>
      `| ${difference.baseline} | ${percent(difference.meanDifference)} | ${percent(difference.interval.lower)} | ${percent(difference.interval.upper)} |`)
    .join("\n") || "| _No comparisons in fixture_ | - | - | - |";
  return `# Matching Evaluation - ${label}\n\n` +
    `- Evaluation version: \`${report.evaluationVersion}\`\n` +
    `- Generator version: \`${report.generatorVersion}\`\n` +
    `- Generator seed: \`${report.generatorSeed}\`\n` +
    `- Bootstrap seed: \`${report.bootstrapSeed}\`\n` +
    `- Scenarios: \`${report.scenarioCount}\`\n` +
    `- Algorithm: \`${report.algorithmVersion}\`\n` +
    `- Configuration: \`${report.configVersion}\`\n` +
    `- Weight perturbation stability: \`${percent(report.weightPerturbationStability)}\`\n\n` +
    `## Strategy results\n\n` +
    `| Strategy | Successful on time | NDCG@5 | Regret | Pickup minutes | Selection concentration | Eligibility violations |\n` +
    `|---|---:|---:|---:|---:|---:|---:|\n${strategies}\n\n` +
    `## Paired successful-on-time differences\n\n` +
    `| Baseline | Proposed difference | 95% lower | 95% upper |\n` +
    `|---|---:|---:|---:|\n${differences}\n\n` +
    `## Acceptance criteria\n\n` +
    `| Criterion | Result |\n|---|---|\n${criteria}\n\n` +
    `## Limitation\n\n` +
    `These results come from an independent deterministic simulation. They do not establish real-world superiority; production outcomes must be evaluated separately.\n`;
}

function candidateConfigs(): MatchConfig[] {
  const configs: MatchConfig[] = [];
  for (let proximity = 0; proximity <= 20; proximity += 1) {
    for (let trust = 0; trust <= 20 - proximity; trust += 1) {
      for (let capacity = 0; capacity <= 20 - proximity - trust; capacity += 1) {
        const urgency = 20 - proximity - trust - capacity;
        configs.push({
          ...DEFAULT_MATCH_CONFIG,
          weights: {
            proximity: proximity / 20,
            trust: trust / 20,
            capacity: capacity / 20,
            urgency: urgency / 20,
          },
          configVersion: "matching-v2-calibrated",
        });
      }
    }
  }
  return configs;
}

export function calibrateConfig(): MatchConfig {
  const scenarios = generateScenarios({ seed: CALIBRATION_SEED, count: DEFAULT_SCENARIO_COUNT });
  const urgencyGroups = new Map<string, typeof scenarios>();
  for (const scenario of scenarios) {
    const group = urgencyGroups.get(scenario.task.urgency) ?? [];
    group.push(scenario);
    urgencyGroups.set(scenario.task.urgency, group);
  }
  const urgencyFloors = new Map(
    [...urgencyGroups].map(([urgency, group]) => [
      urgency,
      Math.max(
        evaluateStrategy(group, rankNearest).successfulOnTimeRate,
        evaluateStrategy(group, rankHighestTrust).successfulOnTimeRate,
      ),
    ]),
  );
  let bestConfig: MatchConfig | null = null;
  let bestMetrics: ReturnType<typeof evaluateStrategy> | null = null;

  for (const config of candidateConfigs()) {
    const metrics = evaluateStrategy(scenarios, createMatcherRanker(config));
    const better =
      metrics.eligibilityViolations === 0 &&
      (!bestMetrics ||
        metrics.successfulOnTimeRate > bestMetrics.successfulOnTimeRate ||
        (metrics.successfulOnTimeRate === bestMetrics.successfulOnTimeRate &&
          (metrics.ndcgAt5 > bestMetrics.ndcgAt5 ||
            (metrics.ndcgAt5 === bestMetrics.ndcgAt5 &&
              metrics.normalizedRegret < bestMetrics.normalizedRegret))));
    if (better && [...urgencyGroups].every(([urgency, group]) =>
      evaluateStrategy(group, createMatcherRanker(config)).successfulOnTimeRate >=
        (urgencyFloors.get(urgency) ?? 0))) {
      bestConfig = config;
      bestMetrics = metrics;
    }
  }
  if (!bestConfig) throw new Error("No calibration configuration met the declared constraints");
  return bestConfig;
}

function reportPath(mode: EvaluationMode, extension: "json" | "md"): string {
  return resolve(process.cwd(), "reports", "matching", `${mode}.${extension}`);
}

function writeReport(mode: EvaluationMode, report: MatchingEvaluationReport): void {
  const jsonPath = reportPath(mode, "json");
  const markdownPath = reportPath(mode, "md");
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, stableStringify(report));
  writeFileSync(markdownPath, renderEvaluationMarkdown(report, mode === "final" ? "Final" : "Calibration"));
}

function readCalibratedConfig(): MatchConfig {
  const path = reportPath("calibration", "json");
  let parsed: MatchingEvaluationReport;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as MatchingEvaluationReport;
  } catch (error) {
    throw new Error(`Run calibration before final evaluation: ${(error as Error).message}`);
  }
  if (parsed.configVersion !== "matching-v2-calibrated" || parsed.config.configVersion !== parsed.configVersion) {
    throw new Error("Calibration report does not contain the frozen matching-v2-calibrated config");
  }
  return parsed.config;
}

export function runEvaluation(mode: EvaluationMode): MatchingEvaluationReport {
  const config = mode === "calibration" ? calibrateConfig() : readCalibratedConfig();
  const seed = mode === "calibration" ? CALIBRATION_SEED : FINAL_SEED;
  const scenarios = generateScenarios({ seed, count: DEFAULT_SCENARIO_COUNT });
  const report = evaluateAllStrategies(scenarios, config, seed);
  report.bootstrapSeed = BOOTSTRAP_SEED;
  writeReport(mode, report);
  return report;
}

async function main(): Promise<void> {
  const { mode } = parseEvaluationArgs(process.argv.slice(2));
  const report = runEvaluation(mode);
  const passed = Object.values(report.acceptanceCriteria).filter(Boolean).length;
  console.log(
    `Matching ${mode} evaluation: ${passed}/${Object.keys(report.acceptanceCriteria).length} criteria passed.`,
  );
  console.log(`Reports: ${reportPath(mode, "json")} and ${reportPath(mode, "md")}`);
}

const executedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (executedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
