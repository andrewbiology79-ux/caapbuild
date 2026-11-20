# Phase 10–12 implementation status — v1.65 rechecked

**Package:** `QuestionBank_PHASE10_12_v1_65_RECHECKED_SOURCE_UNVERIFIED.zip`  
**Baseline:** `QuestionBank_PHASE10_12_v1_64_SOURCE_UNVERIFIED.zip`  
**Project plan:** `PROJECT_PLAN_v1_65_RECHECKED.txt`  
**Date:** 20 November 2026

## Verification boundary
The owner instructed that tests/builds should not be run. This pass performed static source inspection and archive/document consistency checks only. No Gradle build, Kotlin/KSP/Room compile, unit or instrumented test, APK build, emulator or device run was performed. This is not evidence of compilation or runtime success.

## Recheck corrections
- Orphan cleanup is now limited to the app-managed `media/type_cq` and `media/chapter_cq` directories; Paper and other future media namespaces are not swept.
- The collector preserves files tied to pending image-journal operations and removes stale private import staging files only from `media/.pending`.
- Recovery processes only `IMAGE_IMPORT`, `IMAGE_TRANSFORM` and `IMAGE_DELETE`, leaving unrelated shared-journal operations untouched.
- Media-library delete requires explicit confirmation and still refuses deletion while stimulus/solution references exist.
- Image-picker scope is captured at launch, rather than using whichever scope happens to be selected when the picker returns.
- Media operations are gated until recovery/reconciliation has completed successfully on media-library entry.
- Question-card delete confirmation now accurately states that the complete source group is deleted, including when the card is displayed from filtered search results.

## Phase status

### Phase 10 — Image and Media Pipeline
**PARTIAL / WRITTEN / UNVERIFIED**

Written source: private-storage SAF import/export; JPEG downscaling/compression; decode and SHA-256 verification; journalled import/transform/delete; centre-square crop and 90-degree rotate; reference-guarded delete; pending-operation recovery; scoped missing/corrupt reconciliation and temporary/orphan collection; Type_CQ/Chapter_CQ media-library UI.

Still open: EditorDraft and stimulus/solution attachment linking; TOP/BOTTOM placement; image ordering/replacement/unlink UI; interactive crop; camera; dedicated full-screen viewer; application-startup recovery scheduling; complete paper asset ownership/retention policy; media backup/restore.

### Phase 11 — Question Cards and Management
**PARTIAL / WRITTEN / UNVERIFIED**

Written source: confirmation-gated Type_CQ group deletion with transactional scope/read-back checks; confirmation-gated Chapter_CQ single-question deletion with chapter validation and unused-stimulus cleanup.

Still open: dedicated detail screen; copy/cut/paste; multi-select; bulk operations; group reorder; sorting/pagination; Chapter_CQ multi-block group editing/deletion.

### Phase 12 — Search, Filters and Duplicate Detection
**PARTIAL / WRITTEN / UNVERIFIED**

Written source: Type_CQ in-topic search with category, rating and question-type filters combined with existing board/year/text behavior; category links are projected for filtering; filter-only operation without a text term is supported.

Still open: global cross-scope search/filter; Chapter_CQ search and filters; expanded Bengali/English acceptance coverage; performance/behavior verification.

## Database/build/version boundary
No canonical SQL, Room Entity inventory, Room schema JSON, database version, identityHash, app `versionCode` or `versionName` was intentionally changed. App metadata remains `36 / 0.2.31-phase5-wip2`. Phase 9 duplicate-save and forced-failure/rollback evidence remains open. No APK is included.
