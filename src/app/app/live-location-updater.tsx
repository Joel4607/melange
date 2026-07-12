"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Navigation } from "lucide-react";
import { updateLocation } from "./actions";

const UPDATE_INTERVAL_MS = 30_000;

export function LiveLocationUpdater({ available }: { available: boolean }) {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [status, setStatus] = useState<"idle" | "updating" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const lastSent = useRef<{ lat: number; lng: number; at: number } | null>(null);

  useEffect(() => {
    if (!available) return;

    function sendLocation(lat: number, lng: number) {
      if (lastSent.current) {
        const since = Date.now() - lastSent.current.at;
        const same =
          lastSent.current.lat === lat && lastSent.current.lng === lng;
        if (since < UPDATE_INTERVAL_MS && same) return;
      }

      setStatus("updating");
      updateLocation(lat, lng)
        .then(() => {
          setCoords({ lat, lng });
          lastSent.current = { lat, lng, at: Date.now() };
          setStatus("idle");
          setError(null);
        })
        .catch(() => {
          setStatus("error");
          setError("Could not update location.");
        });
    }

    function readAndSend() {
      if (!("geolocation" in navigator)) {
        setError("Geolocation is not supported on this device.");
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => sendLocation(pos.coords.latitude, pos.coords.longitude),
        () => {
          setStatus("error");
          setError("Could not read your location.");
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    }

    readAndSend();
    const interval = setInterval(readAndSend, UPDATE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [available]);

  if (!available) return null;

  return (
    <div className="rounded-[1.5rem] border border-cream-deep bg-white p-6 shadow-sm">
      <p className="flex items-center gap-2 font-display text-lg font-semibold text-green-deep">
        <Navigation className="h-5 w-5 text-orange-deep" aria-hidden /> Live location
      </p>
      <p className="mt-1 text-sm text-muted">
        {status === "updating" ? (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-4 w-4 animate-bounce" aria-hidden /> Updating…
          </span>
        ) : coords ? (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-4 w-4" aria-hidden />
            {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
          </span>
        ) : (
          "Waiting for a GPS fix."
        )}
      </p>
      {error ? <p className="mt-2 text-sm text-orange-deep">{error}</p> : null}
    </div>
  );
}
