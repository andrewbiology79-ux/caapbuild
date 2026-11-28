# Acceptance Test Plan — v1.70 (NOT EXECUTED)

This document is a proposed acceptance inventory only. No test was run in this package because the owner explicitly prohibited tests.

## Core acceptance groups
1. Database: schema parity, constraints, triggers, FTS, FK and data migration.
2. Hierarchy: Type_CQ Subject→Chapter→Topic; Chapter_CQ Subject→Chapter only; cascaded filter resets.
3. Editor: 146 numbered behaviors once the original matrix is supplied; Minimum/Full mode round trips, draft persistence, undo/redo, validation and scope separation.
4. Persistence: transaction all-or-nothing, forced DAO failure, process termination and recovery.
5. Media: import/transform/delete/reference protection, corrupt/missing file detection, startup journal replay, concurrent backup/mutation and paper asset retention.
6. Paper: both source scopes, stable keyset paging, source edit/delete independence, snapshot reload, overrides, order/marks, orphan image lifecycle, validation and PDF visual checks.
7. Backup/restore: legacy DB-only and media-inclusive archive, wrong hash/path, truncated ZIP, restore rollback, process death during swap, low storage, automatic worker constraints and off-device restore.
8. Search: Bengali/English normalization, board/year/category/rating/type filters, result order/highlight and large dataset profiling.
9. Accessibility: TalkBack, keyboard/focus, text scaling, high contrast, touch targets and responsive layouts.
10. Integration: navigation, lifecycle, background worker interactions, cross-scope isolation and no data loss.

## Execution policy
Do not execute without explicit owner authorization. Required evidence must be appended as a dated report and statuses must not be upgraded based on source presence alone.
