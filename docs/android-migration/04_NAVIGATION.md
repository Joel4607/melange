# 04 — Navigation

## Purpose

Replace URL routing and the responsive web sidebar with typed Navigation Compose graphs optimized for buyer, runner, and admin mobile workflows.

## Current web navigation

`src/app/app/dashboard-shell.tsx` shows role-specific side navigation:

- buyer: Dashboard, Browse runners, Post errand, Wallet, Settings;
- runner: Dashboard, Open errands, Earnings, Settings.

Notifications are a header popover plus full page. Task detail, verification, post, and admin pages sit outside or alongside the dashboard shell. Middleware gates authenticated pages and individual pages redirect incorrect roles.

## Root navigation state

```text
Bootstrap
  |-- Signed out -> AuthGraph
  |     |-- RoleSelection
  |     |-- Login
  |     |-- SignUp(role)
  |     `-- EmailConfirmation
  |
  `-- Signed in -> RoleGraph
        |-- BuyerGraph
        |-- RunnerGraph
        `-- optional AdminGraph entry when isAdmin
```

Do not make the start destination depend on a transient default before session bootstrap completes. Use a root state switch or separate NavHosts so back cannot return to authenticated screens after logout.

## Buyer graph

Bottom destinations:

```text
Dashboard | Runners | Post | Wallet
```

Settings/Profile and Notifications are top-app-bar actions. Nested destinations:

```text
BuyerDashboard
  `-- ErrandDetail(taskId)
RunnerDirectory
  |-- RunnerFilterSheet
  `-- PostErrand(prefilledRunnerId, category)
PostErrand
  |-- LocationPicker(kind)
  |-- StopEditor
  `-- ErrandDetail(createdTaskId)
Wallet
  `-- TopUpSheet
Settings
Notifications
RunnerVerification is not reachable for buyer
```

## Runner graph

Bottom destinations:

```text
Dashboard | Opportunities | Earnings | Settings
```

Nested destinations:

```text
RunnerDashboard
  `-- ErrandDetail(taskId)
Opportunities
  |-- OpportunityFilterSheet (only if backed by supported server filters)
  `-- ErrandDetail(taskId or memberTaskId)
Earnings
Settings
  |-- AvailabilitySheet
  |-- ScheduleEditor
  |-- CapabilityEditor
  `-- RunnerVerification
Notifications
```

An Errand-Share opportunity is one feed/detail concept keyed by `groupId`, but after assignment the route can open a member `taskId` for proof/chat/completion. Navigation models must distinguish `TaskDetail(taskId)` from `ShareOpportunity(groupId)`.

## Admin graph

Use a modal drawer or admin home list rather than adding admin destinations to every user's bottom bar. Recommended routes:

```text
AdminHome
  |-- VerificationQueue -> VerificationReview(requestId)
  |-- DisputeQueue -> DisputeReview(disputeId)
  |-- FraudQueue -> FraudReview(flagId)
  |-- TrustDirectory -> RunnerTrustDetail(runnerId)
  |-- AuditLog
  `-- TelegramLink
```

Phase one may open the secure web admin through a Custom Tab for advanced screens. If so, document that as a deliberate scope boundary and retain native session separation; do not inject service credentials into a WebView.

## Typed destinations

Use serializable/type-safe route objects supported by the selected Navigation Compose version:

```kotlin
sealed interface AppDestination {
    data object Dashboard : AppDestination
    data class TaskDetail(val taskId: String) : AppDestination
    data class ShareOpportunity(val groupId: String) : AppDestination
    data class PostErrand(
        val runnerId: String? = null,
        val category: String? = null
    ) : AppDestination
}
```

Pass stable IDs and small filter primitives only. Never pass a full task, token, signed media URL, other buyer details, or mutable form through route arguments or `SavedStateHandle`.

## Deep links

Allowlisted HTTPS links:

```text
/app/errands/{taskId}        -> TaskDetail
/app/notifications           -> Notifications
/app/verify                  -> RunnerVerification
```

Add a mobile-specific group link if notifications need it. Deep-link flow:

1. parse and validate host/path/UUID;
2. save a typed pending destination in memory;
3. complete authentication/bootstrap;
4. verify access by loading the BFF projection;
5. navigate or show privacy-safe not found.

## Mobile component choices

- `NavigationBar`: four primary destinations.
- `TopAppBar`: title, notifications, settings/back actions.
- `ModalNavigationDrawer`: admin/secondary destinations only where helpful.
- `ModalBottomSheet`: filters, status explanation, top-up, short editors.
- Full screen: forms, maps, proof, verification, chat/detail.
- `AlertDialog`: cancel, decline, sign-out, or other short confirmation.

Preserve each bottom-tab back stack if the chosen navigation setup supports it. Reselecting a tab returns to its root; system back leaves nested screens first, then the app according to Android convention.

## Navigation ownership

Screens emit navigation effects; ViewModels do not hold `NavController`. The app navigation layer interprets effects. Domain repositories never navigate. A route guard may redirect after loading authoritative context, but must avoid loops and should show a clear restricted state when appropriate.

## Tests

- Signed-out and signed-in start destinations do not flash the wrong graph.
- Buyer, runner, unverified runner, restricted runner, and admin route matrices.
- Logout removes authenticated back stack.
- Valid task notification deep link authenticates then opens detail.
- Invalid UUID, unrecognized host, and unauthorized resource produce safe outcomes.
- Tab reselection/back stack and process recreation retain IDs, not sensitive models.

## Done criteria

- Every current web application route is mapped, deliberately omitted, or retained on secure web admin.
- Role and resource guards work on cold deep links as well as in-app navigation.
- No sensitive values appear in route strings, logs, saved state, or notification intents.
