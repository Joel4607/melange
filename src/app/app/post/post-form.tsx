"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle, MapPin, Navigation, Star, User } from "lucide-react";
import { createErrand } from "../actions";

export const CATEGORIES = [
  "Market Runs",
  "Grocery Shopping",
  "Pharmacy Pickup",
  "Clothes & Apparel",
  "Pickup & Delivery",
  "Household Items",
  "Gifts & Occasions",
  "Any Other Errand",
] as const;

const URGENCIES: { value: string; label: string; hint: string }[] = [
  { value: "low", label: "Whenever", hint: "No rush" },
  { value: "normal", label: "Today", hint: "Standard" },
  { value: "express", label: "ASAP", hint: "Express" },
];

function fromCents(cents: number): number {
  return Math.max(0, cents) / 100;
}

export function PostForm({
  preselectedRunner,
  defaultCategory,
}: {
  preselectedRunner?: {
    id: string;
    name: string | null;
    trustScore: number;
    capabilities: string[] | null;
  };
  defaultCategory?: string;
}) {
  const [coords, setCoords] = useState<{ lat: string; lng: string }>({
    lat: "",
    lng: "",
  });
  const [dropoffCoords, setDropoffCoords] = useState<{ lat: string; lng: string }>({
    lat: "",
    lng: "",
  });
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [urgency, setUrgency] = useState("normal");
  const [price, setPrice] = useState("50");

  const hasLocation = coords.lat !== "" && coords.lng !== "";
  const hasDropoff = dropoffCoords.lat !== "" && dropoffCoords.lng !== "";

  const priceNum = Math.max(0, Number(price) || 0);
  const priceCents = Math.round(priceNum * 100);
  const feeCents = Math.round(priceCents * 0.1);
  const runnerPayout = fromCents(priceCents - feeCents);

  const categoryDefault =
    defaultCategory && CATEGORIES.includes(defaultCategory as (typeof CATEGORIES)[number])
      ? defaultCategory
      : "Market Runs";

  function useMyLocation() {
    setLocError(null);
    if (!("geolocation" in navigator)) {
      setLocError("Location isn't available on this device — enter it below.");
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
        setLocError("Couldn't get your location — enter it manually below.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <form action={createErrand} className="space-y-6">
      {preselectedRunner ? (
        <div className="rounded-2xl border border-cream-deep bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Requesting this runner
          </p>
          <div className="mt-2 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-green text-cream">
              <User className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="font-display text-lg font-semibold text-green-deep">
                {preselectedRunner.name ?? "A trusted runner"}
              </p>
              <p className="flex items-center gap-2 text-sm text-muted">
                <span className="inline-flex items-center gap-1 text-green-soft">
                  <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
                  {(preselectedRunner.trustScore * 5).toFixed(1)}
                </span>
                {preselectedRunner.capabilities?.length ? (
                  <span className="text-xs text-muted">
                    · {preselectedRunner.capabilities.slice(0, 3).join(", ")}
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          <input type="hidden" name="runner_id" value={preselectedRunner.id} />
        </div>
      ) : null}

      <Field label="What do you need run?">
        <input
          name="title"
          required
          placeholder="e.g. Pick up jollof from Auntie's Kitchen"
          className={inputClass}
        />
      </Field>

      <Field label="Details (optional)">
        <textarea
          name="description"
          rows={3}
          placeholder="Brands, sizes, where to drop it off, anything the runner should know."
          className={`${inputClass} resize-none`}
        />
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Category">
          <select name="category" defaultValue={categoryDefault} className={inputClass}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Budget (GHS)">
          <input
            name="price"
            type="number"
            min={0}
            step="1"
            required
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={inputClass}
          />
          <p className="mt-2 text-sm text-muted">
            Includes a 10% platform fee. Runner receives GHS {runnerPayout.toFixed(2)}.
          </p>
        </Field>
      </div>

      <Field label="How soon?">
        <input type="hidden" name="urgency" value={urgency} />
        <div className="grid grid-cols-3 gap-2.5">
          {URGENCIES.map((u) => {
            const active = urgency === u.value;
            return (
              <button
                type="button"
                key={u.value}
                onClick={() => setUrgency(u.value)}
                className={`rounded-2xl border px-3 py-3 text-center transition ${
                  active
                    ? "border-green bg-green text-cream"
                    : "border-cream-deep bg-cream/40 text-green-deep hover:bg-white"
                }`}
              >
                <span className="block text-sm font-semibold">{u.label}</span>
                <span
                  className={`block text-xs ${active ? "text-cream/80" : "text-muted"}`}
                >
                  {u.hint}
                </span>
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Pickup location">
        <input type="hidden" name="pickup_lat" value={coords.lat} />
        <input type="hidden" name="pickup_lng" value={coords.lng} />
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-green-soft bg-white px-4 py-3 font-medium text-green-deep transition hover:bg-cream/40 disabled:opacity-60"
        >
          {locating ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Navigation className="h-4 w-4" aria-hidden />
          )}
          {hasLocation ? "Update my location" : "Use my current location"}
        </button>

        {hasLocation ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-green-soft">
            <MapPin className="h-4 w-4" aria-hidden />
            Pickup set ({coords.lat}, {coords.lng})
          </p>
        ) : null}
        {locError ? (
          <p className="mt-2 text-sm text-orange-deep">{locError}</p>
        ) : null}

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <input
            aria-label="Pickup latitude"
            inputMode="decimal"
            placeholder="Latitude"
            value={coords.lat}
            onChange={(e) => setCoords((c) => ({ ...c, lat: e.target.value }))}
            className={`${inputClass} text-sm`}
          />
          <input
            aria-label="Pickup longitude"
            inputMode="decimal"
            placeholder="Longitude"
            value={coords.lng}
            onChange={(e) => setCoords((c) => ({ ...c, lng: e.target.value }))}
            className={`${inputClass} text-sm`}
          />
        </div>
      </Field>

      <Field label="Dropoff location (optional)">
        <input type="hidden" name="dropoff_lat" value={dropoffCoords.lat} />
        <input type="hidden" name="dropoff_lng" value={dropoffCoords.lng} />
        <button
          type="button"
          onClick={() => setDropoffCoords(coords)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-cream-deep bg-cream/40 px-4 py-3 font-medium text-green-deep transition hover:bg-white"
        >
          <MapPin className="h-4 w-4" aria-hidden />
          Same as pickup
        </button>

        {hasDropoff ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-green-soft">
            <MapPin className="h-4 w-4" aria-hidden />
            Dropoff set ({dropoffCoords.lat}, {dropoffCoords.lng})
          </p>
        ) : null}

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <input
            aria-label="Dropoff latitude"
            inputMode="decimal"
            placeholder="Latitude"
            value={dropoffCoords.lat}
            onChange={(e) => setDropoffCoords((c) => ({ ...c, lat: e.target.value }))}
            className={`${inputClass} text-sm`}
          />
          <input
            aria-label="Dropoff longitude"
            inputMode="decimal"
            placeholder="Longitude"
            value={dropoffCoords.lng}
            onChange={(e) => setDropoffCoords((c) => ({ ...c, lng: e.target.value }))}
            className={`${inputClass} text-sm`}
          />
        </div>
      </Field>

      <Submit disabled={!hasLocation} preselectedRunner={preselectedRunner} />
    </form>
  );
}

function Submit({
  disabled,
  preselectedRunner,
}: {
  disabled: boolean;
  preselectedRunner?: { name: string | null };
}) {
  const { pending } = useFormStatus();
  const runnerName = preselectedRunner?.name ?? "this runner";
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="flex w-full items-center justify-center gap-2 rounded-full bg-orange px-6 py-3.5 font-semibold text-white shadow-sm transition hover:bg-orange-deep disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <>
          <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden /> Sending request…
        </>
      ) : preselectedRunner ? (
        `Request ${runnerName}`
      ) : (
        "Post errand & match a runner"
      )}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-green-deep">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-cream-deep bg-cream/40 px-4 py-3 text-ink outline-none transition placeholder:text-muted focus:border-green-soft focus:bg-white";
