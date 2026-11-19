# Phase 5 UI implementation package (WIP1)

## Added
- Reference Data hub reachable from the Type_CQ subject list.
- Question Type label management (stable four CQ type IDs; labels flow into create/edit editor).
- Board catalog management (custom board create, rename, archive/reactivate).
- Separate Type_CQ and Chapter_CQ category management.
- Safe category retirement: linked categories must be reassigned transactionally before archive; unlinked categories can be archived directly.
- Loading, empty and error states in reference catalogs.
- Existing BoardTagsEditor retains per-board year tagging.

## Safety / compatibility
- No Room Entity/table/column/migration/database version changes.
- Type_CQ and Chapter_CQ category link tables remain separate.
- Existing Type_CQ hierarchy and question screens were retained.
- Writes prepare FULL synchronous mode before catalog mutations.

## Checks
- 66 @Query statements passed SQLite EXPLAIN parsing against the canonical schema.
- SQLite integrity_check: ok. foreign_key_check: no violations.
- Gradle 8.14.3 could not be fetched (UnknownHostException: services.gradle.org), so Kotlin/Room KSP compilation and tests are unverified.

## Must verify in CI/device
- Gradle/KSP compile, unit tests and instrumentation/UI tests.
- Question Type label refresh on create and edit screens.
- Board archive/reactivation and year-tag selection.
- Category reassignment with duplicate target links, and archive refusal when linked.
- Existing hierarchy navigation, CRUD, reorder, breadcrumbs and invalid-reference guards.

Status: implementation working package; Phase 5 is not marked DONE until CI and owner-device checks pass.

## WIP2 additions
- Duplicate-name rename and failed reassign return false instead of throwing (SafeWrite.kt).
- Reference screens create their Flow once (remember).
- ReferenceCatalogTest (7 emulator tests) added; still unrun.
