import type { GeoPoint, Urgency } from "@/lib/algorithm";
import { haversineKm } from "@/lib/algorithm";

export interface FeeEstimate {
  distanceKm: number;
  fee: number;
  runnerPayout: number;
}

const URGENCY_MULTIPLIER: Record<Urgency, number> = {
  low: 1,
  normal: 1.2,
  express: 1.5,
};

/**
 * Estimate the platform fee for an errand using straight-line distance and urgency.
 *
 * This is intentionally simple: a base fee plus a per-kilometer charge, scaled
 * by urgency. Road-network distance and waiting-time surcharges are noted as
 * future refinements.
 */
export function estimateFee(distanceKm: number, urgency: Urgency): number {
  const base = 2.0;
  const perKm = 1.0;
  const multiplier = URGENCY_MULTIPLIER[urgency] ?? 1;
  const fee = (base + Math.max(0, distanceKm) * perKm) * multiplier;
  return Math.round(fee * 100) / 100;
}

export function estimateErrandFee(
  price: number,
  pickup: GeoPoint,
  dropoff: GeoPoint | null,
  urgency: Urgency,
): FeeEstimate {
  const distanceKm = dropoff ? haversineKm(pickup, dropoff) : 0;
  const fee = estimateFee(distanceKm, urgency);
  return {
    distanceKm,
    fee,
    runnerPayout: Math.max(0, price - fee),
  };
}
