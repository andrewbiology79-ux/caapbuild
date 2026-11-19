# v0.2.31 source candidate — coordinated Phase 6–8 implementation

**Artifact:** `QuestionBank_v0_2_31_PHASE6_8_IMPLEMENTATION_CANDIDATE_UNVERIFIED.zip`  
**Inherited source:** `QuestionBank_v0_2_31_PHASE5_WIP2.zip`  
**Plan:** `PROJECT_PLAN_v1_53_UPDATED.txt`

## Owner instruction and verification status
The owner asked for Phase 6, 7 and 8 to be implemented together and explicitly said that no tests need to be run. This candidate was edited accordingly. No Gradle build, Kotlin/KSP compile, unit test, instrumented/emulator test or phone test was run. Source written is not the same as compiled or verified.

The inherited Phase 4/5 WIP2 M0 gate remains unpassed. The owner directed continuation despite that gate; this does not mark Phase 4/5 complete and leaves P-57 open.

## Main implementation changes
- Added a bounded `EditorHistory<T>` with undo/redo, branch truncation and short same-field edit coalescing.
- Added Minimum / Full Editor mode selection to Type_CQ New/Edit and Chapter_CQ editors.
- Extended Type_CQ draft fields and JSON decoding with stimulus reference, question type IDs, marks and ordered text-solution parts. Older draft JSON defaults continue to decode.
- Type_CQ rules/repository/DAO now save and read back reference text, editable question type and positive decimal marks, and ordered text solution parts. Existing non-text solution rows are preserved by text-only solution replacement.
- Added exact-text duplicate-warning flow to Type_CQ new editor, using the topic repository. Save stays disabled while the duplicate check is running; owner can confirm save anyway.
- Replaced the Chapter_CQ placeholder with a Chapter_CQ-specific workspace and repository flow for subject/chapter selection, create/rename, question create/edit, stimulus/reference, ratings, positive decimal marks, question label, board/year, categories and ordered text solution parts.
- Chapter_CQ question writes use a Room transaction that includes the optional stimulus and the question child rows, followed by read-back comparisons. The UI preserves existing IMAGE solution rows while editing text rows.
- Chapter_CQ uses the generic opaque `EditorDraftRepository` for its editor drafts. Type_CQ still uses its legacy `DraftText` and edit-draft pathway; this is explicitly not a unified canonical draft engine.
- Archived board/category references already linked to a Chapter_CQ question are retained on edit. New assignments still require active references. Existing extra board/year links are retained, though only one primary link is editable in the UI.
- Added a lightweight math symbol insertion row and plain-text preview. Symbols append at the end of the field; no equation renderer is included.

## Still incomplete
- Type_CQ editor category assignment controls are not included.
- The reusable `EditorHistory<T>` helper is shared, but there is no single canonical immutable/observable `EditorState` + reducer pipeline across both editor scopes. Type_CQ mode is not in its DraftText history payload. Raw marks text is held locally by the marks control until it parses; transient invalid text is not persisted in drafts/history.
- Chapter_CQ hierarchy delete/reorder/breadcrumb and category create/rename/archive management are not included.
- No image/media selection, import, upload, replacement, crop, position, or image editor; existing image solution rows are only preserved.
- No LaTeX/MathJax rendering, cursor-aware symbol insertion or rich layout preview.
- No Type_CQ edit duplicate warning.
- No question-block deletion or sub-question block reordering.
- Chapter_CQ board/year UI edits one primary tag only; extra existing tags are preserved, not editable. Chapter_CQ category management itself remains outside this screen.
- Type_CQ and Chapter_CQ do not yet share one canonical EditorDraft state/schema; P-55.4 remains open.

## Version / schema
`versionCode=36` and `versionName=0.2.31-phase5-wip2` are unchanged because the project version conflict P-56 remains unresolved. No Room Entity/schema migration was intentionally added, but Room/KSP compilation and `identityHash` are unverified. No APK is included.

