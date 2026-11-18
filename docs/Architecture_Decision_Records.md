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


## ADR-009 - UI shell, owner-chosen theme and text size (v0.2.25)
ACCEPTED 18 November 2026 (owner delegated decisions D-1 to D-14 to the assistant; the plan recommendations were taken as they are). ADR-007 (mathematics) and ADR-008 (PDF) stay reserved.
1. The app has five bottom tabs in the owner's order: Create, Type CQ, Chapter CQ, Filter, Profile. Each tab is its own navigation graph, so leaving a tab saves where the owner was and coming back restores it.
2. Theme (Light / Dark) and text size (12 to 28, default 16) are chosen by the owner in Profile, not by the system (D-3). They are kept in SharedPreferences, like the backup status, because the first frame needs them before the database opens (N-1). They are not in the backup file yet; they move into the database together with the other settings.
3. Text size works by scaling the font scale of the whole app from the base size 16, so every screen follows without changing each text.
4. Brand colour #3B4FD8 and the light/dark palette from plan 39.4 (D-4). Cards use 16 dp corners.
5. Numbers shown on screen go through one formatter (`toBengaliDigits`, D-11). File names, database values and search text keep Latin digits.
6. Every screen uses one header component (`AppHeader`): blue bar, back arrow, title, optional subtitle, and it fills the area behind the status bar.
7. Tab icons are plain text glyphs in this package (no new dependency). The Hind Siliguri font is not added: a font file is needed and none can be downloaded in the build environment. Both are small later steps.
8. Back at the first screen asks before leaving the app. The question editor hides the bottom bar.


