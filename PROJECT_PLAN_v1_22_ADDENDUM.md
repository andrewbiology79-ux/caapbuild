# Development Plan v1.22 Addendum — v0.2.20

Date: 17 November 2026
Baseline: Development Plan v1.21, package v0.2.19, supplied CI Run 27 and 300,000-row instrumented report.

## Evidence accepted from v0.2.19 reports
- CI Run 27 (commit `1bbddf3a8f460859acfe593226ff3e2b36808adf`): Gradle exit 0; 11/11 unit tests; KSP and debug assembly passed; release `assembleRelease` passed.
- Emulator API 34 x86_64, 300,000 questions: 11/11 instrumented tests passed.
- Benchmark: import 51.181 s / 5,862 rows/s; database 584,012 KB; WAL peak 34,098 KB; checkpoint 3 ms; FTS optimize 559 ms; rank search 131.7 ms; deep OFFSET 150,000 = 505.4 ms; edit 0.17 ms/row; delete 0.54 ms/row.
- F-1 and F-2 remain confirmed for the database layer. The supplied instrumented report's `instrumented-run.txt` contains only `benchmarkRows=300000`; it does not identify commit/run/device/API. v0.2.20 adds these provenance fields for future reports.

## v0.2.20 changes
- Compose + Material 3 single-Activity home shell.
- Navigation Compose with home destination.
- Paging 3 runtime and Compose dependencies, reserved for keyset-backed data layer.
- Compose compiler plugin matched to Kotlin plugin.
- Gradle wrapper and workflows updated to 8.14.4.
- Instrumented report provenance metadata added.

## Verification state
v0.2.20 is written but NOT compiled or run. The local wrapper attempt failed before Gradle startup because `services.gradle.org` could not be resolved in the preparation environment. GitHub CI is the required verification gate. Do not mark Step B complete until CI confirms KSP, unit tests, Compose compilation, debug assembly, androidTest compilation and release assembly.

## Next actions
1. Push v0.2.20 and inspect all CI logs; confirm the new dependency versions resolve and all tasks pass.
2. Run the instrumented workflow once after CI green; confirm metadata identifies the same commit and emulator.
3. Extend Room schema parity to compare column defaults and FK `ON UPDATE` actions.
4. Add explicit runtime coverage for all 48 CHECK clauses and all 17 canonical triggers (including Chapter_CQ and Paper integrity cases).
5. Start Step C documentation and Step D Type_CQ vertical slice: DAO -> Repository -> UseCase -> ViewModel -> Compose UI. Implement keyset paging, not OFFSET.
