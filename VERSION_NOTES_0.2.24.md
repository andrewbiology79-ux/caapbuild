# Version 0.2.24 - Backup export and restore (plan v1.26, section 38, part A of the split next step)

Owner test of v0.2.23 (18 November 2026): CI report OK; instrumented test OK; questions save, and after removing the app from the recent
apps list and reopening, the questions are still shown; unsaved (draft) questions also come back. The owner asked to split the next step into two parts.
Part A = this package (backup). Part B = v0.2.25 (question search, edit, delete).

## What changed
1. **Home -> "ব্যাকআপ ও রিস্টোর"** screen. The home screen also shows the last backup time (read from preferences, no database access at start).
2. **Backup export**: consistent copy of the whole database (VACUUM INTO) -> inspected -> written to a file the owner picks (Drive, phone storage,
   USB...) -> read back and compared (SHA-256). "সম্পন্ন" is shown only after all of that. File name `QuestionBank-backup-YYYYMMDD-HHMM.db`.
3. **Restore**: pick a backup file -> it is inspected (integrity, foreign keys, same database structure as this app) -> the owner sees what the backup
   contains next to what the app holds now -> confirm -> the app asks to be closed -> at the next start the swap is made before the database opens.
   The previous database stays on the phone as `QuestionBank.db.replaced` (+ -wal/-shm) until the next restore. A damaged file is rejected and nothing changes.
4. The backup screen warns when no backup exists or the number of questions changed since the last backup.
5. `versionCode` 24. No schema change: database version 1, identityHash must remain 786b471dfa14c9ae4739bb81479bab25.

## Not in this package (on purpose)
- No automatic or scheduled backup (manual only). No encryption or password on the backup file.
- Restore needs the app to be closed and reopened once (by design, ADR-006). No merge of a backup into existing data: restore replaces everything.
- Question search, edit and delete are part B (v0.2.25).

## Tests
- Unit (JVM): new `RestoreSwapTest` (7 tests: nothing pending, applied swap with -wal, rejected file, no previous database, second restore,
  failure half way keeps the current database, file-name format). Expected total 35 of 35 (28 + 7).
- Emulator: new `BackupRestoreTest` (7 tests: snapshot passes inspection and counts match; snapshot holds triggers and FTS tables and Room opens it;
  rejects empty / text / truncated files; rejects plain SQLite; rejects other schema hash; full restore cycle with safety copy; damaged pending restore).
  Expected total 37 (30 + 7).

STATUS: written, NOT compiled, NOT run - UNCONFIRMED.
