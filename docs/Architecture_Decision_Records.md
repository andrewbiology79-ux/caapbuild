# Architecture Decision Records (Question Bank)

Status words: ACCEPTED = decided; CONFIRMED = proven by CI or device run. Source of truth for ADR-001 and the
full history is PROJECT_PLAN_v1_24_UPDATED.txt.

## ADR-001 - One physical SQLite database
ACCEPTED (plan v1.2), runtime-verified on emulator (foreign keys, WAL, triggers, FTS).
One `QuestionBank.db`; Type_CQ and Chapter_CQ keep separate table families and separate repositories.

## ADR-002 - UI toolkit and dependency injection
ACCEPTED in plan v1.21 (proposal by the assistant). OWNER CONFIRMED on 18 November 2026 (owner delegated the choice to the assistant and accepted the recommendation).
Dependencies and first screen: v0.2.20 (APK built by CI, installed on a phone by the owner; Bengali text correct).

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

## ADR-004 - Identifiers, timestamps and hierarchy names (Step D, v0.2.21)
ACCEPTED 18 November 2026 (assistant proposal; owner may overrule before more data is entered).
1. Primary keys of subjects, chapters, topics (and later questions) are random UUID v4 text, generated in the repository.
   Reason: the columns are TEXT, backups and imports can merge without clashes, no central counter is needed.
2. `created_at` / `updated_at` are epoch milliseconds, UTC.
3. Names go through `HierarchyName.clean` (NFC, white space collapsed, trimmed, at most 200 characters) before any write.
   Implemented as a plain character loop, not a regex: Android rejects the `(?U)` regex flag (v0.2.21 failure, fixed in v0.2.22).
4. Uniqueness: subject names are unique in the whole Type_CQ scope (database unique index). Chapter names are unique inside one
   subject and topic names inside one chapter; this is checked in the repository, not by an index. For one user on one phone
   that is enough. If imports or sync ever write concurrently, add a unique index through a schema migration.
5. `sort_order` is assigned as MAX+1 inside the same INSERT statement, so ordering is atomic. Lists are ordered by
   sort_order, then name, then id.
6. No delete or rename in v0.2.21 (foreign keys use RESTRICT); both belong to the Phase 5 hierarchy management work.

## ADR-005 - Never losing a question (Step D, v0.2.23)
ACCEPTED 18 November 2026 (owner requirement: questions entered in the app must not be lost).
1. One save = one transaction: stimulus, sub-questions, FTS rows (canonical triggers) and removal of the draft. A DAO `@Transaction` method
   does it, so Room rolls everything back on any exception. Reason: no half-saved group, no draft that disappears without a saved question.
2. Success is reported only after a read-back of the stored texts (compared with what was sent).
3. Drafts are stored in `app_metadata` (existing table, no schema change), written by an application-scope writer with a conflated queue.
   Reason: viewModelScope is cancelled when a screen is left; the app scope is not. A blank draft deletes the row.
4. `PRAGMA synchronous=FULL` on the writer connection before every question save, outside any transaction.
5. One fixed debug signing key is committed (`app/debug.keystore`, alias androiddebugkey, password android). Release signing stays a Phase 17 decision;
   the release key must NOT be committed. Reason: updates must install over the old app, otherwise the data is deleted by the forced uninstall.
6. Question types are fixed by the sub-question label (ক 1, খ 2, গ 3, ঘ 4 marks) and seeded with fixed ids; the editor does not ask for a type.
7. Known gap (accepted for now): data lives only in app-private storage and `allowBackup` is false. A user-controlled backup export is the next step.


## ADR-006 - Backup export and restore (Step D, v0.2.24)
ACCEPTED 18 November 2026 (closes the known gap of ADR-005 item 7; problem P-31).
1. Export is a consistent copy made with `VACUUM INTO` on the writer connection: it includes rows that are still only in the -wal file,
   needs no closing and no checkpoint, and the row counts are read on the same connection right after the copy.
2. A backup counts as made only after: integrity_check = ok, foreign_key_check empty, counts equal to the live database, the file
   written to the owner's chosen location (Storage Access Framework, no storage permission), then read back and compared by SHA-256.
3. The backup is a plain SQLite file (`QuestionBank-backup-YYYYMMDD-HHMM.db`) of the whole database. Any later table (images metadata,
   papers) is included automatically. Image FILES are not in the database; when images arrive (Phase 8) the backup format must be extended (new ADR).
4. Restore never replaces a live database connection. Step 1 (running app): the chosen file is copied to the cache, inspected (also: same Room
   identity hash as the running app), the owner sees backup counts next to current counts and confirms; it is then staged as `<db>.restore-pending`
   and the database is closed; a non-dismissable dialog asks to close the app. Step 2 (next process start, `QuestionBankApp.onCreate`, before the
   database can be opened): the staged file is inspected again and swapped in; the previous database (main + -wal + -shm) is kept as `<db>.replaced*`
   until the next restore. Any failure moves the previous files back.
5. Backup status (last time, question count then) lives in SharedPreferences, not in the database: the home screen shows it without opening the
   database (requirement N-1) and it survives a restore.
6. There is no automatic scheduled backup yet; the screen warns when the question count changed since the last backup.
