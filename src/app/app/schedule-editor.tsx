"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Trash2, LoaderCircle } from "lucide-react";
import { updateScheduledHours } from "./actions";
import type { TimeRange } from "@/lib/availability";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ScheduleEditor({
  initialSchedule,
}: {
  initialSchedule: TimeRange[] | null;
}) {
  const [entries, setEntries] = useState<TimeRange[]>(initialSchedule ?? []);
  const [day, setDay] = useState(1);
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("18:00");

  function addEntry() {
    const next = [...entries, { day, start, end }];
    next.sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
    setEntries(next);
  }

  function removeEntry(index: number) {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <form action={updateScheduledHours} className="space-y-4">
      <input type="hidden" name="schedule" value={JSON.stringify(entries)} />

      {entries.length > 0 ? (
        <ul className="space-y-2">
          {entries.map((entry, i) => (
            <li
              key={`${entry.day}-${entry.start}-${entry.end}-${i}`}
              className="flex items-center justify-between rounded-xl border border-cream-deep bg-cream/40 px-3 py-2 text-sm"
            >
              <span className="text-ink">
                {DAYS[entry.day]} · {entry.start}–{entry.end}
              </span>
              <button
                type="button"
                onClick={() => removeEntry(i)}
                className="rounded-full p-1 text-muted transition hover:text-orange-deep"
                aria-label="Remove"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No scheduled hours yet.</p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="day" className="text-xs font-medium text-muted">
            Day
          </label>
          <select
            id="day"
            value={day}
            onChange={(e) => setDay(Number(e.target.value))}
            className="rounded-xl border border-cream-deep bg-cream/40 px-3 py-2 text-sm text-ink outline-none focus:border-green-soft focus:bg-white"
          >
            {DAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="start" className="text-xs font-medium text-muted">
            Start
          </label>
          <input
            id="start"
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="rounded-xl border border-cream-deep bg-cream/40 px-3 py-2 text-sm text-ink outline-none focus:border-green-soft focus:bg-white"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="end" className="text-xs font-medium text-muted">
            End
          </label>
          <input
            id="end"
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="rounded-xl border border-cream-deep bg-cream/40 px-3 py-2 text-sm text-ink outline-none focus:border-green-soft focus:bg-white"
          />
        </div>
        <button
          type="button"
          onClick={addEntry}
          className="inline-flex items-center gap-1.5 rounded-full border border-green-soft bg-white px-3 py-2 text-sm font-medium text-green-deep transition hover:bg-cream/40"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add
        </button>
      </div>

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-green-deep disabled:opacity-60"
    >
      {pending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : null}
      Save schedule
    </button>
  );
}
