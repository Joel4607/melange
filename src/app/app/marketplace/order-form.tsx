"use client";

import { useState, useTransition } from "react";
import { MapView } from "../map-view";
import { createOrder } from "./actions";
import type { ListingRow } from "@/lib/server/rows";
import { computeMarketplaceFees } from "@/lib/server/marketplace";

export function OrderForm({ listing }: { listing: ListingRow }) {
  const [deliveryOption, setDeliveryOption] = useState<string>(listing.delivery_options[0] ?? "pickup");
  const [deliveryLat, setDeliveryLat] = useState<number | null>(null);
  const [deliveryLng, setDeliveryLng] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sellerLocation = {
    lat: listing.location_lat,
    lng: listing.location_lng,
  };
  const buyerLocation = deliveryLat != null && deliveryLng != null ? { lat: deliveryLat, lng: deliveryLng } : null;
  const fees = computeMarketplaceFees(
    Number(listing.price),
    Number(listing.seller_delivery_fee),
    deliveryOption as "pickup" | "seller_delivery" | "runner_delivery",
    sellerLocation,
    buyerLocation,
    "normal",
  );

  function handleMapClick(lat: number, lng: number) {
    setDeliveryLat(lat);
    setDeliveryLng(lng);
  }

  function handleUseCurrentLocation() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setDeliveryLat(pos.coords.latitude);
          setDeliveryLng(pos.coords.longitude);
        },
        () => setError("Could not get your location"),
      );
    } else {
      setError("Geolocation is not supported");
    }
  }

  function submit(formData: FormData) {
    setError(null);
    if (deliveryOption === "seller_delivery" && (deliveryLat == null || deliveryLng == null)) {
      setError("Select a delivery location on the map or use your current location");
      return;
    }
    formData.set("delivery_option", deliveryOption);
    if (deliveryLat != null) formData.set("delivery_lat", String(deliveryLat));
    if (deliveryLng != null) formData.set("delivery_lng", String(deliveryLng));
    startTransition(async () => {
      try {
        await createOrder(listing.id, formData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <form action={submit} className="space-y-5">
      {error ? (
        <p className="rounded-xl bg-orange/10 px-4 py-2 text-sm text-orange-deep">{error}</p>
      ) : null}

      <div className="space-y-2">
        <p className="text-sm font-medium text-ink">Delivery option</p>
        {listing.delivery_options.map((opt) => (
          <label
            key={opt}
            className={`flex cursor-pointer items-center justify-between rounded-2xl border px-4 py-3 transition ${
              deliveryOption === opt
                ? "border-green bg-green/5"
                : "border-cream-deep bg-white hover:bg-cream/40"
            }`}
          >
            <span className="text-sm font-medium text-green-deep">
              {opt === "pickup" ? "Pickup" : "Seller delivery"}
            </span>
            <input
              type="radio"
              name="delivery_option"
              value={opt}
              checked={deliveryOption === opt}
              onChange={(e) => setDeliveryOption(e.target.value)}
              className="h-4 w-4 accent-green"
            />
          </label>
        ))}
      </div>

      {deliveryOption === "seller_delivery" ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-ink">Delivery location</p>
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              className="text-xs font-medium text-green-deep hover:underline"
            >
              Use my location
            </button>
          </div>
          <MapView
            center={sellerLocation}
            markers={
              deliveryLat != null && deliveryLng != null
                ? [
                    { lat: sellerLocation.lat, lng: sellerLocation.lng, label: "Seller", kind: "pickup" },
                    { lat: deliveryLat, lng: deliveryLng, label: "Delivery", kind: "dropoff" },
                  ]
                : [{ lat: sellerLocation.lat, lng: sellerLocation.lng, label: "Seller", kind: "pickup" }]
            }
            className="h-64"
            onMapClick={handleMapClick}
          />
          {deliveryLat != null && deliveryLng != null ? (
            <p className="text-xs text-muted">
              Selected: {deliveryLat.toFixed(5)}, {deliveryLng.toFixed(5)}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-2xl border border-cream-deep bg-cream/40 p-4">
        <div className="flex justify-between text-sm">
          <span className="text-muted">Item</span>
          <span className="font-medium text-ink">GHS {fees.price.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted">Delivery</span>
          <span className="font-medium text-ink">GHS {fees.deliveryFee.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted">Platform fee</span>
          <span className="font-medium text-ink">GHS {fees.platformFee.toFixed(2)}</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-cream-deep pt-2 font-display font-semibold text-green-deep">
          <span>You pay</span>
          <span>GHS {fees.total.toFixed(2)}</span>
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-2xl bg-green py-3 font-semibold text-cream transition hover:bg-green-deep disabled:opacity-60"
      >
        {isPending ? "Processing..." : fees.total > 0 ? `Pay GHS ${fees.total.toFixed(2)}` : "Reserve free item"}
      </button>
    </form>
  );
}
