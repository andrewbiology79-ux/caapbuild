# Version 0.2.23 - Type_CQ question editor, atomic save, automatic drafts, fixed debug signing key

Owner test of v0.2.22 on a phone (18 November 2026): CI report OK, instrumented test OK, adding subject / chapter / topic OK,
no duplicate names OK. First open of the app takes about 5 seconds; the owner accepts this as long as later updates do not make it
longer (even 10 seconds is acceptable). Defect F-3 is closed. Owner request for this step: "do what is best; my questions must never be lost".

## What changed
1. **Fixed debug signing key** (`app/debug.keystore`, committed on purpose; a debug key is not a secret).
   Before, every CI run created a new random debug key, so Android refused to install a new APK over the old one and the only way
   was to uninstall first, which deletes all questions on the phone. With one fixed key every later APK installs as an update and keeps the data.
   `versionCode` is now 23 (it must only grow). The CI report has a new file `apk-signature.txt` with the certificate; the SHA-256
   must be the same in every run: `14:E5:A5:FA:CD:CE:14:29:10:F9:AB:3B:C9:5B:F5:F1:BC:9B:AE:52:65:A9:64:82:81:60:FD:E0:E2:40:43:6D`.
   **One last uninstall is needed** when moving from v0.2.22 (different key). Only test data is lost; after that updates keep the data.
2. **Question types seeded** (idempotent, run on every open): ক জ্ঞানমূলক (1 mark), খ অনুধাবনমূলক (2), গ প্রয়োগমূলক (3), ঘ উচ্চতর দক্ষতা (4).
   Labels and marks are the usual CQ pattern and an assumption of this package; ids and codes stay fixed, only `label` may be renamed later.
3. **Question editor for a topic** (Home -> Type_CQ -> subject -> chapter -> topic -> questions): an optional stimulus (উদ্দীপক) and four
   blocks ক, খ, গ, ঘ, each with question text and optional short answer. A block with an empty question is skipped; a short answer without
   a question is an error (nothing is dropped silently). One save creates the stimulus and all filled sub-questions together.
4. **All-or-nothing save**: stimulus, questions, their FTS search rows and the removal of the draft are ONE database transaction.
   After the commit the rows are read back and compared; "saved" is shown only if they match. On any failure nothing is stored and
   the typed text stays in the editor and in the draft.
5. **Automatic draft**: every change is queued to a writer in the application scope and stored in `app_metadata`
   (key `draft:type_cq:<topicId>`). Leaving the screen, killing the app or a crash cannot cancel the last write. Reopening the editor restores the text.
6. **Durable commits**: `PRAGMA synchronous=FULL` is set on the writer connection before each question save (not inside a transaction;
   SQLite refuses that). The emulator test reads the value back.
7. Questions list per topic, newest first, grouped by stimulus, with a "N questions saved" confirmation after saving.

No schema change: database version 1, identityHash must remain 786b471dfa14c9ae4739bb81479bab25.

## Not in this package (on purpose)
- No edit and no delete of questions (a delete needs a safety design first), no search UI, no boards, categories, images or solutions.
- Paging 3 is not used: a topic's list is read as one list. The 20,000-row baseline (deep OFFSET 4.7 ms) shows lists are cheap; add paging when one topic holds thousands of questions.
- **No backup yet.** Questions live only inside the app's private storage. Uninstalling the app, "Clear data" or losing the phone deletes them.
  Backup export is proposed as the very next package (v0.2.24), before search.

## Tests
- Unit (JVM): new `QuestionRulesTest` (11 tests). Expected total 28 of 28 (17 + 11).
- Emulator: new `TypeCqQuestionRepositoryTest` (10 tests): seed, grouped save, single question, rejected input, rollback after a failure in the middle
  (stimulus + first question inserted, second fails; everything must disappear and the draft must remain), draft round trip and removal by save,
  survive close and reopen (+ integrity_check), Bengali nukta spellings, synchronous=FULL. Expected total 30 (20 + 10).

STATUS: written, NOT compiled, NOT run - UNCONFIRMED.
