export interface TimeRange {
  day: number; // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  start: string; // "HH:mm"
  end: string; // "HH:mm"
}

/**
 * Determine whether a runner is currently available.
 *
 * 1. If the runner has set a manual override (`availableManual` is not null), use it.
 * 2. Otherwise fall back to scheduled working hours.
 * 3. If no schedule is set, default to unavailable.
 */
export function isRunnerAvailable(
  availableManual: boolean | null,
  scheduledHours: TimeRange[] | null,
  now: Date = new Date(),
): boolean {
  if (availableManual != null) return availableManual;
  if (!scheduledHours || scheduledHours.length === 0) return false;

  const day = now.getDay();
  const time = now.getHours() * 60 + now.getMinutes();

  for (const range of scheduledHours) {
    if (range.day !== day) continue;
    const [startH, startM] = range.start.split(":").map(Number);
    const [endH, endM] = range.end.split(":").map(Number);
    if (Number.isNaN(startH) || Number.isNaN(startM) || Number.isNaN(endH) || Number.isNaN(endM)) {
      continue;
    }
    const start = startH * 60 + startM;
    const end = endH * 60 + endM;
    if (time >= start && time < end) return true;
  }

  return false;
}
