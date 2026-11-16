# Version 0.2.2 — Kotlin metadata/KAPT compatibility attempt

Based on the uploaded GitHub Actions diagnostic report for run 6, `:app:kaptDebugKotlin` failed because Room's annotation-processing classpath could not parse Kotlin metadata version 2.4.0 (maximum supported by the selected reader was 2.3.0).

## Changes
- Added `org.jetbrains.kotlin:kotlin-metadata-jvm:2.4.21` to the `kapt` configuration in `app/build.gradle.kts`.
- Kept Kotlin Android and KAPT plugins at 2.4.21 and Room at 2.8.5.
- Preserved the existing GitHub Actions diagnostic workflow and its always-upload behavior.
- Preserved the one-physical-database architecture and all existing schema/trigger files.

## Why 2.4.21
Kotlin's documentation states that `kotlin-metadata-jvm` follows Kotlin compiler/standard-library versioning and demonstrates using the matching Kotlin version. This dependency is therefore aligned with the project's Kotlin 2.4.21 compiler rather than selecting a lower 2.4.0 patch version.

## Verification
This is a targeted compatibility correction, not a verified fix yet. The next GitHub Actions run must confirm that KAPT completes. If it fails, download the `QuestionBank-ci-report` artifact and review the new `gradle-build.log`; do not assume the original failure is resolved. No successful Android build or APK is claimed in this package.
