# Version 0.2.3 — project plan and package alignment

This package carries forward the v0.2.2 KAPT metadata compatibility attempt and adds the updated project plan.

## Changes
- Retains `kapt("org.jetbrains.kotlin:kotlin-metadata-jvm:2.4.21")` as the targeted processor-classpath compatibility attempt.
- Aligns Android `versionName` to `0.2.3-database-foundation`.
- Includes `PROJECT_PLAN_v1_3_UPDATED.txt`, documenting the observed CI run 6 failure, current phase statuses, and the next verification gate.
- Preserves the GitHub Actions diagnostic workflow and always-upload CI report behavior.
- Preserves the one-physical-database architecture and the existing canonical schema assets.

## Verification boundary
The archive and source-level edits are checked. No Gradle build was run in this preparation environment. The KAPT change remains unverified until GitHub Actions passes `testDebugUnitTest` and `assembleDebug` and uploads the expected debug APK.
