# Phase 0–16 Implementation Status — v1.70

**Package:** `QuestionBank_PHASE0_16_v1_70_SOURCE_UNVERIFIED.zip`  
**Base:** v1.68 rechecked source plus v1.69 Phase 0–16 source/docs and v1.70 static corrections.  
**Status:** Source and documentation updated; no build or tests performed.  
**Phase 17:** Not started and intentionally excluded.

| Phase | Current status | Evidence / outstanding item |
|---|---|---|
| 0 Requirements & control | Documentation source-complete / owner sign-off open | Requirements, ADR, risk and phase traceability docs exist; original 146-item matrix was not supplied. |
| 1 Android foundation | Existing source / current candidate unverified | Build configuration preserved; no compile/build. Release signing remains Phase 17. |
| 2 Database/schema | Historical verification + static unchanged comparison | Canonical SQL and Room schema JSON identical to v1.68; DB version 1. No fresh Room parity run. |
| 3 Migration/seeds | Partial | Current schema is v1; no complete Migration-object chain, fixtures or migration execution evidence. |
| 4 Domain/DAO/repository | Partial / source updated | Separate scopes and repositories exist; broad Chapter_CQ/shared/media/paper code remains unverified and layer-boundary findings remain. |
| 5 Hierarchy/reference UI | Partial | Type_CQ Subject→Chapter→Topic and Chapter_CQ Subject→Chapter source retained; full acceptance and reference-data coverage open. |
| 6 Editor state | Partial | Draft source exists; full shared state, Undo/Redo and process-death behavior not closed. |
| 7 Minimum Editor | Partial | Core source is present; 146 behaviors and full scope parity not traced/accepted. |
| 8 Full Editor | Partial | Math rendering, block lifecycle, camera/crop and Chapter_CQ multi-block parity remain open. |
| 9 Atomic persistence | Partial | Journal and transactional source exist; forced failure/process-death/concurrency evidence absent. |
| 10 Image/media | Source implemented / Partial / Unverified | JPEG 2048/88, integrity, reference/orphan helpers, recovery gate and paper-media ownership; runtime fault acceptance and camera/crop/replacement-retention remain. |
| 11 Question management | Partial | Detail/copy/delete/bulk/sort source; Chapter_CQ multi-block, cut/paste and full paging remain. |
| 12 Search/filters | Source implemented / Partial | Cross-scope, board/year/category/rating, Subject→Chapter→Topic (Type_CQ only) and highlighting source; Unicode/performance acceptance open. |
| 13 Paper Builder | Source implemented / Partial / Unverified | Categories, sections, keyset selection, immutable v1 snapshots, overrides, marks, validation, owned media, thumbnails and PDF source. Preview fidelity, snapshot migration and runtime acceptance open. |
| 14 Backup/Restore | Source implemented / Partial / Unverified | ZIP+manifest+DB/media inventory, hash/path checks, staged restore, fail-closed rollback, local periodic worker. WorkManager compatibility, process-death/fault and off-device encryption/cloud remain open. |
| 15 Settings/accessibility | Source updated / Partial / Unverified | Theme, scale, editor default, search highlight, high contrast source. Assistive-technology, focus, target-size and responsive audits open. |
| 16 System integration | Static source review only / NOT COMPLETED | Navigation/container wiring reviewed. Test suite and 146-item audit not run; no RC build. |
| 17 Release | NOT STARTED / EXCLUDED | No signing, release APK/AAB, release installation or distribution work. |

## Important v1.70 corrections
- Media operations now await `ImagePipeline.recoveryGate` before acquiring `MediaSnapshotCoordinator`. This avoids a source-visible deadlock cycle where a mutation could hold the shared lock while waiting for startup recovery, preventing recovery from acquiring that lock.
- Paper marks reject non-finite and negative values; validation reports invalid finite-number states.
- Database schema/version and Android application version metadata remain unchanged.

## Truthful completion statement
The request to advance all work except Phase 17 has been addressed at source and documentation level as far as the available project inputs permit. It is not truthful to mark all Phases 0–16 complete: Phases 0–15 retain the above partial/open requirements, and Phase 16 cannot pass its published exit criteria without tests and the missing 146-item matrix. Phase 17 remains not started.
