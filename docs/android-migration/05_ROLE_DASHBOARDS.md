# 05 — Role Dashboards

## Purpose

Provide a fast, role-specific home surface with current work, useful totals, and direct next actions while avoiding desktop dashboard density.

## Current web implementation

- `src/app/app/page.tsx` resolves role, profile, tasks, wallet, ratings, and notifications.
- `buyer-dashboard.tsx` shows active/completed counts, wallet balance/held amount, quick actions, and the buyer's errands.
- `runner-dashboard.tsx` shows offers, active/completed work, earnings, ratings/trust, wallet, quick actions, and live location support.
- `dashboard-widgets.tsx` renders status-aware cards and actions.
- Realtime components invalidate/update dashboard information.

## Android screens

### `BuyerDashboardScreen`

UI order:

1. greeting and unread-notification action;
2. prominent `Post an errand` action;
3. compact cards for active errands, completed errands, wallet available/held;
4. `Your errands` list, ordered newest first;
5. empty state with a post action.

Task cards show title, category fallback, status label, budget, created time, share state where relevant, and one contextual action. Do not put all task lifecycle controls on the dashboard; open detail.

### `RunnerDashboardScreen`

UI order:

1. account/verification restriction banner when applicable;
2. availability summary and contextual action;
3. prominent `Open errands` action;
4. cards for active offers/work, completed count, earnings, rating/trust;
5. sections for offers, active errands, and recent completions;
6. empty states explaining availability/verification requirements.

Only show live location status when the runner is available or on active work. Do not request location merely to render the dashboard.

## Projection and API

```text
GET /api/mobile/v1/dashboard
```

Return a role-discriminated projection rather than asking Android to join many tables:

```kotlin
sealed interface Dashboard {
    data class Buyer(
        val profile: ProfileSummary,
        val counts: BuyerCounts,
        val wallet: WalletSummary,
        val errands: List<TaskSummary>,
        val unreadNotifications: Int
    ) : Dashboard

    data class Runner(
        val profile: RunnerSummary,
        val availability: AvailabilitySummary,
        val counts: RunnerCounts,
        val earnings: Money,
        val averageRating: Double?,
        val tasks: List<TaskSummary>,
        val unreadNotifications: Int
    ) : Dashboard
}
```

All money is pesewas. Trust is a normalized score and may be formatted as the current five-point presentation, but label it separately from buyer rating. Compute earnings using the same server projection as `/app/earnings`; do not sum potentially incomplete local cache rows.

## ViewModel

`DashboardViewModel` observes the cached projection, refreshes at entry/pull-to-refresh/realtime invalidation, and exposes:

```text
isInitialLoading, content, isRefreshing, staleSince, offline,
restrictionBanner, itemActionInProgress, error
```

Use a single refresh request when several realtime events arrive close together. Lifecycle commands occur in the task/detail repositories, not by mutating a dashboard card locally.

## Realtime behavior

Subscribe only while authenticated and according to lifecycle. Relevant tables/events include tasks, notifications, wallets, runner profile, ratings, and verification. Treat events as a reason to debounce and refetch `GET /dashboard`. On reconnect, always refresh because events may have been missed.

## Loading, empty, and error states

- Initial: skeleton greeting, stats, and cards.
- Cached offline: render last dashboard with a timestamp/offline banner and disable state-changing actions that require confirmation.
- Buyer empty: “No errands yet” plus Post action.
- Runner no offers: distinguish “available but no opportunities,” “not available,” “verification required,” and “account restricted.”
- Partial projection failure should be handled server-side; the mobile API should return one coherent projection or a defined partial result. Do not display zero for unknown balances/earnings.
- A task conflict on action triggers refresh and a concise “This errand has changed” message.

## Security

- `/dashboard` derives user ID and role from the bearer session, never a query parameter.
- Return only the caller's owned/assigned tasks.
- Runner offers must be specifically assigned/offered; open feed items belong to the opportunities endpoint.
- Do not cache another buyer's identity or private Errand-Share member details.

## File plan

```text
feature/dashboard/
  data/DashboardApi.kt
  data/DashboardRepositoryImpl.kt
  domain/Dashboard.kt
  domain/DashboardRepository.kt
  presentation/DashboardViewModel.kt
  presentation/BuyerDashboardScreen.kt
  presentation/RunnerDashboardScreen.kt
  presentation/components/DashboardStatCard.kt
  presentation/components/TaskSummaryCard.kt
  presentation/components/RestrictionBanner.kt
```

## Tests

- Projection mapping for buyer and runner.
- Active/completed status classification includes disputed/resolved exactly as web behavior.
- Wallet/earnings values are not calculated with floating point.
- Role-specific actions and restriction banners.
- Realtime burst causes one refresh; reconnect refreshes.
- Cached offline and truly empty states remain distinct.
- Compose semantics at large font sizes and small screens.

## Done criteria

- Buyer and runner can identify their most important next action without a drawer.
- Counts, money, task classification, availability, trust, and rating match server truth.
- Dashboard never becomes a second task state machine.
