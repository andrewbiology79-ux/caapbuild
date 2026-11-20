# Version notes — v1.66 (source-only, unverified)

**Package:** QuestionBank_PHASE10_12_v1_66_SOURCE_UNVERIFIED.zip  
**Based on:** QuestionBank_PHASE10_12_v1_65_RECHECKED_SOURCE_UNVERIFIED.zip  
**Date:** 20 November 2026

## Added

- Type_CQ/Chapter_CQ Editor stimulus-image attachments, TOP/BOTTOM placement, ordering, draft-link replacement and unlink controls.
- Mixed ordered TEXT/IMAGE solution editing and image attachment/replacement/reordering in both scopes.
- Type_CQ question detail, group duplicate/copy, full-group batch delete, sort and incremental list expansion.
- Chapter_CQ question detail, duplicate/copy, multi-select batch deletion and sorting.
- Global search across Type_CQ and Chapter_CQ FTS indexes with scope, board, year, category, rating and Type_CQ question-type filters.
- Exact lower/trimmed question-text duplicate indication and detail navigation from global results.

## Static corrections

- Preserve Type_CQ image solution parts when text solution rows are edited.
- Persist ordered solution parts for newly added Type_CQ sub-question rows during Edit.
- Capture media picker scope at launch.
- Prevent stale global-search jobs from replacing newer query results.
- Avoid averaging ratings across unrelated Type_CQ/Chapter_CQ questions that have no stimulus.
- Avoid cross-scope duplicate false negatives when IDs collide between separate scope tables.

## Not done

- No Gradle build, compile, KSP/Room generation, unit/instrumented test, APK assembly, emulator test or device test.
- No change to canonical SQL, Room schema, database identity/version or application version metadata.
- No APK or signed release artifact.

## Still open

Automatic cleanup/retention of the prior asset after image replacement, Type_CQ Edit adding a stimulus to a previously standalone question, camera/interactive crop, startup recovery scheduling, paper media retention/backup, Chapter_CQ multi-block group management, cut/paste, Chapter_CQ paging, complete Unicode normalization, result highlighting and runtime/performance acceptance.

**Status:** Phases 10–12 remain PARTIAL / SOURCE IMPLEMENTED / UNVERIFIED. This archive is not a tested application release.
