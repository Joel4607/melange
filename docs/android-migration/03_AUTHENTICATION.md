# 03 — Authentication

## Purpose

Rebuild email/password authentication, sign-up role choice, email confirmation, session restoration, logout, and role/admin guards with Supabase Auth while keeping authorization authoritative on the server.

## Current web implementation

- `src/app/get-started/page.tsx` selects buyer or runner onboarding.
- `src/app/login/login-form.tsx` calls `signInWithPassword` and accepts only same-origin `next` paths.
- `src/app/signup/signup-form.tsx` submits name, phone, email, password, and `buyer|runner` metadata. Password minimum is six characters.
- `src/app/auth/callback/route.ts` exchanges the email callback code and uses a safe next path.
- `src/app/auth/signout/route.ts` clears the session.
- `src/lib/supabase/middleware.ts` refreshes sessions and guards `/app`.
- The `handle_new_user` database trigger creates `profiles`; admin authority is `profiles.is_admin`.

The signup UI treats role as an account mode. Several database comments predate this behavior and describe dual-capability accounts; Android must follow the live UI/server checks: a session has one public `buyer` or `runner` role unless a future backend migration deliberately changes it.

## Android screens

### `RoleSelectionScreen`

- Access: signed out only.
- Sections: short value statement, Buyer card, Runner card, existing-account action.
- Action: navigate to `SignUp(role)`; never grant a role locally.

### `LoginScreen`

- Fields: email and password.
- Actions: sign in; navigate to sign-up; optional password-reset entry only after the backend/reset flow is implemented.
- Validation: nonblank syntactically valid email and nonblank password. Server/Auth remains authoritative.
- States: idle, submitting, field/auth error, offline, success navigation.

### `SignUpScreen`

- Fields: full name, phone, email, password; role is visible and changeable.
- Validation: all current required fields, email syntax, password at least six characters, terms copy if the product adds it before release.
- Result: if Auth returns a live session, proceed to bootstrap; otherwise show `EmailConfirmationScreen`.

### `EmailConfirmationScreen`

- Displays the submitted email, open-email action, and return-to-login action.
- A resend action is optional only if the Supabase rate limits and response states are implemented.
- App Link callback resumes session exchange/bootstrap.

### `SessionExpiredScreen` or dialog

- Explain expiry once, clear user-scoped data, and route to login.
- Preserve only a typed safe internal destination; never accept an arbitrary URL.

## ViewModels and contracts

```text
AuthViewModel
  observeSession()
  signIn(email, password)
  signUp(name, phone, email, password, role)
  signOut()
  consumeAuthDeepLink(uri)

SessionViewModel (application scope)
  restores session
  fetches GET /api/mobile/v1/me
  emits Loading | SignedOut | SignedIn(UserContext) | Blocked
```

`UserContext` contains user ID, email, display name, phone, public role, `isAdmin`, runner status, and verification status. Do not use user-editable Auth `user_metadata` as authorization. Add a server-controlled role source (`profiles` column or Auth `app_metadata`), have `GET /me` return it, and make every BFF command enforce it.

## Repository and service design

```text
feature/auth/
  data/AuthRepositoryImpl.kt
  domain/AuthRepository.kt
  domain/UserContext.kt
  presentation/LoginScreen.kt
  presentation/LoginViewModel.kt
  presentation/SignUpScreen.kt
  presentation/SignUpViewModel.kt
  presentation/EmailConfirmationScreen.kt
core/auth/
  SessionManager.kt
  SafeReturnDestination.kt
  AuthDeepLinkHandler.kt
```

Supabase Auth handles sign-in/sign-up/refresh/sign-out. The BFF endpoint `GET /api/mobile/v1/me` is the authoritative app bootstrap. If profile creation is momentarily delayed after sign-up, retry it with a short bounded backoff rather than inventing a client-side profile.

The current signup trigger copies `name` but not the submitted phone metadata. As part of backend preparation, persist the confirmed phone through a server-owned onboarding/profile command or update the trigger; test that `GET /me` returns the same value. Do not let Android assume Auth metadata and `profiles.phone` are synchronized.

Although `.env.example` contains Twilio settings for Supabase phone OTP, the current user interface implements email/password authentication only. Do not add SMS login to Android until a complete, tested product flow and backend configuration are approved.

## Deep links

Register an HTTPS App Link or a carefully scoped custom scheme for the Supabase redirect URL. Accept only the configured host/path. Exchange the code through the SDK, discard it from logs, and route through session bootstrap. Never treat a `next` query parameter as an arbitrary URI; map a small allowlist of typed destinations such as task detail or dashboard.

Notification deep links must also pass through authentication and authorization before opening content.

## Session persistence and refresh

- Use the Supabase SDK-supported Android session store. If customized, encrypt session material with an Android Keystore-backed key.
- Restore session before rendering a role graph; show a splash/bootstrap state, not a flash of login/dashboard.
- Serialize refresh so concurrent 401 responses cause one refresh.
- Retry the failed request once with the refreshed access token.
- On refresh failure/revocation, clear session, cancel user-tagged WorkManager jobs, close Realtime channels, unregister or detach the FCM token server-side when possible, and delete user-scoped Room rows.

## Proposed BFF endpoints

```text
GET  /api/mobile/v1/me
POST /api/mobile/v1/devices/fcm-token
DELETE /api/mobile/v1/devices/fcm-token/{tokenHash}
```

Auth credential operations stay in Supabase Auth. Do not add a second password database or proxy raw passwords through the BFF without a documented need.

## Role and account guards

- Buyer graph: dashboard, runners, posting, wallet, owned task details, notifications, settings.
- Runner graph: dashboard, opportunities, earnings, assigned task details, verification, notifications, settings.
- Unverified runner: may access dashboard/settings/verification but cannot become available, claim, accept, or perform runner lifecycle actions.
- Suspended/quarantined runner: show account status and remove operational actions; backend returns 403.
- Admin graph: require `isAdmin`; it is additive to the account's public role.

## Errors and UX

- Invalid credentials: inline generic auth message; do not reveal whether an account exists.
- Unconfirmed email: explain next step and resend only with rate-limit handling.
- Offline: preserve fields except password after process death; do not persist password.
- Rate limit: display retry guidance without rapid automatic retries.
- Profile/bootstrap failure after valid session: retry and expose request ID; do not sign the user out unless the token is invalid.

## Tests

- Login success, invalid credentials, offline, and double-submit prevention.
- Sign-up for buyer and runner sends exact role metadata and required profile fields.
- Confirmation-required and immediate-session branches.
- Malicious/unknown deep links and return destinations are rejected.
- One refresh for concurrent 401s; terminal refresh failure clears all user state.
- UI cannot enter runner/admin graphs by constructing routes.
- Logout closes Realtime, clears cache/outbox, cancels work, and returns to auth graph.

## Done criteria

- Cold start deterministically resolves signed-out or authoritative signed-in context.
- Token storage and logs pass security review.
- All role, verification, runner-status, and admin restrictions are duplicated server-side.
- Account switching never displays the prior user's cached data.
