# Phase 9 implementation status — v1.62

**Phase status: PARTIAL / WRITTEN / UNVERIFIED**  
**Baseline:** `QuestionBank_PHASE6_8_v1_61_UNVERIFIED.zip` + `PROJECT_PLAN_v1_61_UPDATED.txt`

## Scope and verification boundary

This package is a source-only continuation of the Phase 6–8 candidate. The owner direction carried forward is not to run tests. Accordingly, no Gradle build, Kotlin/KSP/Room compilation, unit test, instrumentation test, APK build/signing, emulator run, or device run was performed. The changes below were inspected statically only. Do not infer that the package compiles or passes runtime checks.

No Room schema, database version, migration, `versionCode`, or `versionName` was changed. The app version metadata remains `versionCode = 36`, `versionName = "0.2.31-phase5-wip2"`. No APK is included.

## Phase 9 source changes written

1. **Immutable save-boundary command:** added `domain/editor/EditorSaveCommand.kt`. Its factory methods copy nested Type_CQ text/solution/tag/category collections and Chapter_CQ relation lists into unmodifiable snapshots. It carries Type_CQ create, Type_CQ edit, and Chapter_CQ bundle save shapes. It does not replace the Room transaction boundary.
2. **Scope and hierarchy validation:** Type_CQ command factories require a nonblank topic and a parseable edit group key; DAO validation confirms the topic, stimulus, and every affected question belongs to the exact target group. Chapter_CQ command validation requires question/chapter IDs and checks the optional stimulus row uses the same chapter; the DAO still confirms chapter/stimulus ownership.
3. **Type_CQ explicit question deletion:** `GroupEditInput` now has an explicit deleted-question ID set. `QuestionEditRules` rejects unknown IDs, deletion in single-question scope, and deletion that would leave a stimulus group empty. `TypeCqQuestionDao.updateGroup` revalidates the IDs against the exact stimulus group, deletes them inside its existing `@Transaction`, and reads back that the rows are gone. Existing question IDs for retained blocks remain update-in-place.
4. **Type_CQ category relationships:** new-group inputs can carry category IDs per question label. Create inserts category links in the same transaction. Edit can replace the complete category set for supplied labels, including clearing with an empty list. New assignments must be active; an archived category may remain only when already linked to that question. Category links are read back before draft cleanup/commit.
5. **Relationship read-back:** edit preflight now checks affected question IDs against the exact `(topic_id, stimulus_id)` group rather than only the broader topic. Text, metadata, ordered text solutions, ratings, board/year links, category links, explicit deletions, and stimulus fields are checked before the transaction returns success. Any failed check throws within the transaction and therefore rolls back the relational writes and draft removal together.
6. **Chapter_CQ command snapshot:** `ChapterCqRepositoryImpl.saveQuestionWithStimulus` now freezes the question bundle before passing it to the existing atomic `saveQuestionWithStimulusBundle` DAO transaction. Existing image-part preservation and ordered solution read-back remain as implemented in the baseline.

## Existing safeguards retained from the baseline

- Type_CQ New/Edit ViewModels already set their `saving` state synchronously before launching the save and reject another save while it is active.
- Chapter_CQ editor already rejects another save while `savingQuestion` is true.
- Type_CQ `insertGroup` and `updateGroup`, and Chapter_CQ `saveQuestionWithStimulusBundle`, remain the Room transaction/commit boundary.
- Save success is returned only after the DAO's transactional read-back and transaction completion.
- Type_CQ text-only solution updates continue to preserve pre-existing non-TEXT solution parts.
- The existing question IDs of retained edited records are not regenerated.

## Remaining work / not completed

- The Type_CQ Edit screen does not yet expose delete-question controls or category-selection/management controls. The persistence input and DAO path now support explicit IDs/category replacement, but end-user UI wiring is pending (coordinate with Phase 11 and the outstanding Phase 7 category UI work).
- Chapter_CQ still has its current single-question bundle editor. Multi-question-block group deletion/management is not implemented in this Phase 9 slice.
- Media file writes, image ownership replacement, operation-journal coordination, interrupted media recovery, and orphan cleanup remain Phase 10 work; relational question saves are not claimed to atomically commit filesystem operations.
- Duplicate-save and forced-failure transaction evidence is still pending. The existing in-flight UI guards were inspected but not exercised.
- Build/Kotlin/Room compilation and all runtime verification are pending because the owner asked not to run tests/builds.

## Changed source files

- `app/src/main/java/com/questionbank/app/domain/editor/EditorSaveCommand.kt` (new)
- `app/src/main/java/com/questionbank/app/domain/question/QuestionModels.kt`
- `app/src/main/java/com/questionbank/app/domain/question/QuestionRules.kt`
- `app/src/main/java/com/questionbank/app/domain/question/QuestionEditRules.kt`
- `app/src/main/java/com/questionbank/app/data/local/dao/TypeCqQuestionDao.kt`
- `app/src/main/java/com/questionbank/app/data/repository/TypeCqQuestionRepositoryImpl.kt`
- `app/src/main/java/com/questionbank/app/data/repository/ChapterCqRepositoryImpl.kt`

**Delivery:** source ZIP + updated Project Plan only; no APK. This is a partial implementation candidate, not a compiled/tested release.
