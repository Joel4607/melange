"use client";

import { useState } from "react";
import { LoaderCircle, MapPin, Navigation, Clock } from "lucide-react";
import { isRunnerAvailable, type TimeRange } from "@/lib/availability";
import { setAvailability, clearAvailabilityOverride } from "./actions";

export function AvailabilityToggle({
  availableManual,
  scheduledHours,
  lat,
  lng,
}: {
  availableManual: boolean | null;
  scheduledHours: TimeRange[] | null;
  lat: number | null;
  lng: number | null;
}) {
  const [coords, setCoords] = useState({
    lat: lat?.toString() ?? "",
    lng: lng?.toString() ?? "",
  });
  const [locating, setLocating] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasLocation = coords.lat !== "" && coords.lng !== "";
  const current = isRunnerAvailable(availableManual, scheduledHours);
  const mode =
    availableManual === true
      ? "manual-available"
      : availableManual === false
        ? "manual-unavailable"
        : "schedule";

  async function goAvailable() {
    setError(null);
    if (hasLocation) {
      setPending(true);
      try {
        await setAvailability(true, Number(coords.lat), Number(coords.lng));
      } finally {
        setPending(false);
      }
      return;
    }

    if (!("geolocation" in navigator)) {
      setError("Location is not available on this device.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const next = {
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
        };
        setCoords(next);
        setLocating(false);
        setPending(true);
        try {
          await setAvailability(true, Number(next.lat), Number(next.lng));
        } finally {
          setPending(false);
        }
      },
      () => {
        setError("Couldn't get your location. Enter it below.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function goOffline() {
    setError(null);
    setPending(true);
    try {
      await setAvailability(false, null, null);
    } finally {
      setPending(false);
    }
  }

  async function followSchedule() {
    setError(null);
    setPending(true);
    try {
      await clearAvailabilityOverride();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <span
          className={`inline-flex h-2.5 w-2.5 rounded-full ${current ? "bg-green" : "bg-cream-deep"}`}
          aria-hidden
        />
        <span className="font-medium text-ink">
          {current ? "Available" : "Unavailable"}
        </span>
        <span className="text-muted">
          {mode === "schedule"
            ? "· following schedule"
            : mode === "manual-available"
              ? "· manual override"
              : "· manual override"}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <input
          aria-label="Latitude"
          inputMode="decimal"
          placeholder="Latitude"
          value={coords.lat}
          onChange={(e) => setCoords((c) => ({ ...c, lat: e.target.value }))}
          className="w-full rounded-xl border border-cream-deep bg-cream/40 px-4 py-3 text-sm text-ink outline-none transition placeholder:text-muted focus:border-green-soft focus:bg-white"
        />
        <input
          aria-label="Longitude"
          inputMode="decimal"
          placeholder="Longitude"
          value={coords.lng}
          onChange={(e) => setCoords((c) => ({ ...c, lng: e.target.value }))}
          className="w-full rounded-xl border border-cream-deep bg-cream/40 px-4 py-3 text-sm text-ink outline-none transition placeholder:text-muted focus:border-green-soft focus:bg-white"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {current ? (
          <button
            type="button"
            onClick={goOffline}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-full border border-cream-deep px-4 py-2 text-sm font-semibold text-green-deep transition hover:bg-cream/40 disabled:opacity-60"
          >
            <MapPin className="h-4 w-4" aria-hidden />
            Go offline
          </button>
        ) : (
          <button
            type="button"
            onClick={goAvailable}
            disabled={pending || locating}
            className="inline-flex items-center gap-2 rounded-full bg-green px-4 py-2 text-sm font-semibold text-cream transition hover:bg-green-deep disabled:opacity-60"
          >
            {pending || locating ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Navigation className="h-4 w-4" aria-hidden />
            )}
            Go available
          </button>
        )}

        <button
          type="button"
          onClick={followSchedule}
          disabled={pending || mode === "schedule"}
          className="inline-flex items-center gap-2 rounded-full border border-cream-deep px-4 py-2 text-sm font-semibold text-green-deep transition hover:bg-cream/40 disabled:opacity-60"
        >
          <Clock className="h-4 w-4" aria-hidden />
          {mode === "schedule" ? "Following schedule" : "Follow schedule"}
        </button>
      </div>

      {error ? <p className="text-sm text-orange-deep">{error}</p> : null}
    </div>
  );
}
