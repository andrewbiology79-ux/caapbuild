# Phase 13–16 Static Integration Review — v1.67

**Scope:** source-level inspection only. This document is not a build report, test report or runtime validation.

## Integration paths reviewed

- Create tab → `PaperBuilderScreen` → `PaperRepositoryImpl` → scope-specific Type_CQ / Chapter_CQ DAOs and shared paper persistence.
- Paper media copy/delete → `ImagePipeline` recovery gate → `paper_media` storage and paper image tables.
- Profile → default editor/search highlighting preferences → Type_CQ editor, Type_CQ Edit, Chapter_CQ workspace and Global Search.
- Profile → Backup screen → `BackupService` → database snapshot + `BackupArchive` ZIP manifest and media inventory.
- Restore confirmation → staged DB/media → `QuestionBankApp.onCreate` → `RestoreSwap.applyIfPending` before `AppContainer`/Room DB is constructed.
- `QuestionBankApp.onCreate` → unique WorkManager image recovery enqueue → `ImageRecoveryWorker` → `ImagePipeline.runStartupRecovery` and paper orphan cleanup.
- Global Search hierarchy filter state → scope-qualified Subject/Chapter/Topic filters → combined Type_CQ/Chapter_CQ SQL branches.

## Static corrections made during this update

1. Added `mediaFileCount` and `includesMedia` to restore preview model and `mediaFiles` to export result model to match the backup UI/service call sites.
2. Added default editor mode to `QuestionEditViewModel`; the constructor call from navigation previously supplied this argument without a matching parameter. Canonical stored draft mode remains the restored override.
3. Invalid scope-qualified hierarchy selector values are rejected rather than accidentally degrading to an unfiltered search.
4. Paper-media deletion now waits for the recovery gate; orphan metadata is removed only when file deletion/absence is safely resolved.
5. Restore swap preserves even previously absent/empty media namespace directories before installing the incoming set, allowing interrupted restore recovery to reinstate the old pair.
6. Added database version and Room identity hash to backup manifest and compares the recorded values with the extracted DB inspection result.
7. Added a manifest size limit and removed a duplicate stream-end check.

## Known source-level risks and incomplete work

- No compile-time validation was performed; further Kotlin, Compose, Room/KSP or dependency-resolution issues may remain.
- Backup archive creation does not yet share a single mutex with all media mutations; a media change during the snapshot operation could produce an inconsistent archive inventory.
- Background BackupWorker/RestoreWorker orchestration and automatic backup policy are not implemented.
- Paper preview does not render image assets; complete per-item override UI/preview and PDF/print export are missing.
- Paper source list is currently loaded as a Flow and truncated in UI to the first 80 filtered entries; it is not database-paged.
- The settings UI does not constitute a full accessibility or responsive-layout audit.
- Phase 16 acceptance requires test execution and the 146-item traceability review. Both remain not run/not complete.

## Commands intentionally not run

No Gradle build, compile, lint, unit test, instrumentation test, Room test, migration test, UI automation, emulator/device run or APK assembly was executed.

## Final source-only corrections in this package pass
- Preserved the extension and MIME type of existing supported JPEG/PNG/WebP images when copying them into independent `paper_media` storage; new imports still follow the accepted JPEG/2048px/quality-88 policy.
- Enforced the 8 MiB manifest cap while extracting the ZIP entry, rather than only after the entry had been written to the staging directory.
- Confirmed by source inspection that `QuestionBankApp` is declared in the application manifest and performs the restore swap before the lazily opened Room container is created.
- Recorded WorkManager 2.12.0 as a new dependency that is explicitly UNCONFIRMED until dependency resolution/build evidence exists.


## v1.68 recheck findings and corrective patch

### Critical finding in v1.67 RestoreSwap
The earlier rollback/recovery paths ignored `renameTo()`/delete outcomes and unconditionally removed the recovery marker. If a rollback move failed, the next startup could no longer know that the prior database/media pair needed restoration. v1.68 now checks those operations, retains the marker on failure, moves WAL/SHM before the main DB, and prevents Room initialization when `recoveryRequired` is true.

### Important remaining risks
- `BackupArchive.write()` hashes media source files during inventory and reopens them later for ZIP writing; no shared lock with image mutations makes the manifest/archive vulnerable to concurrent media changes.
- `BackupService.exportTo()` compares the selected destination byte stream with the generated ZIP but does not validate the completed ZIP's internal manifest and entry hashes before recording `Done`.
- No `BackupWorker` or `RestoreWorker` source exists; automatic backup policy remains unimplemented.
- Paper media orphan collection works from orphan database rows but does not sweep unreferenced files that never received a database row after an interrupted copy.
- Paper source list paging, image-rendering preview, complete overrides/sections/library/export, and full accessibility audit remain incomplete.

No tests or build commands were run. The corrective patch is static-only and remains uncompiled/unverified.