## Accurate status
- Phase 6: PARTIAL — implementation written, not compiled or verified.
- Phase 7: PARTIAL — editor paths written, not compiled or verified.
- Phase 8: PARTIAL — text-solution/symbol/preview slice written; image and formula rendering remain incomplete; not compiled or verified.
- Phase 4/5: still WRITTEN/UNVERIFIED; M0 not passed.
- All tests: NOT RUN by explicit owner instruction.


## Static recheck corrections (v1.53)
A source-level recheck found and corrected the following issues: (1) Type_CQ New duplicate checking now calls `TypeCqRepository` via `container.typeCqData`, rather than the question repository; (2) existing archived Type_CQ question types can be retained during unrelated metadata edits, while new/changed assignments remain blocked; (3) Full-only solution controls are hidden in Minimum mode on New/Edit; (4) duplicate-warning copy accurately describes exact text matching; and (5) Chapter_CQ post-commit duplicate read-back was removed so validation/read-back remains inside the DAO transaction. See `STATIC_RECHECK_REPORT_v1_53.txt`. No Build, compile or tests were run. Phase 6/7/8 remain PARTIAL and unverified.


## Deep static recheck v1.54

A second detailed source review found and corrected additional issues: Chapter_CQ duplicate-save taps, delayed draft writer/save synchronization and atomic draft cleanup, Type_CQ duplicate-check cancellation/stale results, Type_CQ post-commit read-back, mixed text/image part position preservation, Chapter_CQ nested transaction usage, stale edit-target handling, shared-stimulus copy-on-write and primary board/year replacement. Cancellation propagation and the root header back action were also corrected.

No Gradle build, Kotlin/KSP compile, unit test, instrumented/emulator test or phone test was run (owner instruction). The app still has no claim of compile or runtime verification. Phases 6, 7 and 8 remain PARTIAL. M0 Phase 4/5 remains NOT PASSED. Full canonical shared EditorState/draft migration, Type_CQ category picker/Edit duplicate warning, Chapter_CQ hierarchy/category admin, full media/image editing, formula rendering/cursor-aware insertion and block delete/reorder remain incomplete. See `PROJECT_PLAN_v1_54_UPDATED.txt` and `STATIC_RECHECK_REPORT_v1_54.txt`.


## v1.58 coordinated canonical-draft integration (source update)

This source package has been extended after the v1.57 candidate review:

- Added `EditorSessionDraft` schema v2, a compatibility-preserving JSON codec, an immutable event/reducer model, and bounded shared session history.
- Added an adapter from the existing Type_CQ `DraftText` model to/from the canonical model.
- Connected Type_CQ New/Edit draft restore and autosave to the canonical repository while retaining legacy recovery data.
- Added canonical draft key cleanup inside the same Type_CQ Room transaction as a successful content save.
- Connected Chapter_CQ's draft JSON writer/reader to the canonical schema while retaining its previous snapshot JSON compatibility.

**This does not complete Phases 6–8.** The common reducer is not yet the single observable state source used by both scopes; Type_CQ categories, complete dirty/back semantics, full image/media operations, multi-block add/remove/reorder UX, full Chapter_CQ multi-tag/category controls, formula rendering/live preview and legacy marker import remain outstanding. Raw marks text is represented in the canonical schema, but the current Type_CQ legacy editor path still maps it through numeric `DraftText`.

**Status:** Phase 6 PARTIAL / WRITTEN / UNVERIFIED; Phase 7 PARTIAL / WRITTEN / UNVERIFIED; Phase 8 PARTIAL / WRITTEN / UNVERIFIED. No Gradle build, Kotlin/KSP compile, unit test, instrumented/emulator test or phone test was run, as explicitly requested. Existing app version metadata (`versionCode=36`, `versionName=0.2.31-phase5-wip2`) is unchanged; P-56 remains open. See `PROJECT_PLAN_v1_58_UPDATED.txt`, section 67.
