# Careful recheck report — Question Bank v1.67 / v1.68 source candidate

**Rechecked:** 20 November 2026  
**Reviewed source:** `QuestionBank_PHASE13_16_v1_67_SOURCE_UNVERIFIED.zip`  
**Corrective package:** `QuestionBank_PHASE13_16_v1_68_RECHECKED_SOURCE_UNVERIFIED.zip`  
**Scope:** Archive inspection, source diff, static Kotlin/Compose/manifest/plan review only.  
**Build/tests:** NOT RUN, per owner instruction.

## Executive result

The v1.67 archive itself was intact, but the application source must not be described as verified or release-ready. A critical restore rollback weakness was found in `RestoreSwap.kt`. A source-level correction is included in v1.68: rollback operations are checked, the marker remains when rollback is incomplete, WAL/SHM are moved before the main DB, and startup refuses to open Room while recovery is incomplete.

The v1.68 candidate is still **SOURCE UPDATED / UNVERIFIED**. This recheck did not compile the code or exercise restore behavior. Important Phase 14, Phase 13, Phase 15 and Phase 16 work remains incomplete.

## What was checked

- ZIP integrity and the supplied SHA-256 for the v1.67 package.
- Package file inventory and source diff against v1.66.
- Canonical SQL, Room schema export, Room database registration, database version and app version metadata.
- Paper Builder UI/repository/snapshot/media ownership path.
- Backup service, archive manifest/hash/extraction path, restore staging and application startup order.
- Image recovery gate and worker scheduling source.
- Settings preference wiring and Global Search hierarchy-filter integration.
- Project Plan v1.67 phase ledger and implementation status documents.

## Archive and baseline result

- v1.67 archive: 295 entries; archive entry validation passed.
- Supplied SHA-256 matched: `93d5fb6403feb20688bb4affde764155432f4f1f08f45a0c6608b379aada5495`.
- Comparison to v1.66: 38 paths added or changed; no source path deletions observed.
- Canonical SQL, Room schema JSON, Room database registration, database version 1, Room identity hash `786b471dfa14c9ae4739bb81479bab25`, `versionCode=36` and `versionName=0.2.31-phase5-wip2` were unchanged by v1.67.
- These results establish file/archive consistency and metadata comparison only. They do not prove compilation or runtime behavior.

## Critical finding fixed in v1.68 source

### v1.67 defect

`RestoreSwap.applyIfPending()` and `recoverInterrupted()` ignored Boolean results from file rename/delete operations and then deleted `.restore-in-progress`. If the rollback rename failed, the only preserved old database/media copy could remain under `.replaced` without a recovery marker. Application startup would still proceed to construct `AppContainer`, allowing Room to open after an incomplete restore.

### v1.68 source change

- WAL/SHM sidecars move before the main database.
- Recovery restores only `.replaced` sidecars that actually exist, supporting interruption between sidecar moves.
- Every required delete/rename is checked.
- `.restore-in-progress` is retained if rollback is incomplete.
- `Outcome.Failed` carries `recoveryRequired` when recovery cannot finish.
- `QuestionBankApp` refuses to initialize the Room container while that flag is true.
- The marker is fsynced before live paths move.

**Status:** Corrected in source only. No fault-injection or restore test was run. Fail-closed startup may prevent the app from opening until a later recovery attempt succeeds; that is intentional data protection, not a verified recovery success.

## Remaining important findings

### High — Backup media snapshot is not atomic with media mutations

`BackupArchive.write()` first enumerates media files and calculates each file's size/SHA-256, then later reopens the source files to write ZIP entries. Image import/transform/delete and paper-media copy/delete do not share one backup snapshot mutex. A concurrent mutation can make archived bytes differ from the manifest. `BackupService.exportTo()` checks the selected output equals the generated ZIP byte-for-byte but does not validate the finished ZIP's internal manifest/entry hashes before recording `Done`. A backup could therefore be reported as exported and subsequently be rejected during restore.

**Required follow-up:** introduce a shared media snapshot/mutation coordination boundary or immutable media staging snapshot, and validate the completed archive internally before export success is recorded.

### High — Phase 14 worker/policy deliverables are missing

No `BackupWorker` or `RestoreWorker` source exists. Only image startup recovery WorkManager code was found. Automatic backup policy/background orchestration remains open.

### Medium — Restore preview counts are Type_CQ-only

The backup database contains both question scopes, but `DbCounts` and the preview summary count Type_CQ subjects/chapters/topics/stimuli/questions only. Chapter_CQ counts are not represented in the user's restore comparison.

### Medium — Paper media orphan sweep is incomplete

`PaperRepositoryImpl.collectOrphanMedia()` processes `unreferencedPaperImages()` rows and deletes their files. It does not scan `paper_media` for a file copied before a database row was committed and then orphaned by process death. This can leave unused media files on disk.

## Phase-by-phase status

| Phase | Recheck status | Remaining work |
|---|---|---|
| 13 Paper Builder | SOURCE UPDATED / PARTIAL / UNVERIFIED | Paging beyond first 80 source rows, image rendering in preview, complete item overrides, section deletion, library/category management, approved PDF/print/export and full acceptance |
| 14 Backup & Restore | SOURCE UPDATED / PARTIAL / UNVERIFIED | Shared media snapshot lock, completed-archive self-validation, BackupWorker/RestoreWorker, automatic policy, failure/low-storage/process-death validation |
| 15 Settings & Accessibility | SOURCE UPDATED / PARTIAL / UNVERIFIED | Full keyboard/focus, screen reader, touch targets, responsive layouts, fonts, image preferences, interaction polish and accessibility audit |
| 16 System Integration & Regression | SOURCE INTEGRATION REVIEW ONLY / NOT COMPLETED | Regression suite and 146-item Editor audit not executed; no reports or release-candidate build |
| 17 Release & Delivery | NOT STARTED | Release build/signing/installation/upgrade and release deliverables |

## Explicit no-test boundary

No Gradle build, compile, lint, KSP/Room generation, unit test, instrumentation/UI test, migration test, emulator/device run or APK assembly was performed. Existing test sources were inspected only; they were not executed.

**Final assessment:** v1.67 is archive-intact but had a critical restore rollback flaw. v1.68 contains a static source correction for that flaw. Neither package is a tested application release. Phase 13–16 are not all complete, and Phase 17 remains outstanding.


## Additional limitation of the corrective startup guard

If filesystem permissions or storage failure prevent rollback, v1.68 deliberately throws before constructing `AppContainer`, preventing Room from opening a possibly inconsistent database. This fail-closed condition may leave the app unable to start until a later recovery attempt or manual file recovery succeeds. A dedicated no-database recovery UI is not implemented.
