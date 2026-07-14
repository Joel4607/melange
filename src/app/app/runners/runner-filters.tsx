"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle, MapPin, Navigation } from "lucide-react";

export function RunnerFilters({
  categories,
  buyerLocation,
}: {
  categories: string[];
  buyerLocation: { lat: number; lng: number } | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (value) {
        sp.set(key, value);
      } else {
        sp.delete(key);
      }
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  function useMyLocation() {
    setLocError(null);
    if (!("geolocation" in navigator)) {
      setLocError("Location isn't available on this device.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const sp = new URLSearchParams(searchParams.toString());
        sp.set("lat", pos.coords.latitude.toFixed(6));
        sp.set("lng", pos.coords.longitude.toFixed(6));
        if (sp.get("sort") !== "distance") {
          sp.set("sort", "distance");
        }
        router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
        setLocating(false);
      },
      () => {
        setLocError("Couldn't get your location.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function clearLocation() {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("lat");
    sp.delete("lng");
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }

  const category = searchParams.get("category") ?? "";
  const minTrust = searchParams.get("minTrust") ?? "";
  const sort = searchParams.get("sort") ?? "trust";

  return (
    <div className="mt-6 rounded-2xl border border-cream-deep bg-white p-5 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FilterField label="Category">
          <select
            value={category}
            onChange={(e) => setParam("category", e.target.value || null)}
            className={inputClass}
          >
            <option value="">Any</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Min rating">
          <select
            value={minTrust}
            onChange={(e) => setParam("minTrust", e.target.value || null)}
            className={inputClass}
          >
            <option value="">Any</option>
            <option value="4">4★ & up</option>
            <option value="3">3★ & up</option>
            <option value="2">2★ & up</option>
            <option value="1">1★ & up</option>
          </select>
        </FilterField>

        <FilterField label="Sort by">
          <select
            value={sort}
            onChange={(e) => setParam("sort", e.target.value)}
            className={inputClass}
          >
            <option value="trust">Best rated</option>
            <option value="distance">Nearest</option>
          </select>
        </FilterField>

        <FilterField label="Your location">
          <div className="flex gap-2">
            {buyerLocation ? (
              <button
                type="button"
                onClick={clearLocation}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-cream-deep bg-cream/40 px-3 py-2.5 text-sm font-medium text-green-deep transition hover:bg-white"
              >
                <MapPin className="h-4 w-4" aria-hidden />
                Clear location
              </button>
            ) : (
              <button
                type="button"
                onClick={useMyLocation}
                disabled={locating}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-green-soft bg-white px-3 py-2.5 text-sm font-medium text-green-deep transition hover:bg-cream/40 disabled:opacity-60"
              >
                {locating ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Navigation className="h-4 w-4" aria-hidden />
                )}
                Use my location
              </button>
            )}
          </div>
          {locError ? <p className="mt-2 text-xs text-orange-deep">{locError}</p> : null}
        </FilterField>
      </div>

      {buyerLocation ? (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-green-soft">
          <MapPin className="h-4 w-4" aria-hidden />
          Location set ({buyerLocation.lat.toFixed(5)}, {buyerLocation.lng.toFixed(5)})
        </p>
      ) : null}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-cream-deep bg-cream/40 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-green-soft focus:bg-white";
