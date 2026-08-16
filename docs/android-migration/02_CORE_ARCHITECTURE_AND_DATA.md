# 02 — Core Architecture and Data

## Goal

Define stable contracts for networking, session handling, models, persistence, state, errors, pagination, and backend reuse before feature screens are built.

## Current web implementation

- `src/lib/supabase/client.ts`, `server.ts`, `service.ts`, and `middleware.ts` separate browser, authenticated server, privileged service-role, and session-refresh concerns.
- `src/app/app/actions.ts` contains user commands and validation.
- `src/lib/server/` orchestrates matching, Errand-Share, escrow, trust, fraud, disputes, notifications, presence, rate limits, push, email, and admin work.
- `src/lib/server/rows.ts` contains partial hand-written database row types.
- Supabase migrations define the authoritative schema, constraints, RLS, realtime publications, and atomic RPCs.

## Backend reuse and required BFF work

Add route handlers under `src/app/api/mobile/v1/`. Extract Server Action bodies into transport-neutral command/query functions when necessary, then call the same functions from web actions and mobile routes. Do not make HTTP calls from a route handler back to the same Next.js deployment.

Each mobile handler must:

1. validate the Supabase bearer token with `auth.getUser()` rather than trusting decoded claims alone;
2. load authoritative profile/runner/admin state when the command depends on it;
3. validate a typed JSON or multipart request;
4. enforce rate limits and an idempotency key for retry-sensitive commands;
5. call existing server orchestration/Postgres RPCs;
6. return a privacy-safe DTO and the standard error envelope;
7. attach a request ID but never log secrets, message/image bodies, Ghana Card data, or precise cross-user location.

Add contract schemas and tests beside the BFF routes. Generate or manually maintain Kotlin DTOs from the checked contract; do not map Kotlin directly to raw table rows.

## Model layers

Use four shapes only when each has a distinct responsibility:

```kotlin
@Serializable
data class TaskDto(
    val id: String,
    val title: String,
    val status: String,
    val pricePesewas: Long,
    val createdAt: String
)

data class Task(
    val id: TaskId,
    val title: String,
    val status: TaskStatus,
    val price: Money,
    val createdAt: Instant
)

@Entity(tableName = "tasks")
data class TaskEntity(
    @PrimaryKey val scopedId: String,
    val ownerId: String,
    val payloadJson: String,
    val cachedAtEpochMs: Long
)

data class TaskListItemUi(
    val id: String,
    val title: String,
    val statusLabel: String,
    val moneyLabel: String
)
```

DTOs mirror the API, domain models encode safe types and enums, Room entities encode cache concerns, and UI models contain already-formatted display fields. Simple models need not be duplicated if no responsibility changes.

Core types should include `Money(pesewas: Long)`, `GeoPoint`, `TaskId`, `UserId`, `TaskStatus`, `Urgency`, `UserRole`, `RunnerStatus`, `ShareState`, `ShareGroupStatus`, `VerificationStatus`, and `DisputeStatus`. Unknown server enum values must map to an explicit `Unknown(raw)` or fail safely; they must not silently become a valid state.

## Network layer

Create:

```text
core/network/
  MelangeApi.kt
  AuthInterceptor.kt
  TokenAuthenticator.kt
  ApiErrorDto.kt
  ApiResult.kt
  NetworkErrorMapper.kt
  IdempotencyKeyStore.kt
  NetworkModule.kt
```

- `AuthInterceptor` obtains the current access token from `SessionManager` and adds the bearer header.
- `TokenAuthenticator` performs one serialized refresh and retries once. It must not create infinite 401 loops.
- Network logging is body-free in release and redacts authorization, cookies, coordinates, message content, and signed URLs.
- Set bounded connect/read/write timeouts. Upload endpoints may use a separate longer write timeout.
- Decode the server error envelope before falling back to transport errors.
- Repository methods return domain `Result`/typed failures, not Retrofit `Response`.

## Repository and source-of-truth policy

Example:

```kotlin
interface TaskRepository {
    fun observeTask(id: TaskId): Flow<Loadable<Task>>
    suspend fun refreshTask(id: TaskId): DomainResult<Unit>
    suspend fun acceptOffer(id: TaskId, commandId: String): DomainResult<Task>
}
```

For cacheable lists/details, write successful network projections to Room and observe Room from the UI. For rapidly changing command screens, the repository may expose network state directly while retaining the last good projection. Realtime tells a repository which resource changed; it does not mutate domain state from an untrusted payload.

