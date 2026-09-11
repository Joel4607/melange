export const RUNNER_LOCATION_COOKIE = "melange-runner-location";

export function isRunnerLocation(value: unknown): value is { lat: number; lng: number } {
  if (!value || typeof value !== "object") return false;
  const { lat, lng } = value as { lat?: unknown; lng?: unknown };
  return typeof lat === "number" && Number.isFinite(lat) && Math.abs(lat) <= 90
    && typeof lng === "number" && Number.isFinite(lng) && Math.abs(lng) <= 180;
}

export function parseRunnerLocation(raw: string | undefined, userId: string) {
  try {
    const value = JSON.parse(raw ?? "null");
    return value?.userId === userId && isRunnerLocation(value)
      ? { lat: value.lat, lng: value.lng } : null;
  } catch {
    return null;
  }
}

export function runnerFilterParams(search: string) {
  const params = new URLSearchParams(search);
  params.delete("lat");
  params.delete("lng");
  return params;
}
