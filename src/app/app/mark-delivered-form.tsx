"use client";

import { useState } from "react";
import { LoaderCircle, MapPin, Navigation, Camera } from "lucide-react";
import { markDelivered } from "./actions";

export function MarkDeliveredForm({ taskId }: { taskId: string }) {
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: string; lng: string }>({
    lat: "",
    lng: "",
  });
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const hasLocation = coords.lat !== "" && coords.lng !== "";

  function useMyLocation() {
    setLocError(null);
    if (!("geolocation" in navigator)) {
      setLocError("Location isn't available on this device.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
        });
        setLocating(false);
      },
      () => {
        setLocError("Couldn't get your location. Enter it manually.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function handleSubmit(formData: FormData) {
    setPending(true);
    try {
      await markDelivered(taskId, formData);
    } finally {
      setPending(false);
    }
  }

  return (
    <form action={handleSubmit} className="mt-3 space-y-3">
      <input type="hidden" name="gps_lat" value={coords.lat} />
      <input type="hidden" name="gps_lng" value={coords.lng} />

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-green-deep">
          Delivery photo
        </span>
        <span className="flex cursor-pointer items-center gap-2 rounded-xl border border-cream-deep bg-white px-4 py-2.5 text-sm text-muted transition hover:border-green-soft">
          <Camera className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">
            {photoName ?? "Take or choose a photo"}
          </span>
          <input
            name="photo"
            type="file"
            accept="image/*"
            capture="environment"
            required
            onChange={(e) => setPhotoName(e.target.files?.[0]?.name ?? null)}
            className="sr-only"
          />
        </span>
      </label>

      <button
        type="button"
        onClick={useMyLocation}
        disabled={locating}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-green-soft bg-white px-4 py-2.5 text-sm font-medium text-green-deep transition hover:bg-cream/40 disabled:opacity-60"
      >
        {locating ? (
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Navigation className="h-4 w-4" aria-hidden />
        )}
        {hasLocation ? "Update location" : "Tag my location"}
      </button>

      {hasLocation ? (
        <p className="flex items-center gap-1.5 text-sm text-green-soft">
          <MapPin className="h-4 w-4" aria-hidden />
          Location tagged ({coords.lat}, {coords.lng})
        </p>
      ) : null}
      {locError ? (
        <p className="text-sm text-orange-deep">{locError}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !photoName || !hasLocation}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-green px-4 py-2.5 text-sm font-semibold text-cream transition hover:bg-green-deep disabled:opacity-60"
      >
        {pending ? (
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
        ) : null}
        Mark delivered
      </button>
    </form>
  );
}
