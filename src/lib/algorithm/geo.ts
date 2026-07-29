import type { GeoPoint } from "./types";

export interface TaskStop extends GeoPoint {
  label?: string | null;
  sequence?: number;
}

const EARTH_RADIUS_KM = 6371;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle (Haversine) distance between two coordinates, in kilometres.
 *
 * Straight-line distance is used deliberately for simplicity and to avoid a
 * routing-API dependency; road-network distance is noted as future work.
 */
export function routeDistance(points: GeoPoint[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    d += haversineKm(points[i - 1], points[i]);
  }
  return d;
}

export function taskRoutePoints(
  pickup: GeoPoint,
  dropoff: GeoPoint | null,
  stops?: GeoPoint[],
): GeoPoint[] {
  const points: GeoPoint[] = [pickup];
  if (stops?.length) points.push(...stops);
  if (dropoff) {
    points.push(dropoff);
  } else if (stops?.length) {
    points.push(pickup);
  }
  return points;
}

export function taskFinalPoint(
  pickup: GeoPoint,
  dropoff: GeoPoint | null,
  stops?: GeoPoint[],
): GeoPoint {
  const points = taskRoutePoints(pickup, dropoff, stops);
  return points[points.length - 1];
}

export function taskRouteDistance(
  pickup: GeoPoint,
  dropoff: GeoPoint | null,
  stops?: GeoPoint[],
): number {
  return routeDistance(taskRoutePoints(pickup, dropoff, stops));
}

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
