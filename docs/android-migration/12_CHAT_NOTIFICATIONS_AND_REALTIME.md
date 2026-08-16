# 12 — Chat, Notifications, and Realtime

## Purpose

Rebuild task-scoped buyer/runner chat, in-app notifications, Android push, notification preferences, and coherent realtime refresh behavior.

## Current web implementation

- Migration `0040_messages.sql` creates participant-only messages, max content 1,000, and Realtime publication; `0041_chat_polish.sql` adds image/read behavior.
- `task-chat.tsx`, `sendMessage`, and `markMessagesRead` implement text/image chat and signed image URLs.
- `notifications` table plus `notifications-popover.tsx`, `/app/notifications`, and actions implement list, read, delete, clear-read, and preferences.
- `src/lib/server/notifications.ts` creates in-app records and dispatches configured push/email/Telegram channels.
- `/api/push/subscribe` and `/unsubscribe` register web-push subscriptions.
- `realtime-status.tsx` refreshes UI on Supabase events.

## Chat scope

Chat belongs to one task. Only the buyer and currently selected runner may read/post; admin access follows explicit policy. In a shared trip, each child task has its own buyer-runner chat. Buyers never share a group chat and cannot read the other member's messages.

### `TaskChatScreen` or detail section

- chronological message list with sender distinction and timestamps;
- text composer, image attachment, send action;
- upload/send progress and retry state;
- mark read on foreground/visible conversation;
- new-message indicator when scrolled away from bottom;
- empty, offline, and participant-ended states.

Text is trimmed and capped at 1,000 characters. The current `0041_chat_polish.sql` constraint allows text-only, image-only, or text-plus-image messages, but rejects a message with neither. Chat is available for `matched`, `accepted`, `in_progress`, `completed`, and `resolved` participant tasks.

## Chat APIs

```text
GET  /api/mobile/v1/tasks/{taskId}/messages?cursor=&limit=
POST /api/mobile/v1/tasks/{taskId}/messages          # multipart or staged upload
POST /api/mobile/v1/tasks/{taskId}/messages/read
```

The BFF verifies participation, sanitizes a client filename, validates JPEG/PNG/WebP and size, stores through the private `chat-images` bucket, and returns a message DTO. Prefer upload to BFF or a server-issued one-use signed upload contract; never make a bucket public.

Use a client-generated message ID/idempotency key so reconnects do not duplicate messages. Cache message metadata and local upload URI, not durable signed download URLs or image bytes.

## Notification center

`NotificationCenterScreen` shows paginated notification cards, unread state, safe summary, time, and deep-link action. Actions:

- open destination and mark read;
- mark one/all read;
- delete one;
- clear read notifications;
- refresh/load more.

Empty state: “No notifications yet.” Cached offline list is allowed. Deletion/read commands should be idempotent and update cache only after success or with rollback.

Proposed APIs:

```text
GET    /api/mobile/v1/notifications?cursor=&limit=
PATCH  /api/mobile/v1/notifications/{id}       { "read": true }
POST   /api/mobile/v1/notifications/read-all
DELETE /api/mobile/v1/notifications/{id}
DELETE /api/mobile/v1/notifications?scope=read
```

Server always scopes by authenticated recipient even when an ID is supplied.

## FCM integration

Add a server-owned device-token table or generalized subscriptions table with user ID, token hash/encrypted token as appropriate, platform, app version, created/last-seen timestamps, and disabled/revoked state. Register through:

```text
POST   /api/mobile/v1/devices/fcm-token
DELETE /api/mobile/v1/devices/fcm-token/{tokenHash}
```

FCM payloads contain a notification ID/type and stable resource ID only. Do not include message bodies, Ghana Card data, precise locations, other buyer data, or payment references in lock-screen payloads. Fetch authorized detail after tap.

Ask Android 13+ notification permission in context after login with an explanation. Server `notifyPush` preference and OS permission are independent. Handle token rotation, logout, account switch, invalid-token feedback from Firebase, and multiple devices.

The existing VAPID web push remains for the web client. Do not try to register a web PushSubscription from Android.

## Notification types

Preserve the current server types: `offer`, `offer_accepted`, `picked_up`, `delivered`, `rated`, `tip_received`, `buyer_cancelled`, `runner_cancelled`, `dispute_raised`, `dispute_resolved`, `new_message`, `recurring_scheduled`, `share_paired`, `share_dissolved`, `share_continuing_alone`, `share_funding_ready`, `share_offer`, `share_accepted`, `share_member_delivered`, and `share_completed`. Verification/admin alerts currently also use their server channels. Map unknown future types to a generic safe row and dashboard destination, not a crash.

## Realtime strategy

Use authenticated Supabase Realtime only for authorized tables/channels supported by current policies, or add a BFF-owned event mechanism. Treat payloads as invalidation hints:

```text
event arrives -> identify resource -> debounce -> GET authoritative projection -> Room transaction -> UI flow
```

Do not apply money, lifecycle, authorization, or cross-table group state directly from one Realtime payload. Reconnect triggers a refresh. App background relies on FCM/WorkManager rather than keeping an unlimited socket alive.

## Connectivity and delivery semantics

- Chat send: user-visible pending item may persist locally and retry only with the same message ID and participant revalidation.
- Mark-read and FCM token registration are safe deferred work with idempotency.
- Notification deletion can retry with the same intent.
- Task/money/group lifecycle commands are never placed in this module's automatic outbox.
- Push is a hint; the in-app notification table is the durable user-visible record.

## Security and privacy

- RLS/BFF participant checks on every message list/send/read.
- Private storage and short-lived signed image URLs.
- MIME sniff/decoding and size checks server-side; do not trust extension or client MIME.
- Clear cached chat/notification data on logout.
- Notification `PendingIntent` is immutable and validates IDs through navigation/bootstrap.
- Logs exclude content, attachment URLs, push tokens, and notification payload details.

## File plan

```text
feature/chat/
  data/ChatApi.kt
  data/ChatRepositoryImpl.kt
  domain/Message.kt
  presentation/TaskChatViewModel.kt
  presentation/TaskChatScreen.kt
feature/notifications/
  data/NotificationApi.kt
  data/NotificationRepositoryImpl.kt
  presentation/NotificationCenterViewModel.kt
  presentation/NotificationCenterScreen.kt
core/notifications/
  MelangeFirebaseMessagingService.kt
  FcmTokenRegistrar.kt
  NotificationRouter.kt
core/realtime/
  RealtimeCoordinator.kt
```

## Tests

- Buyer/selected-runner participant matrix and shared-chat isolation.
- 1,000-character boundary, invalid image, duplicate send, upload retry.
- Read/delete/all/clear recipient scoping and offline cache behavior.
- FCM token create/rotate/logout/multiple-account lifecycle.
- Safe notification payload/deep-link mapping including unknown types.
- Realtime burst/reconnect causes coherent refresh, not duplicate state transitions.
- Signed URL expiry refresh and cache/log redaction.

## Done criteria

- Chat and notifications work across foreground, reconnect, background push, and logout.
- Realtime improves freshness without becoming a second source of truth.
- Cross-buyer and lock-screen privacy tests pass.
