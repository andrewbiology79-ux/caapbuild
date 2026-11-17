# Question Bank Android v0.2.20 — Compose and Navigation foundation

## Scope
- Replaced the placeholder TextView Activity with a single-Activity Jetpack Compose shell.
- Added Material 3 theme primitives and a Bengali home screen.
- Added Navigation Compose with a single `home` destination. No inactive feature is presented as working.
- Added Paging 3 runtime and Compose artifacts for the upcoming keyset-backed DAO layer; no PagingSource exists yet.
- Added the Kotlin Compose compiler Gradle plugin at the same version as the Kotlin plugin.
- Updated Gradle wrapper and both CI workflows from 8.14.3 to 8.14.4.
- Instrumented workflow now records source commit, GitHub run identity, app version, emulator identity/API, Java and Gradle versions.

## Deliberately not included
- No question DAO, repository, use case, ViewModel, CRUD or search feature.
- No migration or database schema change. Room schema JSON is expected to remain unchanged.
- No signing or minification; release signing remains Phase 17.

## Dependency versions
See `docs/Dependency_Version_Freeze.md`. Compose BOM 2026.09.00, Activity Compose 1.13.0, Navigation Compose 2.10.1 and Paging 3.5.3 are provisional until GitHub CI confirms resolution and compilation.

## Verification status
NOT COMPILED / NOT RUN in the package-preparation environment. Attempted `./gradlew testDebugUnitTest assembleDebug compileDebugAndroidTestKotlin assembleRelease`, but Gradle 8.14.4 could not be downloaded because this environment has no DNS/network access to services.gradle.org. Do not mark this version green until GitHub Actions passes all blocking and diagnostic tasks.
