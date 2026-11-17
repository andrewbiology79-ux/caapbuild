# Dependency and version freeze (v0.2.20; CI confirmation pending)

Facts below are copied from the build files and workflows in this package. A version listed here is known to build
only if it was part of a green CI run (the last one: run 24, package v0.2.18). Do not upgrade any line without a CI run.

| Item | Version | Where |
|---|---|---|
| Gradle | 8.14.4 (wrapper and CI; pending CI confirmation) | gradle/wrapper, workflows |
| Android Gradle Plugin | 8.13.2 | build.gradle.kts |
| Kotlin | 2.4.21 | build.gradle.kts |
| KSP | 2.3.12 | build.gradle.kts |
| Room (runtime, ktx, compiler) | 2.8.5 | app/build.gradle.kts |
| androidx.sqlite:sqlite-bundled | 2.7.1 | app/build.gradle.kts |
| JDK | 17 (Temurin) | workflows, compileOptions, jvmTarget |
| compileSdk / targetSdk / minSdk | 36 / 36 / 26 | app/build.gradle.kts |
| JUnit | 4.13.2 | unit tests |
| sqlite-jdbc (unit tests only) | 3.50.2.0 | unit tests |
| Gson (unit tests only) | 2.11.0 | unit tests |
| androidx.test core / runner / ext:junit | 1.6.1 / 1.6.2 / 1.2.1 | androidTest |
| Compose BOM | 2026.09.00 (pending CI confirmation) | app/build.gradle.kts |
| Kotlin Compose compiler plugin | 2.4.21 (must match Kotlin plugin) | build.gradle.kts |
| Activity Compose | 1.13.0 (pending CI confirmation) | app/build.gradle.kts |
| Navigation Compose | 2.10.1 (pending CI confirmation) | app/build.gradle.kts |
| Paging runtime + Compose | 3.5.3 (pending CI confirmation) | app/build.gradle.kts |
| Emulator for instrumented runs | API 34, x86_64, google_apis | android-instrumented.yml |
| GitHub Actions used | checkout v4, setup-java v4, setup-android v4, setup-gradle v6, upload-artifact v4, android-emulator-runner v2 | workflows |

Gradle was raised to 8.14.4 in v0.2.20 to clear the deprecation warning noted by the Kotlin plugin. This change is pending CI confirmation.

Compose, Navigation Compose, Paging 3 and Material 3 are now added in v0.2.20. All new versions remain provisional until CI compiles them.

Release variant: `release` exists, unsigned, not minified. Signing and R8 are Phase 17 work.
