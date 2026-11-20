# CAA Editor implementation status — v1.76 source candidate

Date: 21 November 2026  
Baseline: `QuestionBank_v1_75_CAAP_UI_COMPILEFIX.zip` and `PROJECT_PLAN_v1_75_CAAP_UI_COMPILEFIX.txt`  
Reference: `CAA_EDITOR_FEATURES_Minimum_Full.txt` (authoritative editor behavior/UI reference)

## Scope of this pass

This pass applies a first functional-parity increment to the native Jetpack Compose Type_CQ editor. It is a source candidate, not a verified Android build and not a claim that all 27 sections of the CAA reference have been completed.

## Implemented in this pass

- Every new/open Type_CQ create/edit form starts in **Minimum** mode by default. Restored draft content is kept; only the presentation mode resets.
- Chapter_CQ workspace also resets the editor presentation mode to its configured default (Minimum) after restoring a draft. Its separate single-question workflow is otherwise unchanged.
- New Type_CQ group editor starts with only two visible blocks: **গ (৩ নম্বর, রেটিং ৩)** and **ঘ (৪ নম্বর, রেটিং ৪)**.
- Newly exposed blocks initialize with the CAA default rating (৩) and one blank solution text part.
- Full mode now shows a question-list heading/count, an add-question action, and a destructive confirmation before removing a block. The UI prevents removing the last visible block.
- Full-mode label/marks controls in the new-question form allow moving a block to an unused ক/খ/গ/ঘ slot. Text, short answer, marks, rating, board/year tags, solution text and ordered solution-part data move together; the default mark is updated only when it was still the old label's default.
- Full-mode edit screen can add a missing label and remove a newly-added or persisted block with confirmation; persisted deletion remains deferred to the existing transactional save path.
- CAA textarea row counts are applied: stimulus Minimum/Full = 2/4; question and solution Minimum/Full = 2/3.
- Editor mode buttons, card padding, small eye/header controls and dark preview surface were adjusted toward the reference dimensions/palette.
- Existing board/year selection, rating, ordered solution image/text attachments, drafts, history, validation, duplicate warning and transactional save/update paths are retained.

## Important compatibility boundary

The current Type_CQ draft/editor adapter is still a fixed four-slot model indexed by `CqLabel` (ক, খ, গ, ঘ). One block per label is therefore supported. The new UI exposes only unused labels and explicitly tells the user about this limitation. Repeated blocks with the same label, arbitrary ordering independent of label, and fully general CAA block collections require a schema/domain/editor-model migration and corresponding data-preservation tests; they are **not** implemented here.

The existing edit-screen `TypeAndMarksControls` still edits the stored question-type metadata and marks; changing the persisted block label during edit is not yet supported. The new-question form's label reassignment is implemented only to unused slots.

## Not yet implemented / partial against CAA reference

- Full hierarchy card inside the editor (subject/chapter/topic selection, collapsed by default), auto-switch to Full and scroll-to-first-error hierarchy workflow. Current Type_CQ route is topic-scoped and receives the topic before the editor opens.
- Full CAA KaTeX renderer (`$...$`, `$$...$$`) with per-formula error fallback. Preview remains plain text.
- Cursor/selection-aware Math toolbar insertion, Greek symbol popover, and textarea resize grip. Existing toolbar behavior still appends symbols at the end.
- CAA image-edit queue immediately after selection (four-edge crop, rotation, grayscale/black-white scan and settings toggle), full image-grid control placement, in-editor large zoom viewer and all CAA image actions. Existing pipeline supports import, replace, reorder, remove, storage integrity and PNG export through the image library; it also has separate rotate/center-crop operations.
- Exact CAA solution serialization/backup markers `[[img:<id>]]` and `[[box]]` and legacy parser compatibility. Native app stores ordered TEXT/IMAGE solution parts in its own normalized model.
- Exact header dirty badge, CAA dialog visuals/strings, all accessibility labels/tooltips and complete CAA toast text set.
- True shared Minimum/Full grouped editor for Chapter_CQ. Current Chapter_CQ remains its own single-question editor workflow; only its mode-reset behavior was aligned in this pass.
- Complete CAA duplicate search across both scopes and its matching preview dialog content.

## Files changed

- `app/src/main/java/com/questionbank/app/ui/question/QuestionEditorViewModel.kt`
- `app/src/main/java/com/questionbank/app/ui/question/QuestionEditViewModel.kt`
- `app/src/main/java/com/questionbank/app/ui/question/QuestionEditorScreen.kt`
- `app/src/main/java/com/questionbank/app/ui/question/QuestionEditScreen.kt`
- `app/src/main/java/com/questionbank/app/ui/question/ChapterCqWorkspaceScreen.kt`
- `app/src/main/java/com/questionbank/app/ui/question/EditorDesign.kt`
- `CAA_EDITOR_FEATURES_Minimum_Full.txt` (copied into the project as its reference specification)
- `CAA_EDITOR_IMPLEMENTATION_STATUS_v1_76.md`
- `VERSION_NOTES_CAA_EDITOR_PARITY_v1_76.md`
- `BUILD_STATUS_CAA_EDITOR_v1_76.txt`
- `PROJECT_PLAN_v1_76_CAA_EDITOR_PARITY.txt`

No Room entity, SQL schema, migration, database version, dependency, Gradle plugin, app versionCode or app versionName was changed in this pass.

## Verification

- Static source review performed on the changed ViewModel/UI paths and existing save/update rules.
- A Kotlin syntax-only scan without Android/Compose dependencies did not report parser-style errors; this is not a compilation result.
- Attempted `./gradlew :app:compileDebugKotlin :app:testDebugUnitTest --offline --no-daemon`; Gradle stopped before project tasks because Gradle 8.14.3 was not cached and `services.gradle.org` could not be resolved (`UnknownHostException`).
- Consequently: Kotlin/Compose compile, KSP/Room generation, unit tests, instrumentation tests, APK assembly and emulator/phone behavior are **NOT VERIFIED** for v1.76.
- ZIP integrity will be checked separately; archive integrity does not establish app build correctness.

## Required next gates

1. Run CI on this exact source candidate with network-enabled Gradle distribution resolution; inspect `compileDebugKotlin`, `testDebugUnitTest`, KSP/Room generation and release assembly.
2. Run instrumentation/emulator tests on the same commit and verify create/edit/add/remove/relabel/undo/redo/draft restore/save/reopen for Type_CQ.
3. Add an explicit migration design before enabling repeated same-label question blocks or editable labels for saved blocks.
4. Implement KaTeX, cursor-aware formula input, complete image edit/viewer flow and CAA solution marker import/export compatibility.
5. Implement the true shared Chapter_CQ grouped editor and in-editor hierarchy/error-navigation flow.
6. Complete CAA's 27-section acceptance checklist before marking Minimum/Full Editor parity complete.
