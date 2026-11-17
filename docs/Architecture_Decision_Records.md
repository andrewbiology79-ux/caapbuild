# Architecture Decision Records (Question Bank)

Status words: ACCEPTED = decided; CONFIRMED = proven by CI or device run. Source of truth for ADR-001 and the
full history is PROJECT_PLAN_v1_22_UPDATED.txt.

## ADR-001 - One physical SQLite database
ACCEPTED (plan v1.2), runtime-verified on emulator (foreign keys, WAL, triggers, FTS).
One `QuestionBank.db`; Type_CQ and Chapter_CQ keep separate table families and separate repositories.

## ADR-002 - UI toolkit and dependency injection
ACCEPTED in plan v1.21 (proposal by the assistant). OWNER CONFIRMED on 18 November 2026 (owner delegated the choice to the assistant and accepted the recommendation).
Dependencies and first screen: v0.2.20 (written, awaiting CI).

Decision
1. UI toolkit: Jetpack Compose with Material 3, single Activity, Navigation Compose.
2. Lists and search results: Paging 3 (keyset queries, not OFFSET; see P-20).
3. Dependency injection: manual constructor injection through `AppContainer` (created in `QuestionBankApp`).
   No Hilt, Dagger or Koin for now.
4. Rule kept: the UI never calls a DAO; it receives repositories or use cases from the container.

Why
- Compose gives lazy lists that fit Paging 3 and hundreds of thousands of rows; a View/XML UI would need an
  adapter layer for every list.
- The project is one module, built by one person, with KSP already in use. A DI framework adds another
  annotation-processing step and more version coupling to Kotlin 2.4.21 / KSP 2.3.12 / AGP 8.13.2, which has
  already caused build failures (P-01 to P-12). Constructor injection keeps repositories easy to test.
- Cost of changing later is low: classes take their dependencies through constructors, so a framework can
  replace `AppContainer` without touching repositories.

Consequences
- Compose, Navigation Compose and Paging dependencies are added in v0.2.20 together with the first screen, with exact
  versions verified by CI (working rules 1 and 3).
- Version constraint found on 18 November 2026: Compose 1.12.0 and later require compileSdk 37 and AGP 9.2.0 or newer.
  This project is on AGP 8.13.2 / compileSdk 36, so v0.2.20 uses the Compose 1.11.4 line. Moving to Compose 1.12+
  is a separate, CI-verified step (AGP 9 + compileSdk 37 + Gradle upgrade), not part of the UI work.
- Revisit Hilt if the container grows past roughly 15 to 20 wired classes or if ViewModel scoping becomes awkward.

## ADR-003 - FTS rowid keying (F-1) and Unicode normalization (F-2)
ACCEPTED in v1.20, CONFIRMED in v1.21.
`fts_id INTEGER NOT NULL UNIQUE` on both question tables, app-assigned by `FtsIdAllocator`, used as the FTS5 rowid.
NFC normalization (`BanglaText.normalize`) on write and on every search query.
Measured at 300,000 rows (emulator API 34): edit 127.7 ms -> 0.19-0.20 ms per row, delete 117.7 ms -> 0.58-0.70 ms per row.
