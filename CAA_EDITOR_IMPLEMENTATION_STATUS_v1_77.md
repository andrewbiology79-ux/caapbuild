# CAA Editor implementation status — v1.77 source candidate

Date: 21 November 2026  
Base: `QuestionBank_v1_76_CAA_EDITOR_PARITY.zip`  
Reference: `CAA_EDITOR_FEATURES_Minimum_Full.txt`

## Scope

This increment corrects the edit-mode add-after-delete edge case found in the v1.76 static recheck. It does not claim full CAA Editor parity.

## Changes made

- Added `QuestionEditBlockRules`, a pure domain rule for deciding which labels can be introduced as new rows under the current one-row-per-ক/খ/গ/ঘ data model.
- The edit screen's Add action now offers only labels that have never been persisted in the current group and are not already visible as pending blocks. A persisted row marked for deletion remains occupied until the transactional save commits; the UI no longer routes Add to that row and produces a hidden block.
- `prepareQuestionBlock` enforces the same availability rule, so the UI is not the only guard.
- The edit screen now disables Add when there is no genuinely addable label and explains the one-row-per-label/session limitation.
- A visible newly added block counts as the remaining block when checking whether another persisted block may be marked for deletion, even while its required question text is still blank. Save-time validation remains responsible for rejecting a blank question.
- Added `QuestionEditBlockRulesTest` with four regression cases covering deleted persisted labels, occupied/pending labels, delete eligibility with a pending block, and negative counts.

## Files changed / added in v1.77

- `app/src/main/java/com/questionbank/app/domain/question/QuestionEditBlockRules.kt` (new)
- `app/src/main/java/com/questionbank/app/ui/question/QuestionEditViewModel.kt`
- `app/src/main/java/com/questionbank/app/ui/question/QuestionEditScreen.kt`
- `app/src/test/java/com/questionbank/app/QuestionEditBlockRulesTest.kt` (new)
- `CAA_EDITOR_IMPLEMENTATION_STATUS_v1_77.md` (new)
- `VERSION_NOTES_CAA_EDITOR_PARITY_v1_77.md` (new)
- `BUILD_STATUS_CAA_EDITOR_v1_77.txt` (new)
- `PROJECT_PLAN_v1_77_CAA_EDITOR_PARITY.txt` (new)
- `RECHECK_REPORT_v1_77_CAA_EDITOR_BN.md` (new)

## Unchanged limitations

- Type_CQ still has a fixed four-slot adapter and one persisted question row per label. Same-label repeated blocks, arbitrary label-independent ordering and re-adding a just-deleted persisted label in the same edit transaction are not supported.
- Saved label reassignment in Edit mode is not implemented.
- Chapter_CQ still does not have the shared CAA grouped Minimum/Full Editor.
- Full CAA hierarchy selection/error navigation, KaTeX rendering, cursor-aware formula insertion, image edit queue/viewer, solution marker import/export, exact dialogs/toasts/accessibility behavior and the complete 27-section acceptance checklist remain incomplete.

## Database / dependency boundary

No SQL schema, Room Entity, DAO, migration, database version, Gradle dependency/plugin, app versionCode or versionName was changed. The existing transactional group update path remains responsible for persisting deletions.

## Verification status

- Source diff and targeted static review: completed.
- Pure helper regression logic: checked with an isolated Kotlin compiler/run harness; this is not the Android Gradle unit-test task.
- Gradle `:app:compileDebugKotlin` / `:app:testDebugUnitTest`: not verified because the required Gradle 8.14.3 distribution is not locally cached and `services.gradle.org` DNS resolution is unavailable in this environment.
- Kotlin/Compose compilation, KSP/Room generation, full unit-test suite, androidTest compilation, release APK assembly, emulator and physical-device behavior: NOT VERIFIED for v1.77.
- ZIP integrity is checked independently and does not prove that the app builds.

## Next required gates

1. Run CI on this exact v1.77 ZIP/commit with Gradle distribution access.
2. Verify `compileDebugKotlin`, KSP/Room generation, `testDebugUnitTest`, androidTest compilation and `assembleRelease`.
3. On an emulator/device, test: delete one persisted block; add a different never-persisted label; delete a persisted block while a newly added blank block remains; fill it and save; reopen and verify the group. Also test discard/reopen and save rollback.
4. Do not enable repeated same-label blocks until the generalized block model, schema migration, adapter transition and backup compatibility are designed and tested.
5. Continue implementing and testing the remaining CAA 27-section reference; no Phase 6/7/8 or CAA parity completion claim is made here.
