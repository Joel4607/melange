"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface MapMarker {
  lat: number;
  lng: number;
  label: string;
  kind: "pickup" | "dropoff" | "runner";
}

export function MapView({
  center,
  markers,
  className = "h-80",
}: {
  center: { lat: number; lng: number };
  markers: MapMarker[];
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current).setView([center.lat, center.lng], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const bounds = L.latLngBounds([]);
    markers.forEach((m) => {
      const marker = L.marker([m.lat, m.lng], { icon: markerIcon(m.kind) })
        .addTo(map)
        .bindPopup(m.label);
      bounds.extend(marker.getLatLng());
    });

    if (markers.length > 1) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }

    return () => {
      map.remove();
    };
  }, [center, markers]);

  return <div ref={containerRef} className={`w-full rounded-[1.25rem] ${className}`} />;
}

function markerIcon(kind: "pickup" | "dropoff" | "runner") {
  const color =
    kind === "pickup" ? "#d9641c" : kind === "dropoff" ? "#133c21" : "#2563eb";
  return L.divIcon({
    className: "border-0",
    html: `<div style="height:24px;width:24px;border-radius:50%;border:2px solid #fff;background-color:${color};box-shadow:0 1px 3px rgba(0,0,0,0.3)" aria-hidden="true"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}
