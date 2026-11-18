# Dependency and version freeze (v0.2.21)

Facts below are copied from the build files and workflows in this package. A version listed here is known to build
only if it was part of a green CI run (last CI report seen: run 27, package v0.2.19; the v0.2.20 debug APK was built by CI and installed by the owner, which implies a successful build step, but its report was not supplied).
Lines marked UNCONFIRMED were added after that and are not proven until a CI report shows them green. Do not upgrade any line without a CI run.

| Item | Version | Where |
|---|---|---|
| Gradle | 8.14.3 (wrapper and CI) | gradle/wrapper, workflows |
| Android Gradle Plugin | 8.13.2 | build.gradle.kts |
| Kotlin | 2.4.21 | build.gradle.kts |
| KSP | 2.3.12 | build.gradle.kts |
| Room (runtime, ktx, compiler) | 2.8.5 | app/build.gradle.kts |
| androidx.sqlite:sqlite-bundled | 2.7.1 | app/build.gradle.kts |
| Compose Compiler Gradle plugin (org.jetbrains.kotlin.plugin.compose) | 2.4.21 (same as Kotlin) | build.gradle.kts - UNCONFIRMED |
| Compose UI / Foundation / UI tooling (preview and debug) | 1.11.4 | app/build.gradle.kts - built by CI in v0.2.20 (APK installed) |
| Compose Material 3 | 1.4.0 | app/build.gradle.kts - built by CI in v0.2.20 |
| androidx.activity:activity-compose | 1.12.3 | app/build.gradle.kts - built by CI in v0.2.20 |
| androidx.navigation:navigation-compose | 2.9.8 | app/build.gradle.kts - built by CI in v0.2.20 |
| androidx.paging:paging-compose | 3.4.2 | app/build.gradle.kts - built by CI in v0.2.20 (not used by any screen yet) |
| androidx.lifecycle:lifecycle-viewmodel-compose | 2.10.0 | app/build.gradle.kts - UNCONFIRMED (new in v0.2.21; 2.11.0 is the newest stable but was not chosen because its compileSdk requirement was not checked) |
| JDK | 17 (Temurin) | workflows, compileOptions, jvmTarget |
| compileSdk / targetSdk / minSdk | 36 / 36 / 26 | app/build.gradle.kts |
| JUnit | 4.13.2 | unit tests |
| sqlite-jdbc (unit tests only) | 3.50.2.0 | unit tests |
| Gson (unit tests only) | 2.11.0 | unit tests |
| androidx.test core / runner / ext:junit | 1.6.1 / 1.6.2 / 1.2.1 | androidTest |
| Emulator for instrumented runs | API 34, x86_64, google_apis | android-instrumented.yml |
| GitHub Actions used | checkout v4, setup-java v4, setup-android v4, setup-gradle v6, upload-artifact v4, android-emulator-runner v2 | workflows |

Known warning: Kotlin Gradle plugin reports Gradle 8.14.3 as deprecated; Gradle 8.14.4 or newer is needed for Kotlin 2.5.0.
Not a failure today. Changing the Gradle version is a separate, CI-verified step.

Why these Compose versions (checked on developer.android.com, 18 November 2026): Compose 1.12.0 and later need
compileSdk 37 and AGP 9.2.0+, so the newest stable line (1.12.1) cannot be used with AGP 8.13.2 / compileSdk 36.
Compose 1.11.4 is the last stable patch of the older line. Paging 3.4.2 and Navigation 2.9.8 were chosen as older stable
lines so that they do not pull Compose 1.12 in transitively. The Compose BOM is not used; each artifact is pinned.
If CI reports a minCompileSdk or AGP-version error, the first fix is to lower the library that asks for it, not to raise
compileSdk. Upgrading to AGP 9 / compileSdk 37 / Compose 1.12+ is a separate CI-verified step.

Release variant: `release` exists, unsigned, not minified. Signing and R8 are Phase 17 work.

v0.2.23: no dependency changed. Added: `app/debug.keystore` (fixed debug signing key, versionCode 23). `org.json` (part of Android) is used for draft storage.

v0.2.25: no dependency changed (versionCode 25). Used from existing libraries only: `androidx.activity` (enableEdgeToEdge, SystemBarStyle), Navigation Compose nested graphs, Material 3 NavigationBar. No icon library and no font file were added.

v0.2.26: no dependency changed (versionCode 26). Only existing Compose Material 3 components were added to the list screen (DropdownMenu, SnackbarHost); no schema change, database version 1.

v0.2.27: no dependency changed (versionCode 27). Used from existing libraries only: Compose Material 3 `TextField` / `TextFieldDefaults.colors`, `androidx.activity.compose.BackHandler`, `kotlinx.coroutines.flow` (`debounce`, `mapLatest`, both opt-in preview APIs), Compose `snapshotFlow`. No schema change, database version 1.
