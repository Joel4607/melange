import {
  shareWindowEndsAt,
  todayDeadlineAt,
  type ShareTask,
} from "../errand-share";
import type { Urgency } from "../types";
import { mulberry32, pick } from "./random";
import type { SimulatedErrand } from "./types";

export const DEFAULT_ERRAND_SHARE_SEED = 4607;
export const DEFAULT_ERRAND_SHARE_SCENARIO_COUNT = 1000;
export const ERRAND_SHARE_GENERATOR_VERSION = "errand-share-generator-v1";

const START = Date.UTC(2026, 7, 16, 8, 0, 0);
const DURATION_MS = 8 * 60 * 60_000;
const CATEGORIES = ["groceries", "pharmacy", "parcel", "documents"] as const;
const PICKUP_CLUSTERS = [
  [0, 0],
  [2.5, 1],
  [-2, 2],
  [1, -2.5],
] as const;
const DROP_DIRECTIONS = [
  [0, 4],
  [3, 3],
  [-2, 4.5],
  [4, -1],
] as const;

function point(northKm: number, eastKm: number) {
  const latitude = 5.56 + northKm / 111.32;
  return {
    lat: latitude,
    lng: -0.2 + eastKm / (111.32 * Math.cos((latitude * Math.PI) / 180)),
  };
}

function urgency(draw: number): Urgency {
  if (draw < 0.2) return "express";
  if (draw < 0.6) return "normal";
  return "low";
}

export function generateErrandShareScenarios(options: {
  seed?: number;
  count?: number;
} = {}): SimulatedErrand[] {
  const seed = options.seed ?? DEFAULT_ERRAND_SHARE_SEED;
  const count = options.count ?? DEFAULT_ERRAND_SHARE_SCENARIO_COUNT;
  if (!Number.isInteger(count) || count <= 0) throw new Error("Scenario count must be positive");
  const random = mulberry32(seed);
  const scenarios: SimulatedErrand[] = [];

  for (let index = 0; index < count; index += 1) {
    const clusterIndex = Math.floor(random() * PICKUP_CLUSTERS.length);
    const pickupBase = PICKUP_CLUSTERS[clusterIndex];
    const direction = DROP_DIRECTIONS[clusterIndex];
    const createdAt = START + Math.floor(random() * DURATION_MS);
    const taskUrgency = urgency(random());
    const pickup = point(
      pickupBase[0] + (random() - 0.5) * 0.7,
      pickupBase[1] + (random() - 0.5) * 0.7,
    );
    const dropoff = point(
      pickupBase[0] + direction[0] + (random() - 0.5) * 1.1,
      pickupBase[1] + direction[1] + (random() - 0.5) * 1.1,
    );
    const windowEndsAt = shareWindowEndsAt(createdAt, taskUrgency);
    const task: ShareTask = {
      id: `sim-task-${index.toString().padStart(5, "0")}`,
      buyerId: `sim-buyer-${index.toString().padStart(5, "0")}`,
      urgency: taskUrgency,
      pickup,
      dropoff,
      category: pick(random, CATEGORIES),
      createdAt,
      windowEndsAt: windowEndsAt ?? createdAt,
      deadlineAt: taskUrgency === "normal" ? todayDeadlineAt(createdAt) : null,
      status: "posted",
      selectedRunnerId: null,
      shareState: taskUrgency === "express" ? "ineligible" : "waiting",
      manualRunner: false,
      stopCount: 0,
    };
    const cancellationDraw = random();
    const completionDraw = random();
    scenarios.push({
      task,
      simulatedCancellation: cancellationDraw < 0.08,
      simulatedCompletion: cancellationDraw >= 0.08 && completionDraw < 0.9,
    });
  }

  return scenarios.sort(
    (left, right) =>
      left.task.createdAt - right.task.createdAt || left.task.id.localeCompare(right.task.id),
  );
}
