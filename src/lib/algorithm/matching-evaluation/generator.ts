import { haversineKm } from "../geo";
import type { FraudAction, RunnerCandidate, TaskRequest, Urgency } from "../types";
import { createSeededRandom } from "./random";
import type { GeneratorOptions, SimulatedRunner, SimulatedScenario } from "./types";

const CATEGORIES = ["Market Runs", "Grocery Shopping", "Pharmacy Pickups", "Deliveries", "Food & Catering"] as const;
const URGENCIES: readonly Urgency[] = ["express", "normal", "low"];

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function generateScenarios(options: GeneratorOptions): SimulatedScenario[] {
  if (!Number.isInteger(options.count) || options.count < 1) {
    throw new Error("Scenario count must be a positive integer");
  }
  const random = createSeededRandom(options.seed);
  const scenarios: SimulatedScenario[] = [];
  const runnerPool = Array.from({ length: 48 }, (_, index) => {
    const completionReliability = clamp(random.normal(0.72, 0.16));
    return {
      runnerId: `sim-runner-${index.toString().padStart(2, "0")}`,
      hidden: {
        responseTendency: clamp(random.normal(0.68, 0.2)),
        categoryProficiency: clamp(random.normal(0.72, 0.18)),
        travelSpeedKmh: clamp(random.normal(22, 6), 8, 45),
        completionReliability,
        cancellationTendency: clamp(random.normal(0.12, 0.1), 0.01, 0.65),
      },
      baseTrust: clamp(completionReliability + random.normal(0, 0.1)),
      capabilities: [random.pick(CATEGORIES), random.pick(CATEGORIES)],
    };
  });

  for (let scenarioIndex = 0; scenarioIndex < options.count; scenarioIndex += 1) {
    const pickup = {
      lat: 5.6037 + random.normal(0, 0.035),
      lng: -0.187 + random.normal(0, 0.035),
    };
    const task: TaskRequest = {
      pickup,
      category: random.pick(CATEGORIES),
      urgency: random.pick(URGENCIES),
    };
    const candidateCount = random.int(3, 12);
    const candidates: SimulatedRunner[] = [];
    const selectedProfiles = new Set<number>();
    while (selectedProfiles.size < candidateCount) {
      selectedProfiles.add(random.int(0, runnerPool.length - 1));
    }
    const profiles = [...selectedProfiles].map((index) => runnerPool[index]);

    for (let candidateIndex = 0; candidateIndex < candidateCount; candidateIndex += 1) {
      const profile = profiles[candidateIndex];
      const hidden = profile.hidden;
      const location = {
        lat: pickup.lat + random.normal(0, 0.045),
        lng: pickup.lng + random.normal(0, 0.045),
      };
      const forcedEligible = candidateIndex === 0;
      const active = forcedEligible || random.next() > 0.05;
      const verified = forcedEligible || random.next() > 0.08;
      const available = forcedEligible || random.next() > 0.18;
      const fraudAction: FraudAction = forcedEligible
        ? "clear"
        : random.next() < 0.04
          ? "exclude"
          : random.next() < 0.12
            ? "penalize"
            : "clear";
      const handlesCategory = profile.capabilities.includes(task.category as typeof CATEGORIES[number]);
      const capabilities = forcedEligible
        ? [...new Set([task.category as string, ...profile.capabilities])]
        : handlesCategory
          ? profile.capabilities
          : [random.pick(CATEGORIES.filter((category) => category !== task.category))];
      const candidate: RunnerCandidate = {
        runnerId: profile.runnerId,
        location,
        trust: clamp(profile.baseTrust + random.normal(0, 0.08)),
        activeLoad: random.int(0, 4),
        available,
        active,
        verified,
        fraudAction,
        capabilities,
      };
      candidates.push({
        candidate,
        hidden,
        distanceKm: haversineKm(task.pickup, location),
        draws: {
          acceptance: random.next(),
          completion: random.next(),
          cancellation: random.next(),
          dispute: random.next(),
        },
      });
    }

    scenarios.push({
      id: `scenario-${options.seed}-${scenarioIndex.toString().padStart(5, "0")}`,
      task,
      candidates,
    });
  }

  return scenarios;
}
