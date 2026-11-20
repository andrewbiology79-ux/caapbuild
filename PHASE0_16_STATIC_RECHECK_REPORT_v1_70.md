# Static Recheck Report — v1.70

## Scope
The v1.68 archive was the baseline for the coordinated v1.69 source/documentation update. This v1.70 pass re-opened the modified source and inspected recovery lock ordering and paper marks. No Gradle build, compiler, KSP/Room generation, test or Android runtime was executed.

## Critical source correction — media recovery lock order
A deadlock was possible if a media mutation entered `MediaSnapshotCoordinator.withMutation` and then awaited `recoveryGate`, because `runStartupRecovery()` needs the same coordinator lock before it can replay operations and complete the gate. The affected paths are now ordered as:

1. Await `recoveryGate` without holding the coordinator lock.
2. Acquire `MediaSnapshotCoordinator` for the actual media mutation or snapshot operation.

This order is applied to `importImage`, `transformImage`, `deleteImage`, `exportImage`, `copyImageToPaperStorage`, `deletePaperStorageAsset` and `collectUntrackedPaperFiles`. `runStartupRecovery()` still takes the lock, recovers pending journal operations and reconciles managed directories, then completes the gate. Read-only asset verification and lookup await the gate without acquiring the shared lock.

This removes the identified lock-order cycle in source. It is not a concurrency-test result.

## Paper numeric validation correction
- Paper total marks and item marks reject NaN, positive/negative infinity and negative values at repository write boundaries.
- `validatePaper()` records non-finite values as validation issues and does not add them to the computed marks total.
- No database schema or Room version change was made.

## Carried-forward source advances from v1.69
- Paper category library, sections, cross-scope keyset source selection, snapshot v1, per-item text/answer/solution overrides, marks, validation, paper-owned media, thumbnails and PDF export.
- Manual `.qbbak` ZIP with DB and three media namespaces, manifest inventory, SHA-256 and path checks; staged restore and fail-closed rollback; periodic app-private backup policy source.
- Settings preferences and high-contrast theme source.
- Navigation and dependency-container wiring.
- Requirements, ADR, screen, feature traceability, risk, handover and no-test documentation.

## Data compatibility
- Canonical SQL and Room exported schema JSON are byte-identical to v1.68.
- `QuestionBankDatabase` version remains 1.
- `versionCode=36`; `versionName=0.2.31-phase5-wip2`.
- No DB schema change was made in v1.69/v1.70.

## Open blockers and non-claims
- Phase 0 original 146-item behavior matrix absent; exact requirement-to-source traceability and owner sign-off are open.
- Phase 3 has no complete Migration-object chain/fixtures/execution evidence.
- Phases 4–9 still have layer, editor parity, Undo/Redo, full editor, process-death and persistence fault acceptance gaps.
- Phase 10 camera/interactive crop, replacement retention and complete media fault acceptance remain open.
- Phase 11 Chapter_CQ multi-block/cut-paste/paging gaps remain.
- Phase 12 full Unicode equivalence, highlighting and large dataset performance remain.
- Phase 13 PDF Bengali font embedding, page fidelity, full preview experience and snapshot migration beyond v1 remain.
- Phase 14 WorkManager 2.12.0 is unconfirmed; automatic local backups do not protect against uninstall/Clear data/device loss; no encryption/cloud; multi-process lock and restore fault/process-death behavior are unverified. `RestoreWorker` is post-swap read-only inspection; actual swap is at cold start before Room opens.
- Phase 15 full screen-reader, keyboard/focus, touch-target and responsive audits remain.
- Phase 16 tests, 146-item audit and RC build are absent by instruction. Phase 16 is not completed.
- Phase 17 remains not started.

## Verification boundary
Permitted checks are source reading, project diff, schema/version byte comparison, static path/order inspection, archive entry integrity and SHA-256. These do not prove Kotlin compilation, Android runtime correctness, restore durability, visual output or release readiness.