## ADR-010 - Hierarchy management: counts, rename, delete, reorder (v0.2.26)
PROPOSED 18 November 2026 (assistant decision inside the owner's delegation D-1 to D-14; the owner may overrule item 2).
1. Counts on the list cards come from SQL aggregates (sub-selects over indexed columns), never from lists loaded into memory. "Questions" means question rows (sub-questions), the same unit as "মোট N টি প্রশ্ন" in the question list.
2. Delete is allowed only for an EMPTY item: a subject without chapters and questions, a chapter without topics and questions, a topic without questions. A non-empty item is refused with a message and nothing changes. Reason: the foreign keys are RESTRICT, and deleting questions (with solutions, images and FTS rows) needs the delete-safety design of v0.2.29 (confirmation, shared stimulus text, backup reminder). A cascade delete of a whole subject must not be built before that. The check and the delete run in one transaction.
3. Deleting a topic also removes its unsaved draft (`draft:type_cq:<topicId>` in app_metadata); drafts of other topics stay.
4. Rename uses the same cleaning (NFC, white space, 200 characters) and the same uniqueness scope as add (subject: global; chapter: inside its subject; topic: inside its chapter). Renaming to the item's own name is allowed. Id, position and children do not change.
5. Reorder sends the COMPLETE list of ids in the new order. The DAO compares it with the current ids inside one transaction and writes sort_order 1..n only if the two sets are identical; otherwise nothing is written (an item was added or deleted meanwhile). The arrows change a copy on screen; the database is written once, on "ক্রম সংরক্ষণ". Back or "বাতিল" discards the change.
6. The breadcrumb is [বিষয় তালিকা] + the names above the open list; every part except the last is tappable and pops the back stack to that list.
7. No schema change: database version 1, identityHash must remain 786b471dfa14c9ae4739bb81479bab25.


## ADR-011 - Question card and in-topic search (v0.2.27, part A of the split step)
PROPOSED 18 November 2026 (assistant decision inside the owner's delegation D-1 to D-14; D-12 is followed for the part that exists today).
1. The step "question card + search + open an existing question" of plan 41.5 is split in two (owner decision, plan 42.2). Part A = v0.2.27 = this ADR: read-only card and search. Part B = v0.2.28: open an existing question in the editor and save the change. Part B starts only after part A is confirmed (CI + emulator + phone), as in section 31.4.
2. Search covers ONE topic (the open question list). The global search belongs to the Filter tab (Phase 12).
3. Question text and short answer are searched with FTS5 through the existing `fts_id` join (ADR-003). Every typed word becomes a quoted phrase, so `-`, `:`, `*`, `(` and the words AND / OR / NEAR can never be read as FTS syntax; a double quote typed by the person is removed. The LAST word is a prefix (`"আলো"*`), earlier words must be whole words. All words must match.
4. The stimulus text is NOT in an FTS table. It is matched as plain text (every word is a substring, Latin letters case-insensitive) on the stimulus rows of the open topic only, in Kotlin. A topic is small, so this costs nothing; a global stimulus search would need an FTS table for stimuli (a schema change; open design note P-47).
5. The typed text is normalised to NFC before it is split into words (finding F-2), so both spellings of য় ড় ঢ় find the same rows.
6. A card shows only the sub-questions that matched; a match in the stimulus shows every sub-question of that stimulus (plan 39.3). Groups without a match disappear. The order is the order of the normal list (newest first).
7. The FTS query is a plain prepared statement on a READER connection (`typeCqFtsMatch`), because Room's compile-time query check does not know FTS virtual tables. The repository receives it as a function; the default throws, so a repository that was not wired for search fails loudly instead of answering "nothing found".
8. A search starts 300 ms after the last key; a newer text cancels the older search. The search text lives in Compose snapshot state inside the ViewModel (no keyboard race, survives rotation).
9. Card rating follows rule U-1 (`QuestionCardRules.rating`): stimulus rating, else the average of the question ratings (ties rounded up), else 3. The editor cannot save ratings yet; the value comes from the database columns, which are null today, so every card shows ৩★ until the editor fields of v0.2.29 exist.
10. Not in this package: checkbox, 3-dot menu, board and paper chips, solution toggle, pictures, highlighting of the matched words, search in solutions / boards / years (none of these can be entered yet), search across Bengali and Latin digits (P-46).
11. No schema change: database version 1, identityHash must remain 786b471dfa14c9ae4739bb81479bab25. No new dependency.
12. Because the step is split, the later packages move up by one (plan 42.5): editor fields v0.2.29, delete + selection v0.2.30, JSON paste import v0.2.31. Where ADR-010 says "v0.2.29" for the delete-safety design, read v0.2.30.


## ADR-012 - Edit an existing question, part B-1 (v0.2.28)
PROPOSED 18 November 2026 (assistant decision inside the owner's delegation; the owner asked for the step to be split in two when it is big).
1. Part B of the split step (ADR-011 item 1) is split again by risk. B-1 = v0.2.28 = this ADR: every write that can change a saved question. B-2 = v0.2.29: automatic edit drafts (`draft:type_cq:edit:<id>`). B-2 starts only after B-1 is confirmed (CI + emulator + phone), as in section 31.4. Later packages move up by one (plan 43.4): editor fields v0.2.30, delete + selection v0.2.31, JSON paste import v0.2.32. Where earlier text says "v0.2.30" for the delete-safety design, read v0.2.31.
2. A card is named by `QuestionGroupKey`: "s-<stimulusId>" for a card with a stimulus, "q-<questionId>" for a single question. The key is a navigation argument; ids are UUIDs, so no escaping is needed.
3. The edit screen is a separate screen and ViewModel (`QuestionEditScreen`, `QuestionEditViewModel`), not a mode of the new-question editor. Reason: the new-question editor writes the draft `draft:type_cq:<topicId>` on every key; a shared screen could overwrite the draft of a NEW question with edit text. The two screens share no state.
4. Saving is ONE Room @Transaction (`TypeCqQuestionDao.updateGroup`). Everything that can be checked is checked before the first write (topic, stimulus, question ids belong to the topic); a missing row returns false and writes nothing. After that every write is checked (`UPDATE ... == 1 row`), and any exception rolls back the whole call. The repository reports Updated only after reading the rows back.
5. FTS: no new trigger. `trg_type_question_fts_update` (AFTER UPDATE OF fts_id, question_text, short_answer) already replaces the FTS row through `fts_id`; a new sub-question gets a new `fts_id` from `FtsIdAllocator(maxFtsId())` inside the same transaction, and `trg_type_question_fts_insert` writes its FTS row. The stimulus has no FTS row (ADR-011 item 4).
6. What an edit may NOT do (pure rules, `QuestionEditRules`): blank the text of a stored sub-question or the stimulus of a card that has one (that is a delete, plan 43.4 v0.2.31); leave a short answer without a question text; exceed 20,000 characters. Marks and question types never change (they come from the label). A single question never gains sub-questions or a stimulus. A value equal to the stored value is not written.
7. A new sub-question added to a card gets the card's current highest `sort_order`. Reason: the list is newest-first and a card is placed by its highest `sort_order`; "next sort_order" would move the edited card to the top. `ORDER BY sort_order DESC, question_id` makes the order inside the tie stable, and sub-questions are shown by label anyway.
8. The in-topic search is combined with `observeGroups(topicId)`: whenever the topic's rows change the same text is searched again without the 300 ms wait, so a result never shows text that was just edited.
9. Leaving the edit screen with unsaved changes asks first. B-1 has no edit draft (open problem P-50, by design until v0.2.29).
10. No schema change: database version 1, identityHash must remain 786b471dfa14c9ae4739bb81479bab25. No new dependency.
