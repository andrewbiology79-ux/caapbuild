# Dependency and version freeze (v0.2.19)

Facts below are copied from the build files and workflows in this package. A version listed here is known to build
only if it was part of a green CI run (the last one: run 24, package v0.2.18). Do not upgrade any line without a CI run.

| Item | Version | Where |
|---|---|---|
| Gradle | 8.14.3 (wrapper and CI) | gradle/wrapper, workflows |
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
| Emulator for instrumented runs | API 34, x86_64, google_apis | android-instrumented.yml |
| GitHub Actions used | checkout v4, setup-java v4, setup-android v4, setup-gradle v6, upload-artifact v4, android-emulator-runner v2 | workflows |

Known warning: Kotlin Gradle plugin reports Gradle 8.14.3 as deprecated; Gradle 8.14.4 or newer is needed for Kotlin 2.5.0.
Not a failure today. Changing the Gradle version is a separate, CI-verified step.

Compose, Navigation Compose, Paging 3 and Material 3 are decided in ADR-002 but not added yet; their exact versions
will be added to this table in v0.2.20 after a green CI run.

Release variant: `release` exists, unsigned, not minified. Signing and R8 are Phase 17 work.
