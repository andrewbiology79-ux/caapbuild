# Phase 9 implementation status — v1.63

**Overall Phase 9 status: PARTIAL / WRITTEN / UNVERIFIED**  
**Baseline:** `QuestionBank_PHASE9_v1_62_PARTIAL_UNVERIFIED.zip` + `PROJECT_PLAN_v1_62_UPDATED.txt`

## Verification boundary

The owner instruction not to run tests/builds remains in force. No Gradle build, Kotlin/KSP/Room compilation, unit test, instrumentation test, APK build/signing, emulator run, or device run was performed. The source changes below were reviewed statically only. Do not infer that the package compiles or passes runtime checks.

No Room schema, database version, migration, `versionCode`, or `versionName` changed. App metadata remains `versionCode = 36`, `versionName = "0.2.31-phase5-wip2"`. No APK is included.

## v1.63 work completed

1. **Category catalog wiring:** `QuestionEditViewModel` now observes the Type_CQ category catalog. `AppNavHost` supplies the existing `TypeCqData.observeCategories()` flow.
2. **Per-question category selection:** the Type_CQ Edit screen exposes category checkboxes for each nonblank question block. Active categories can be assigned; an archived category already linked to a question remains visible and can be removed, but cannot be newly assigned. Full category ID sets are passed to the existing transactional save input.
3. **Category management navigation:** the Edit screen links directly to the existing Type_CQ Category reference catalog for add, rename, archive and reassign operations. The category list is observed as a Flow when the editor returns.
4. **Explicit question deletion:** saved question blocks in a stimulus group have a confirmation-gated delete action. The UI keeps at least one question in the group; when a new nonblank block is present it can serve as the replacement. Standalone single-question edits do not expose group deletion.
5. **Pending deletion recovery:** selected deletions are displayed before save and can be cancelled one by one. The delete IDs are sent into `GroupEditInput`, then through the v1.62 immutable save command into the existing Room transaction.
6. **Undo/redo coverage:** `EditSnapshot` now includes per-label category IDs and deleted-question IDs. Category changes, deletion and cancellation are recorded in the same bounded editor history as text/metadata changes.
7. **Immutable draft queue:** the application-scope draft writer now receives a captured snapshot of text, category IDs, deleted IDs and editor mode. This prevents the asynchronous worker from reading mutable UI category/deletion state after dequeue.
8. **Canonical draft restore:** pending deletion IDs and category selections are restored from the canonical editor draft for every label, including blocks temporarily marked for deletion. Save failure rewrites the same captured snapshot into the canonical draft.

## Persistence from v1.62 retained

- Factory-created immutable `EditorSaveCommand` snapshots for Type_CQ create/edit and Chapter_CQ bundle saves.
- Type_CQ explicit question deletion validation, exact `(topic_id, stimulus_id)` ownership validation, transactional question deletion, category-link create/replace and read-back checks.
- Chapter_CQ command snapshot and existing transactional save/read-back.
- Existing in-flight save guards and success-after-transaction semantics.
- Existing question IDs for retained edited records remain stable.

## Changed source files in v1.63

- `app/src/main/java/com/questionbank/app/ui/question/QuestionEditScreen.kt`
- `app/src/main/java/com/questionbank/app/ui/question/QuestionEditViewModel.kt`
- `app/src/main/java/com/questionbank/app/ui/navigation/AppNavHost.kt`

## Remaining work / limitations

- **Build/runtime and transaction evidence:** not performed. Duplicate-save, forced-failure rollback and save/reload evidence remain pending because tests/builds were not authorised.
- **Chapter_CQ:** current editor remains a single-question-block bundle; multi-question block group editing/deletion is not implemented in this Phase 9 slice.
- **Media atomicity:** filesystem image writes, operation-journal coordination, integrity verification, interrupted-operation recovery and orphan cleanup remain Phase 10 work. Room transaction atomicity does not make filesystem operations atomic.
- **Release:** no APK was built or packaged.

**Delivery classification:** source ZIP + updated Project Plan only. This is a partial implementation candidate, not a compiled or tested release.
