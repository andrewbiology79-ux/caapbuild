# Phase 10–12 implementation status — v1.64

**Package:** `QuestionBank_PHASE10_12_v1_64_SOURCE_UNVERIFIED.zip`  
**Baseline:** `QuestionBank_PHASE9_v1_63_RECHECKED_SOURCE_UNVERIFIED.zip`  
**Project plan:** `PROJECT_PLAN_v1_64_UPDATED.txt`  
**Date:** 20 November 2026

## Owner instruction
The owner requested Phase 10, 11 and 12 source work together and explicitly instructed not to run tests. No Gradle build, Kotlin/KSP/Room compile, unit or instrumented test, APK build, emulator or device run was performed. Source presence and static inspection are not proof of compile/runtime success.

## Phase 10 — Image and Media Pipeline
**Status: PARTIAL / WRITTEN / UNVERIFIED**

Written source includes a Type_CQ/Chapter_CQ media library; SAF image import to private storage; bounded bitmap decoding, JPEG downscaling/compression; SHA-256; journalled import/transform/delete; atomic move with fallback; centre-square crop; 90-degree rotation; checksum-checked SAF export; reference-guarded deletion; pending-operation recovery; missing/corrupt status reconciliation; and temporary/untracked file collection.

Still open: editor attachment/linking to stimulus and solution parts, TOP/BOTTOM placement, image ordering/replacement/unlink UI, interactive crop, camera, full-screen viewer, startup recovery scheduling and a complete metadata/paper asset ownership policy.

## Phase 11 — Question Cards and Management
**Status: PARTIAL / WRITTEN / UNVERIFIED**

Type_CQ card deletion is confirmation-gated and transaction-backed with scope validation/read-back. Chapter_CQ now has confirmation-gated single-question deletion with chapter-scope validation and unused-stimulus cleanup. Existing paper/reference restrictions are not bypassed.

Still open: dedicated detail screen, copy/cut/paste, multi-select, bulk group operations, reorder, sorting/pagination and Chapter_CQ multi-block group editing/deletion.

## Phase 12 — Search, Filters and Duplicate Detection
**Status: PARTIAL / WRITTEN / UNVERIFIED**

Type_CQ in-topic search now has category, rating and question-type filters combined with existing board/year and text matching. Category links are projected into question groups. Filter-only use without a typed search term is supported by the source flow.

Still open: global cross-scope Search/Filter tab, Chapter_CQ search and its filters, broader Bengali/English acceptance coverage and performance/behavior verification.

## Database/build/version boundary
No canonical SQL, Room Entity inventory, database version, exported Room schema, identityHash, app `versionCode` or `versionName` was intentionally changed. App version metadata remains `36 / 0.2.31-phase5-wip2`. The Phase 9 duplicate-save and forced-failure/rollback evidence remains open; Phase 9 was not promoted to complete.

## Suggested next work
1. Integrate images into both editors and ordered stimulus/solution image relations.
2. Finish question detail and group management, including Chapter_CQ multi-block operations.
3. Finish global cross-scope and Chapter_CQ search/filter.
4. Obtain owner authorization for CI/build and acceptance verification before promoting any phase.
