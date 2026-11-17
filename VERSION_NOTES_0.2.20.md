# Version 0.2.20 - Compose + Navigation + Paging dependencies, first screen (Step B)

Evidence for v0.2.19 (all green; see plan section 34):
- CI run 27: Gradle exit 0, unit tests 11 of 11, release variant assembled, schema 1.json identical to the committed one
  (identityHash 786b471dfa14c9ae4739bb81479bab25).
- Emulator, API 34, 300,000 rows: 11 of 11 tests, exit 0.

Changes in this package
1. Root build.gradle.kts: Compose compiler plugin 2.4.21 (same version as Kotlin).
2. app/build.gradle.kts: `buildFeatures { compose = true }` and the dependencies listed in docs/Dependency_Version_Freeze.md
   (Compose 1.11.4, Material 3 1.4.0, activity-compose 1.12.3, navigation-compose 2.9.8, paging-compose 3.4.2).
   versionName 0.2.20-compose-home.
3. MainActivity is now a ComponentActivity with Compose content. New: ui/theme/Theme.kt, ui/navigation/AppNavHost.kt
   (route "home"), ui/home/HomeScreen.kt (placeholder: app name, Bengali text, version).
4. ADR-002 marked owner-confirmed; the Compose 1.12 / compileSdk 37 constraint is recorded there and in the freeze document.
5. Plan v1.22 (section 34).

No database change; database version stays 1. The 11 unit tests are unchanged.

STATUS: written, NOT compiled, NOT run - UNCONFIRMED. The build could not be run where this package was prepared (no network).
Compose lives in the main source set, so a mistake fails the blocking build. Send the CI report either way.

What to check in the CI report
- BUILD SUCCESSFUL, 11 unit tests, kspDebugKotlin executed.
- Most likely failure: a transitive library asking for a newer compileSdk or AGP (message mentions minCompileSdk or
  "requires Android Gradle plugin"). The error names the library; lower that library, do not raise compileSdk.
- release-assemble.log (non-blocking) and androidtest-compile.log.
- After a green build, install the debug APK on a phone or emulator once: the home screen must show Bengali text correctly.
  This install check is not done by CI.

Next (v0.2.21 or Step C/D): light Phase 0 documents, then the Type_CQ vertical slice (hierarchy -> create question -> list with
keyset paging -> search).
