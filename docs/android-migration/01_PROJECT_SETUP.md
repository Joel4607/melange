# 01 — Android Project Setup

## Goal

Create a reproducible Android foundation that can host the Melange modules without embedding backend secrets or prematurely coupling screens to Supabase rows.

## Source references

- `package.json` and `.github/workflows/ci.yml` for the existing quality gates
- `.env.example` for backend integrations and public/server-only boundaries
- `src/app/globals.css` and `src/components/brand.tsx` for brand tokens
- `ARCHITECTURE.md` for the deliberate small-system philosophy

## Project decision

Create a new top-level `android/` Gradle project in this repository. Keep the web/BFF and Android builds independently runnable. Start with one application module plus reusable core and feature Gradle modules only when boundaries pay for themselves.

Recommended initial modules:

```text
android/
  app/
  core/common/
  core/designsystem/
  core/network/
  core/database/
  core/testing/
  feature/auth/
  feature/dashboard/
  feature/tasks/
```

Split additional feature modules when their implementation starts. Do not create twenty empty Gradle modules up front.

## Build configuration

- Kotlin DSL Gradle files and `libs.versions.toml`.
- Current stable Android Gradle Plugin/Kotlin pair supported by Android Studio at project creation time.
- Minimum SDK chosen from supported device evidence; API 26 is a practical starting point because `java.time` is native. Reassess from target users before locking it.
- Current target/compile SDK required by Google Play at release time.
- Java/Kotlin toolchain 17 unless the selected AGP requires newer.
- Compose compiler/plugin aligned with Kotlin; Compose BOM for UI artifacts.
- `BuildConfig.API_BASE_URL` from non-secret build configuration.
- Separate `debug`, `staging`, and `release` endpoints. Never hard-code production URLs in repositories.

Only the Supabase URL and anon/publishable key may be packaged as client configuration. The service-role key, cron secret, Redis token, SMTP credentials, VAPID private key, Telegram bot token, and Twilio credentials are server-only and must never enter Gradle properties, resources, APKs, CI artifacts, or logs.

## Dependencies by purpose

```text
UI             Compose BOM, Material3, activity-compose
Lifecycle      lifecycle-runtime-compose, lifecycle-viewmodel-compose
Navigation     navigation-compose
DI             Hilt, hilt-navigation-compose, KSP
Networking     Retrofit, OkHttp, kotlinx-serialization-json
Authentication Supabase Kotlin Auth (selected stable release)
Persistence    Room runtime/ktx/compiler, Preferences DataStore
Background     WorkManager
Push           Firebase Messaging
Images         Coil Compose
Location       play-services-location
Maps           Maps Compose or MapLibre, one provider only
Testing        JUnit, coroutines-test, Turbine, MockWebServer, Compose UI test
```

Add exact versions only after checking compatibility in a generated project. Commit dependency lock files or verification metadata where supported. CI must use the Gradle wrapper.

## Application bootstrap

Create:

```text
android/app/src/main/java/.../MelangeApplication.kt
android/app/src/main/java/.../MainActivity.kt
android/app/src/main/java/.../MelangeApp.kt
android/app/src/main/java/.../di/AppModule.kt
android/app/src/main/AndroidManifest.xml
android/core/designsystem/.../MelangeTheme.kt
android/core/designsystem/.../Color.kt
android/core/designsystem/.../Typography.kt
```

`MelangeApplication` owns Hilt initialization. `MainActivity` is a thin edge-to-edge host. `MelangeApp` observes session/theme/connectivity state and installs the root navigation graph. No feature repository is constructed in an Activity or composable.

## Branding and accessibility

Translate existing green/orange/cream/ink tokens into light and dark Material 3 schemes. Preserve brand character while allowing system font scaling, contrast, dynamic insets, reduced motion, and TalkBack. Do not copy desktop fixed widths or the sidebar.

Add preview fixtures for core cards, form fields, badges, error panels, empty states, and skeletons. Previews use fake models and never initialize network clients.

## Environments and Firebase

- Use application ID suffixes for debug/staging.
- Keep environment-specific public configuration in generated resources or CI-injected build config.
- Place `google-services.json` through the team's secret/configuration process and use separate Firebase projects for non-production and production where practical.
- Register signing certificate fingerprints only where a provider requires them.
- Restrict API keys by Android application ID/signature and provider service.

## Quality gates

Android CI should run on changes under `android/**`:

```text
./gradlew lintDebug
./gradlew testDebugUnitTest
./gradlew assembleDebug
./gradlew connectedCheck   # device/emulator job, initially critical flows
```

Also add formatting/static analysis only if configured once and enforced consistently. Keep the existing web `lint`, `typecheck`, tests, and build gates because Android depends on the BFF.

## Initial file tree

```text
android/
  settings.gradle.kts
  build.gradle.kts
  gradle/libs.versions.toml
  gradle.properties
  gradlew / gradlew.bat / gradle/wrapper/
  app/build.gradle.kts
  app/src/main/AndroidManifest.xml
  app/src/main/java/.../MelangeApplication.kt
  app/src/main/java/.../MainActivity.kt
  app/src/main/java/.../MelangeApp.kt
  core/common/
  core/designsystem/
  core/network/
  core/database/
  core/testing/
```

## Tests

- Unit test environment selection and base URL parsing.
- Screenshot or Compose semantics checks for theme contrast and large font scale.
- Instrumented smoke test launches `MainActivity` into a fake logged-out session.
- CI secret scan confirms forbidden server variable names/values do not appear in Android artifacts.

## Done criteria

- A clean clone builds with the wrapper after documented public configuration is supplied.
- Debug and release variants point to the correct endpoints and release disables verbose HTTP bodies.
- Hilt, Compose, navigation host, Room, DataStore, and network client can initialize through fakes.
- No feature logic, service key, or server credential has been copied into the Android project.
