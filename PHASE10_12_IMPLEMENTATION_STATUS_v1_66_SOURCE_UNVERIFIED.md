# Question Bank — Phase 10–12 implementation status (v1.66)

**Package:** `QuestionBank_PHASE10_12_v1_66_SOURCE_UNVERIFIED.zip`  
**Date:** 20 November 2026  
**Status:** Partial / source implemented / unverified  
**Verification boundary:** No Gradle build, Kotlin compile, KSP/Room generation, unit test, instrumented test, APK assembly, emulator run or phone test was performed, as instructed.

## What was added

### Phase 10 — Editor image/media integration

- Type_CQ and Chapter_CQ Editor state now carries stimulus-image references and ordered mixed TEXT/IMAGE solution parts.
- Editor controls import images through the existing SAF media pipeline, capture scope when the picker opens, set stimulus placement to TOP/BOTTOM, reorder, replace and unlink stimulus images, and add/remove/replace/reorder images within the mixed solution sequence. A replaced asset is not automatically deleted; safe retention/cleanup remains open.
- Image previews resolve through the correct scope. Import errors are surfaced in the Editor.
- Type_CQ newly added sub-question blocks in an Edit save can write ordered mixed solution parts.
- Chapter_CQ Editor draft snapshots and transactional save path retain stimulus images and mixed solution parts.

### Phase 11 — Question management

- Added Type_CQ question-detail screen and Chapter_CQ detail dialog.
- Type_CQ group duplicate/copy carries question text, stimulus, stimulus-image links, ordered solutions, tags and categories.
- Type_CQ full-group batch delete validates the complete group and runs through one transaction; filtering does not reduce the deletion target to visible rows.
- Chapter_CQ individual duplicate/copy and multi-select batch deletion are wired with chapter ownership checks and transactional persistence.
- Added rating/marks/type sorting. Type_CQ adds a 40-item incremental load-more action.

### Phase 12 — Global search

- Added a global search repository/use case/ViewModel/screen over both existing FTS5 indexes.
- Supports ALL / Type_CQ / Chapter_CQ scopes, text search, board, year, category, rating and Type_CQ question-type filters.
- Results show scope and hierarchy, stimulus/question text, answer, tags/categories and rating/marks; they open the corresponding detail surface.
- Adds an exact lowercased/trimmed-text duplicate warning across scopes. It is not fuzzy matching.
- Added stale-query generation protection and corrected the rating fallback for stimulus-less questions.

## Remaining work / known limitations

- Phase 10: automatic cleanup/retention of the previous image asset after a replacement; adding a new stimulus from Type_CQ Edit for an existing question without a stimulus; camera capture; interactive crop UI; app-startup recovery scheduling; paper media ownership/retention and media backup/restore; unowned metadata-row cleanup.
- Phase 11: Chapter_CQ multi-block stimulus-group editing and group-level management; cut/paste; Chapter_CQ pagination and database-backed Paging 3; large-dataset UI behavior.
- Phase 12: full Unicode-normalized duplicate matching, Bengali/Latin digit unification, fuzzy matching, result highlighting and search pagination/counts; Bengali/English/FTS/performance acceptance coverage.
- Phase 9 duplicate-save and forced-failure/rollback evidence remains outstanding.

## Preserved contracts

- Canonical SQL, Room Entities, exported Room schema JSON, database version `1`, and identityHash `786b471dfa14c9ae4739bb81479bab25` were not changed.
- Application metadata remains `versionCode=36`, `versionName=0.2.31-phase5-wip2`.
- Type_CQ and Chapter_CQ continue to use separate repository/data boundaries. Global search is a read-only shared projection over the two FTS tables.

## Verification statement

Only static source inspection and packaging/archive-integrity checks were performed. These do not prove compilation, Room processing, SQL runtime behavior, UI operation, image recovery, or feature acceptance. No APK was produced.
