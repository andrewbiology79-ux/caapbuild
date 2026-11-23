# Type CQ Window — Change Log

## v0.2.48-typecq-atomic-style (code 53) — 23 Nov 2026

- Fixed Concept loading state: the first DAO Flow emission is required before treating the card as empty; load failures are surfaced and add/edit/save controls remain disabled until the data is safely loaded.
- Kept bulk selection, menu count, Copy and Cut aligned across filters: operations resolve selected keys against the complete topic collection, including selected cards hidden by the current filter/search.
- Fixed Concept serials to use the original complete topic order. Search results wait for the full topic order to load before opening a Concept, preventing a temporary fallback serial.
- Wrapped card Copy (question/stimulus + concept + target ordering) and cross-topic Cut-Paste (card + concept owner + target ordering) in one outer Room `withTransaction`; failed sub-operations throw and roll back the whole card operation. Durability setup (`beforeWrite`) remains outside the transaction.
- Prevented card Copy from clearing an unfinished create-question draft in the destination topic; self-target Paste Before/After is now a no-op rather than unexpectedly moving the card to the end.
- Added process-wide paste locking and retry tracking. Successful Cut entries are consumed; fully successful Copy entries remain repeatable; partially completed Copy batches skip already-committed entries on retry and restore repeatable behavior when the pending entries finish.
- Re-aligned Type CQ card styling with the old React card source and the change specification: 1.5dp blue outline, 16dp corners, ribbon, paper/board chips, image border/radius, and solution panel; both Light and Dark tokens are kept Type-CQ-specific. Missing-solution controls remain disabled grey as requested.
- Corrected Type CQ bottom-bar inset modifier order so the visible compact bar keeps its 54dp height above Android navigation insets. Other tabs are unchanged.
- Added unit/instrumentation test source for stable Concept serials, clipboard repeat/retry/Cut behavior, Copy+Concept+order, successful move, and rollback after a forced final-order failure.
- No Room schema, migration, canonical SQL, backup/restore, or media schema files were changed in this pass.

**Verification:** Standalone Kotlin compilation, six clipboard state test methods (6/6), executable smoke checks, and Kotlin PSI syntax parsing (217 source files, zero syntax errors) passed. ZIP archive integrity is checked after packaging. Gradle compilation, Gradle unit tests, Android instrumentation tests, APK assembly, and physical-device UI/inset tests remain unverified because the Gradle 8.14.3 wrapper distribution could not be fetched (`UnknownHostException: services.gradle.org`). This is a source update, not a build-verified release.

## v0.2.47-typecq-fixes (code 52) — prior corrective pass
- Concept first-emission loading guard; full-topic selection for bulk Copy/Cut; Concept serial correction; Type-CQ-only inset adjustment.
- Card-level cross-DAO Copy/Move transaction and legacy card styling still remained open at that point; addressed in v0.2.48 above.

## v0.2.46-typecq-window (code 51) — original Type CQ window pass
- Type CQ breadcrumb, card-count row, `+QA`, oldest-first list ordering and Type-CQ-only compact top/bottom navigation.
- Reworked Type CQ card ribbon, stimulus/question categories, paper-category chips, board/year chips, full-width stimulus images, reference dialog and per-subquestion solution row.
- Added concept preview, block editor, image edit/import, all-concepts screen and concept-aware copy/move/delete behavior.
- Added Type-CQ menu clipboard operations (select/deselect/copy/cut/paste/delete), card-level Cut and Paste Before/After, independent search/filter and disabled folder-add item.
- Added Room migration 1→2 and tables for stimulus-category links, concepts and concept parts; updated canonical SQL, Room schema, runtime guards and image reference accounting.
- User decisions: missing-solution button disabled grey; compact header/navigation Type CQ only; card menu includes Cut/Paste Before/Paste After; no app-to-folder sync; folder-add remains disabled.
