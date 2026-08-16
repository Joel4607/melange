# 06 — Profile, Settings, and Availability

## Purpose

Rebuild personal profile editing, notification preferences, runner availability, scheduled hours, public capability summary, trust history, account status, and sign-out.

## Current web implementation

- `src/app/app/settings/page.tsx` loads profile, runner profile, verification, ratings, completed work, trust events, and preferences.
- `updateProfile` updates name/phone.
- `updateNotificationPreferences` controls in-app, push, email, and Telegram channels.
- `availability-toggle.tsx`, `setAvailability`, and `clearAvailabilityOverride` implement a manual override.
- `schedule-editor.tsx` and `updateScheduledHours` manage day/time ranges.
- `capabilities-editor.tsx` and `updateCapabilities` manage errand categories.
- `src/lib/availability.ts` computes effective availability from manual override and schedule.
- Going available requires valid coordinates, verified identity, and active runner status; going unavailable clears presence.

## Android screen structure

`SettingsScreen` is a scrollable list of focused destinations/sections:

- Profile: name, phone, email (read-only unless an email-change flow is implemented), account role.
- Notifications: in-app, Android push, email, Telegram preferences.
- Runner identity: verification state and entry to verification.
- Runner work settings: availability, schedule, capabilities.
- Runner public summary: trust score, buyer rating, total earned, recent trust events.
- Admin entry when `isAdmin`.
- Appearance/accessibility preferences.
- Sign out.

Long editors should be separate screens or sheets rather than one oversized form.

## Profile contract

```text
GET   /api/mobile/v1/me
PATCH /api/mobile/v1/me
```

`PATCH /me` accepts trimmed `name` and `phone`. Keep the live server's permissive optional-phone behavior, but require a nonblank display name unless the backend explicitly supports empty names. Return the updated profile. Email remains managed by Supabase Auth and is not silently changed through the profile table.

## Notification preferences

```text
GET   /api/mobile/v1/me/preferences
PATCH /api/mobile/v1/me/preferences
```

Fields: `notifyInApp`, `notifyPush`, `notifyEmail`, `notifyTelegram`. Android runtime notification permission is separate from the server preference. UI states must explain combinations such as push preference enabled but OS permission denied.

Do not register an FCM token when the user disables push. On disable or logout, remove the device token through the server. Email/Telegram sending remains server-side.

## Availability contract

```text
GET    /api/mobile/v1/me/runner-profile
PUT    /api/mobile/v1/me/availability
DELETE /api/mobile/v1/me/availability/override
PUT    /api/mobile/v1/me/schedule
PUT    /api/mobile/v1/me/capabilities
```

Availability request:

```json
{
  "available": true,
  "location": { "lat": 5.6037, "lng": -0.1870 }
}
```

Server requirements when `available=true`: authenticated runner, verified profile, active runner status, finite valid coordinate. When false, clear optional Redis presence and update runner state. Clearing the override recalculates effective availability from scheduled hours and verification.

## Schedule model

Model the current `day`, `start`, `end` ranges explicitly:

```kotlin
data class AvailabilityWindow(
    val dayOfWeek: DayOfWeek,
    val start: LocalTime,
    val end: LocalTime
)
```

Serialize to the BFF's stable representation, not locale-formatted strings. The current stored contract uses day `0=Sunday` through `6=Saturday` and 24-hour `HH:mm` strings. Validate supported day values, `start < end`, non-overlap for the same day, and a bounded number of windows. Standardize the shared server evaluator on `Africa/Accra` rather than its current runtime-local clock. The server is authoritative; device timezone changes must not alter runner availability.

## Capabilities

Use the server's canonical category list. An empty capability set currently means the generic “Any Other Errand” behavior in matching; preserve that semantic and explain it in UI. Do not allow arbitrary categories that cannot match posted tasks. Errand-Share group matching requires the union of both member categories, so a runner must satisfy every required capability.

## Availability UX and permissions

- Show effective state plus its source: `Available (manual)`, `Unavailable (manual)`, or `Following schedule`.
- Ask for foreground location only after the runner chooses to go available.
- If permission is denied, explain the need and keep them unavailable; offer Settings only after permanent denial.
- If location is temporarily unavailable, allow retry. Do not reuse a stale coordinate without an explicit freshness policy.
- Going unavailable must work without location permission.
- A verified badge in UI is not proof; refresh authoritative runner status before enabling.

## ViewModels

- `SettingsViewModel`: profile/preferences/account summary and sign-out effect.
- `AvailabilityViewModel`: location permission effect, command progress, authoritative state.
- `ScheduleViewModel`: editable draft, validation, save/conflict handling.
- `CapabilitiesViewModel`: canonical choices, draft, save.

Keep unsaved drafts in `SavedStateHandle`, excluding sensitive data. Do not optimistically claim the runner is available until the server confirms.

## Loading and errors

- Render cached settings as stale where safe; availability must clearly show when server state is unknown.
- 403 maps to verification or account-restriction guidance.
- Permission denial is not a network error.
- Location timeout and invalid schedule show actionable local messages.
- Save failures preserve drafts; successful saves update Room and show a one-time confirmation.

## Security

- Only the signed-in user may edit their profile/preferences/runner profile.
- Server protects runner trust, verified/status fields, active load, and admin flag from client edits.
- Do not expose precise current runner coordinates in general settings logs or analytics.
- Signing out clears caches, tokens, presence where possible, subscriptions, and background jobs.

## File plan

```text
feature/profile/
  data/ProfileApi.kt
  data/ProfileRepositoryImpl.kt
  domain/ProfileRepository.kt
  domain/AvailabilityWindow.kt
  presentation/SettingsScreen.kt
  presentation/ProfileEditScreen.kt
  presentation/AvailabilityViewModel.kt
  presentation/ScheduleEditorScreen.kt
  presentation/CapabilitiesScreen.kt
  presentation/NotificationPreferencesScreen.kt
```

## Tests

- Profile trim/validation and failed-save draft retention.
- Push preference versus Android permission combinations.
- Availability requires runner, verified, active, and fresh valid location.
- Going unavailable and clearing override work without location.
- Accra-time schedule evaluation at day boundaries.
- Overlap/invalid time/category validation.
- Server rejects edits to protected runner/profile fields.

## Done criteria

- All settings in the web page are represented or explicitly deferred.
- Availability source, verification restriction, permission state, and server state cannot be confused.
- Profile and preference updates are safe under retry and account switching.
