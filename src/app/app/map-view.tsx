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

export interface LiveRunner {
  id: string;
  name: string;
  taskId: string;
  lat: number | null;
  lng: number | null;
}

export function MapView({
  center,
  markers,
  className = "h-80",
  liveRunner,
  liveIntervalMs = 5000,
}: {
  center: { lat: number; lng: number };
  markers: MapMarker[];
  className?: string;
  liveRunner?: LiveRunner | null;
  liveIntervalMs?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<ReturnType<typeof L.featureGroup> | null>(null);
  const markerRefs = useRef<Map<string, L.Marker>>(new Map());
  const runnerMarkerRef = useRef<L.Marker | null>(null);

  function fitBounds() {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;
    const bounds = group.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView([center.lat, center.lng], 14);
    const tile = getTileConfig();
    L.tileLayer(tile.url, {
      attribution: tile.attribution,
      maxZoom: 19,
    }).addTo(map);

    const group = L.featureGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;
    const markerMap = markerRefs.current;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
      markerMap.clear();
      runnerMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep pickup/dropoff markers in sync with the markers prop. When a live
  // runner is being tracked we render that marker separately so it can move
  // without being recreated on every prop update.
  useEffect(() => {
    const group = layerGroupRef.current;
    if (!group) return;

    const seen = new Set<string>();
    for (const m of markers) {
      if (liveRunner && m.kind === "runner") continue;
      const key = m.kind === "runner" ? `runner:${m.label}` : m.kind;
      seen.add(key);
      const existing = markerRefs.current.get(key);
      if (existing) {
        existing.setLatLng([m.lat, m.lng]);
        existing.setPopupContent?.(m.label);
      } else {
        const marker = L.marker([m.lat, m.lng], { icon: markerIcon(m.kind) })
          .addTo(group as unknown as L.LayerGroup)
          .bindPopup(m.label);
        markerRefs.current.set(key, marker);
      }
    }

    markerRefs.current.forEach((marker, key) => {
      if (!seen.has(key)) {
        group.removeLayer(marker);
        markerRefs.current.delete(key);
      }
    });

    fitBounds();
  }, [markers, liveRunner]);

  // Track the live runner: create/update a dedicated marker and poll the
  // server for fresh Redis-backed (or Postgres fallback) GPS pings.
  useEffect(() => {
    const group = layerGroupRef.current;
    const map = mapRef.current;
    if (!group || !map) return;

    if (!liveRunner) {
      if (runnerMarkerRef.current) {
        group.removeLayer(runnerMarkerRef.current);
        runnerMarkerRef.current = null;
      }
      return;
    }

    const runner = liveRunner;
    const runnerLabel = runner.name;

    function setRunnerMarker(lat: number, lng: number) {
      if (runnerMarkerRef.current) {
        runnerMarkerRef.current.setLatLng([lat, lng]);
      } else {
        runnerMarkerRef.current = L.marker([lat, lng], { icon: markerIcon("runner") })
          .addTo(group as unknown as L.LayerGroup)
          .bindPopup(runnerLabel);
      }
      fitBounds();
    }

    if (runner.lat != null && runner.lng != null) {
      setRunnerMarker(runner.lat, runner.lng);
    }

    const controller = new AbortController();
    async function poll() {
      try {
        const res = await fetch(`/api/runner-location?taskId=${encodeURIComponent(runner.taskId)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { lat: number; lng: number } | null;
        if (data?.lat != null && data?.lng != null) {
          setRunnerMarker(data.lat, data.lng);
        }
      } catch {
        // AbortError is expected on unmount; ignore other transient errors.
      }
    }

    poll();
    const interval = setInterval(poll, liveIntervalMs);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [liveRunner, liveIntervalMs]);

  return <div ref={containerRef} className={`w-full rounded-[1.25rem] ${className}`} />;
}

function markerIcon(kind: "pickup" | "dropoff" | "runner") {
  const color = kind === "pickup" ? "#d9641c" : kind === "dropoff" ? "#133c21" : "#2563eb";
  return L.divIcon({
    className: "border-0",
    html: `<div style="height:24px;width:24px;border-radius:50%;border:2px solid #fff;background-color:${color};box-shadow:0 1px 3px rgba(0,0,0,0.3)" aria-hidden="true"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function getTileConfig() {
  const customUrl = process.env.NEXT_PUBLIC_MAP_TILE_URL;
  const customAttribution = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION;
  if (customUrl) {
    return {
      url: customUrl,
      attribution:
        customAttribution ??
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    };
  }

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (mapboxToken) {
    return {
      url: `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`,
      attribution:
        '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    };
  }

  return {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  };
}
