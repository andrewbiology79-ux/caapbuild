# Version 0.2.4 — Room KSP processing migration

This package responds to CI run 7, which no longer reported the prior Kotlin metadata-reader exception but failed in Room KAPT processing with an empty entity list.

## Changes
- Replaces Kotlin KAPT with KSP 2.3.12.
- Moves `androidx.room:room-compiler:2.8.5` from the `kapt` configuration to `ksp`.
- Removes the direct `kotlin-metadata-jvm:2.4.21` KAPT override.
- Moves Room schema and incremental options into `ksp {}`.
- Aligns Android `versionName` to `0.2.4-ksp-room-processing`.
- Includes `PROJECT_PLAN_v1_4_UPDATED.txt`.
- Preserves the one-physical-database architecture, canonical SQL, 35 Room entity source files, and GitHub Actions diagnostic workflow.

## Verification boundary
The ZIP and source-level configuration have been checked. No Gradle build was run in this preparation environment. KSP processing, Room code generation, unit tests, and APK assembly must be confirmed by the next GitHub Actions run.