## Room schema

Begin with user-scoped projections rather than a mirror of every Postgres table:

- `cached_tasks`
- `cached_opportunities`
- `cached_share_groups`
- `cached_messages`
- `cached_notifications`
- `cached_wallet_entries`
- `sync_metadata`
- `safe_outbox` for explicitly approved idempotent work

All primary keys include the signed-in user ID or the database is cleared on account switch. Store media paths/remote IDs, not image blobs. Signed URLs are short-lived and should not be treated as durable data.

Migrations are mandatory from the first released Room version. Enable destructive migration only in debug.

## State, actions, and effects

```kotlin
data class TaskUiState(
    val loadState: LoadState = LoadState.Initial,
    val task: TaskUiModel? = null,
    val isRefreshing: Boolean = false,
    val pendingCommand: TaskCommand? = null,
    val offline: Boolean = false
)

sealed interface TaskAction {
    data object Retry : TaskAction
    data object Refresh : TaskAction
    data object AcceptOffer : TaskAction
}

sealed interface TaskEffect {
    data class ShowMessage(val text: UiText) : TaskEffect
    data class Navigate(val destination: AppDestination) : TaskEffect
}
```

Expose state with `StateFlow`, collect with lifecycle awareness, and update immutable copies. Effects use a channel/shared flow that does not replay stale navigation after configuration change. Pass IDs through navigation and load authoritative data in the destination ViewModel.

## Pagination and refresh

- List endpoints return `items` and `nextCursor`.
- Cursor must be opaque to Android.
- A refresh replaces the first page transactionally; load-more appends unique IDs.
- Empty means a successful response with no rows, not a failed request.
- Pull-to-refresh is allowed even when realtime is active.
- For the opportunity feed, state changes can remove cards after a refresh; explain conflicts rather than restoring stale cards.

## Time, money, and serialization

- Parse API timestamps to `kotlinx.datetime.Instant` or `java.time.Instant` consistently.
- Inject `Clock` for countdowns, tests, Errand-Share windows, and relative labels.
- Send money as integer pesewas. At the BFF boundary, convert safely to the database numeric representation.
- Use `BigDecimal` only inside explicit conversion/formatting code if required; never calculate money with `Float`/`Double`.
- Preserve server-provided algorithm/config versions in diagnostic projections, but do not use them to run the algorithm on device.

## Proposed cross-feature endpoints

```text
GET  /api/mobile/v1/me
GET  /api/mobile/v1/dashboard
GET  /api/mobile/v1/tasks?scope=mine&status=&cursor=&limit=
GET  /api/mobile/v1/tasks/{taskId}
GET  /api/mobile/v1/opportunities?cursor=&limit=
GET  /api/mobile/v1/notifications?cursor=&limit=
GET  /api/mobile/v1/wallet?cursor=&limit=
```

`GET /me` returns identity/profile/role/admin/runner-verification flags in one projection. `GET /tasks/{id}` performs participant authorization and returns signed media URLs only when needed.

## Errors and conflict recovery

Create typed failures: `Offline`, `Timeout`, `Unauthenticated`, `Forbidden`, `NotFound`, `Validation(fieldErrors)`, `Conflict(code, currentVersion)`, `RateLimited(retryAfter)`, and `Server(requestId)`. Screens translate them into actions:

- 401: refresh once, then clear session and route to login with a safe return destination;
- 403: explain account/verification restriction and remove impossible actions;
- 404: privacy-safe not-found state;
- 409: refresh authoritative resource and explain it changed;
- 429: disable retry until `Retry-After` where supplied;
- offline/timeout: keep stale read data and offer retry;
- unknown 5xx: preserve user input and show request ID.

## Security boundary tests

- Buyer cannot request runner-only feed, offer, availability, proof, or verification mutations.
- Runner cannot view another runner's assignments or another buyer's task.
- Group members cannot see the other buyer's private task/contact/chat/payment data.
- Non-admin cannot call any admin route even if the UI route is forced.
- Expired/revoked token never falls back to service-role access without user checks.
- A repeated idempotency key returns the prior command result or a defined conflict and never repeats money/state effects.

## Done criteria

- BFF request/response/error conventions are contract-tested.
- Android has tested auth interception, one-shot refresh, DTO mapping, Room migrations, pagination, and user-scoped cache clearing.
- No repository exposes Supabase raw rows or Retrofit responses to a ViewModel.
- No client component contains the service-role key or reimplements privileged domain transitions.
