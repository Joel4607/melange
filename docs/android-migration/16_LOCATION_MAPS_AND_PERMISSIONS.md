# 16 — Location, Maps, and Permissions

## Purpose

Provide location selection, runner availability, active-trip presence, buyer tracking, route display, proof GPS, and Android permission handling without collecting more location data than the current product needs.

## Current web implementation

- `map-view.tsx` renders pickup/drop-off/stops and runner location using configured tiles, Mapbox token, or OpenStreetMap fallback.
- `availability-toggle.tsx` obtains browser geolocation before going available.
- `live-location-updater.tsx` publishes runner position while appropriate.
- `/api/runner-location` authorizes the buyer of an accepted/in-progress task and reads live presence.
- `src/lib/server/presence.ts` uses optional Upstash Redis and clears presence; Postgres runner coordinates remain the matching fallback.
- Posting and proof commands validate coordinates.
- Matching and Errand-Share use haversine calculations server-side.

## Provider decision

Choose one Android map stack during project setup:

- Google Maps Compose if operational simplicity, supported devices, billing, and key restrictions fit; or
- MapLibre if retaining configurable tile-provider behavior is important.

Do not bundle both. Record provider, licensing/attribution, key restrictions, offline tile policy, and cost decision. The map visualizes server/domain data; it does not become the authoritative router or matching engine.

## Android use cases

### Posting location picker

`LocationPickerScreen(kind)` supports:

- current-location centering after in-context permission;
- pan/drop pin and explicit confirmation;
- address/label lookup only if a geocoding provider is deliberately configured;
- coordinate validation;
- return of `GeoPoint` plus optional display label.

Drop-off is optional for pickup-only errands. Stop editor allows up to five ordered points. Map selection must remain usable without continuous tracking.

### Runner availability

When a verified active runner taps Go Available:

1. explain location requirement;
2. request foreground fine/coarse permission;
3. obtain a sufficiently fresh location with timeout;
4. submit availability and coordinate;
5. show server-confirmed state.

If only approximate location is granted, decide server-side whether its accuracy is acceptable. Do not pretend a coarse point is precise.

### Active-trip presence

Phase-one safe default: foreground location updates while the app is visible and the runner is available or has active work. If continuous screen-off tracking is truly required later, design a foreground service with persistent notification, explicit disclosure, background-location policy review, battery controls, and Play policy compliance. Do not request `ACCESS_BACKGROUND_LOCATION` preemptively.

Presence payload should include coordinate, accuracy, and captured timestamp. The server rate-limits, authenticates, and applies freshness/TTL. Stop updates when unavailable, logged out, task completes/cancels, or permission is revoked.

### Buyer live tracking

Buyer detail may fetch the assigned runner only while own task is accepted/in-progress:

```text
GET /api/mobile/v1/tasks/{taskId}/runner-location
```

Return coordinate, accuracy where safe, and `capturedAt`. If stale/missing, show unavailable—not the runner's stored last coordinate as live. Never expose runner presence to feed users, unrelated buyers, or after terminal state.

### Delivery proof GPS

Capture one fresh foreground coordinate at proof time when permitted. Pair latitude/longitude or omit both. Server fraud logic compares proof/task evidence. Permission denial never produces a fabricated point.

## Permissions

Manifest may need:

```text
INTERNET
ACCESS_COARSE_LOCATION
ACCESS_FINE_LOCATION
CAMERA
POST_NOTIFICATIONS (runtime on Android 13+)
```

Avoid broad `READ_EXTERNAL_STORAGE`/`READ_MEDIA_IMAGES` by using the system Photo Picker. Do not declare background location unless the approved active-trip design requires it. Map provider metadata/key is client-visible and must be application/signature restricted.

## Permission state UX

Model `NotRequested`, `GrantedApproximate`, `GrantedPrecise`, `Denied`, and `PermanentlyDenied`. Ask from the feature action, not at first launch. A permanent denial offers a concise Settings intent. Handle revocation while the app is running and Android's one-time permission.

Location provider disabled, permission denied, timeout, and network failure are distinct errors. Going unavailable and viewing static history must not require location permission.

## Data freshness and precision

- Inject a clock and define a server-side presence TTL.
- Display “Updated X ago”; after TTL, remove live marker or label stale.
- Send only the precision needed for matching/tracking/proof.
- Never put exact coordinates in analytics, crash breadcrumbs, push payloads, route arguments, or ordinary logs.
- Room may cache task route points for participant offline viewing, encrypted/cleared per user policy; do not cache the general live runner map.

## APIs

```text
PUT /api/mobile/v1/me/availability
PUT /api/mobile/v1/me/location-presence
DELETE /api/mobile/v1/me/location-presence
GET /api/mobile/v1/tasks/{id}/runner-location
POST /api/mobile/v1/task-quotes
POST /api/mobile/v1/tasks/{id}/deliver
```

Use a presence-specific rate limit and last-write timestamp validation. The server may retain Redis graceful fallback, but Android does not know or care which store served the authorized projection.

## File plan

```text
core/location/
  LocationClient.kt
  FusedLocationClientImpl.kt
  LocationPermissionState.kt
  LocationFreshnessPolicy.kt
feature/location/
  presentation/LocationPickerViewModel.kt
  presentation/LocationPickerScreen.kt
  presentation/TaskMap.kt
  presentation/RunnerLiveMarker.kt
  data/PresenceRepository.kt
```

## Tests

- Coordinate boundaries, paired optional coordinates, and stale timestamps.
- Permission not-requested/approximate/precise/denied/permanent/revoked paths.
- Availability never succeeds locally before server response.
- Presence starts/stops with lifecycle, role, task, logout, and permission.
- Buyer/terminal/unrelated authorization matrix for runner location.
- Redis unavailable returns defined no-live-data/fallback behavior.
- Map attribution, dark mode, TalkBack descriptions, and no-location static use.

## Done criteria

- Every location collection has a visible user action/purpose and bounded lifecycle.
- No background permission or continuous tracking exists without a separately approved product/policy design.
- Stale/static/live locations cannot be confused.
