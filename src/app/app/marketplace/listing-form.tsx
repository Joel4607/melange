"use client";

import { useState, useTransition } from "react";
import { MapView } from "../map-view";
import { createListing } from "./actions";
import { MARKETPLACE_CATEGORIES } from "@/lib/marketplace-categories";

const CONDITIONS = [
  { value: "new", label: "New" },
  { value: "used_like_new", label: "Used - like new" },
  { value: "used_good", label: "Used - good" },
  { value: "used_fair", label: "Used - fair" },
] as const;

export function ListingForm() {
  const [photos, setPhotos] = useState<File[]>([]);
  const [lat, setLat] = useState<number>(5.6037);
  const [lng, setLng] = useState<number>(-0.187);
  const [deliveryOptions, setDeliveryOptions] = useState<string[]>(["pickup"]);
  const [sellerDeliveryFee, setSellerDeliveryFee] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleMapClick(newLat: number, newLng: number) {
    setLat(newLat);
    setLng(newLng);
  }

  function handleUseCurrentLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setLat(pos.coords.latitude);
      setLng(pos.coords.longitude);
    });
  }

  function toggleDeliveryOption(option: string) {
    setDeliveryOptions((prev) =>
      prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option],
    );
  }

  function submit(formData: FormData) {
    setError(null);
    formData.set("location_lat", String(lat));
    formData.set("location_lng", String(lng));
    for (const file of photos) {
      formData.append("photos", file);
    }
    for (const option of deliveryOptions) {
      formData.append("delivery_options", option);
    }
    if (deliveryOptions.includes("seller_delivery")) {
      formData.set("seller_delivery_fee", sellerDeliveryFee || "0");
    } else {
      formData.set("seller_delivery_fee", "0");
    }
    startTransition(async () => {
      try {
        await createListing(formData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <form action={submit} className="mx-auto max-w-2xl space-y-6">
      {error ? (
        <p className="rounded-xl bg-orange/10 px-4 py-2 text-sm text-orange-deep">{error}</p>
      ) : null}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink">Photos</label>
        <input
          type="file"
          name="photos_input"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => setPhotos(Array.from(e.target.files ?? []))}
          className="block w-full rounded-2xl border border-cream-deep bg-white p-3 text-sm"
        />
        {photos.length > 0 ? (
          <p className="mt-1 text-xs text-muted">{photos.length} photo(s) selected</p>
        ) : null}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink">Title</label>
          <input
            name="title"
            required
            className="w-full rounded-2xl border border-cream-deep bg-white px-4 py-2.5 text-sm outline-none focus:border-green"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink">Category</label>
          <select
            name="category"
            required
            className="w-full rounded-2xl border border-cream-deep bg-white px-4 py-2.5 text-sm outline-none focus:border-green"
          >
            <option value="">Select category</option>
            {MARKETPLACE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink">Condition</label>
          <select
            name="condition"
            required
            className="w-full rounded-2xl border border-cream-deep bg-white px-4 py-2.5 text-sm outline-none focus:border-green"
          >
            {CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink">Price (GHS)</label>
          <input
            name="price"
            type="number"
            min="0"
            step="0.01"
            defaultValue="0"
            required
            className="w-full rounded-2xl border border-cream-deep bg-white px-4 py-2.5 text-sm outline-none focus:border-green"
          />
          <p className="mt-1 text-xs text-muted">Enter 0 to give the item away for free.</p>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink">Stock</label>
          <input
            name="stock"
            type="number"
            min="1"
            step="1"
            defaultValue="1"
            required
            className="w-full rounded-2xl border border-cream-deep bg-white px-4 py-2.5 text-sm outline-none focus:border-green"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink">Contact info</label>
          <input
            name="contact_info"
            required
            placeholder="Phone, WhatsApp, or social media"
            className="w-full rounded-2xl border border-cream-deep bg-white px-4 py-2.5 text-sm outline-none focus:border-green"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink">Description</label>
        <textarea
          name="description"
          rows={4}
          className="w-full rounded-2xl border border-cream-deep bg-white px-4 py-2.5 text-sm outline-none focus:border-green"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink">Delivery options</label>
        <div className="flex flex-wrap gap-3">
          {[
            { value: "pickup", label: "Pickup" },
            { value: "seller_delivery", label: "Seller delivery" },
            { value: "runner_delivery", label: "Runner delivery" },
          ].map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
                deliveryOptions.includes(option.value)
                  ? "border-green bg-green/5 text-green-deep"
                  : "border-cream-deep bg-white text-ink hover:bg-cream/40"
              }`}
            >
              <input
                type="checkbox"
                value={option.value}
                checked={deliveryOptions.includes(option.value)}
                onChange={() => toggleDeliveryOption(option.value)}
                className="h-4 w-4 accent-green"
              />
              {option.label}
            </label>
          ))}
        </div>
        {deliveryOptions.includes("seller_delivery") ? (
          <div className="mt-3">
            <label className="mb-1.5 block text-sm font-medium text-ink">Seller delivery fee (GHS)</label>
            <input
              type="number"
              name="seller_delivery_fee"
              min="0"
              step="0.01"
              value={sellerDeliveryFee}
              onChange={(e) => setSellerDeliveryFee(e.target.value)}
              className="w-full rounded-2xl border border-cream-deep bg-white px-4 py-2.5 text-sm outline-none focus:border-green"
            />
          </div>
        ) : null}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-sm font-medium text-ink">Item location</label>
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            className="text-xs font-medium text-green-deep hover:underline"
          >
            Use my current location
          </button>
        </div>
        <MapView
          center={{ lat, lng }}
          markers={[{ lat, lng, label: "Item location", kind: "pickup" }]}
          className="h-80"
          onMapClick={handleMapClick}
        />
        <p className="mt-1 text-xs text-muted">
          Selected: {lat.toFixed(5)}, {lng.toFixed(5)}
        </p>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-2xl bg-green py-3 font-semibold text-cream transition hover:bg-green-deep disabled:opacity-60"
      >
        {isPending ? "Saving..." : "List item"}
      </button>
    </form>
  );
}
