# Disable Service-Worker Fetch Interception

**Date:** 2026-08-25  
**Status:** Approved direction; implementation pending

## Goal

Prevent the service worker from serving authenticated Next.js pages or React
Server Component payloads from a browser cache. This removes the cross-account
page replay that can show one account's dashboard or settings to another
account on the same device.

## Decision

Keep the service worker registered because the application uses it for web-push
notifications and installed-PWA behavior, but remove all fetch interception.
Every page, API request, React Server Component request, image, and static asset
will use the browser's normal network and HTTP-cache behavior.

The service worker will retain only these responsibilities:

- install and activate immediately;
- delete legacy `melange-*` Cache Storage entries during activation;
- display incoming push notifications; and
- open the notification's destination when it is clicked.

It will not register a `fetch` event listener.

## Current Failure

`public/sw.js` currently treats unrecognized same-origin GET requests as
stale-while-revalidate resources. Next.js App Router navigation payloads are
therefore stored by URL without regard to the authenticated user. The worker
also stores successful HTML navigations and can fall back to a cached `/app`
dashboard when the network fails.

Signing out clears the Supabase session but does not clear those cached page
responses. A later account can consequently receive the previous account's
cached page.

## Implementation

### Service worker

Remove the precache list, request classifiers, caching helpers, and the entire
`fetch` handler from `public/sw.js`. Keep the existing push and notification
click behavior unchanged.

During activation, enumerate Cache Storage and delete every cache whose name
starts with `melange-`. This explicitly removes the existing `melange-v3`
cache, including any personalized responses already stored on a user's device.
The cleanup is awaited before activation completes, after which the worker
claims open clients.

### Registration

Keep `ServiceWorkerRegister` in the root layout and keep registering `/sw.js`.
No application route or component needs to know about the cleanup.

### Offline behavior

The application will no longer provide service-worker-generated offline page
fallbacks. An installed app opened without a network connection will receive
the browser's normal offline error unless the browser itself can satisfy a
request from its standard HTTP cache. Push notifications continue to work.

The existing manifest and `offline.html` asset may remain because removing
unused public files is unrelated to the security fix.

## Verification

Add a unit test that evaluates `public/sw.js` with mocked service-worker
globals and verifies:

- no `fetch` listener is registered;
- install and activate listeners remain registered;
- activation deletes legacy `melange-*` caches and claims clients; and
- push and notification-click listeners remain registered.

Run the complete test suite, type check, lint, and production build. Review the
final diff to confirm there is no remaining `fetch` listener or cache write in
the service worker.

## Delivery

Implement on `agent/disable-service-worker-fetch`, push that branch, and create
a pull request against `main`. The previously identified admin-loop and auth
destination-continuity issues are outside this focused security change and can
be handled in a separate routing PR.
