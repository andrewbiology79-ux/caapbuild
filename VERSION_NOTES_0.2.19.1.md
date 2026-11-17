# Version 0.2.19.1 - Hilt version fix (AGP 8 compatible)

STATUS: written, NOT compiled, NOT run. UNCONFIRMED until the next normal CI run is green.

Failure fixed (CI run 25, commit d16ba64, v0.2.19)
- Build failed during project configuration (before any Kotlin compile, test or KSP step), in 6-10 s:
  `Failed to apply plugin 'com.google.dagger.hilt.android'. The Hilt Android Gradle plugin is only compatible with
  Android Gradle plugin (AGP) version 9.0.0 or higher (found Android Gradle Plugin version 8.13.2).`
- The androidTest compile step failed with the same message (same root cause, not a second problem).
- Cause: Dagger/Hilt 2.59+ moved the Gradle plugin to AGP 9. The project is on AGP 8.13.2 / Gradle 8.14.3.

Change (one variable only)
- Hilt 2.60 -> 2.58 in the root build.gradle.kts (plugin) and app/build.gradle.kts (hilt-android, hilt-compiler).
- versionName 0.2.19.1-hilt. No source, schema, test or workflow change.

Why 2.58 and not an AGP 9 upgrade
- ADR-002 staging rule: one risky change per CI run. AGP 9 also needs Gradle 9.1+, built-in Kotlin (the
  org.jetbrains.kotlin.android plugin is removed), the new Android DSL and a KSP compatibility check.
- Dagger 2.58 release notes: AGP 9 support was deliberately held back, so 2.58 still supports AGP 8.x.

Expected CI result: same as v0.2.19 notes (11 unit tests, assembleDebug, KSP runs Room + Hilt processors).
If it fails, read the first `e:` / `Caused by:` in gradle-build.log; DEPENDENCY_FREEZE.md lists the known risks.
Fallback order: Hilt 2.57.2 (same AGP 8 line) -> a deliberate AGP 9 migration for Hilt 2.60.
