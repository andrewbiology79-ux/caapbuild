# Type CQ corrective pass v0.2.47 — recheck report

## Applied source corrections
1. `ConceptScreen.kt`: removed `collectAsState(initial = null)` as a load-completion signal. The screen now collects the DAO Flow in a keyed `LaunchedEffect`; first emission distinguishes a truly empty concept from an existing concept. Loading/error states are visible, and save/edit/add actions are gated until loaded.
2. `QuestionListScreen.kt`: selected bulk Copy/Cut now uses selected groups from the full topic collection, so hidden selected cards are included consistently with the selection count.
3. `QuestionListScreen.kt`: Concept open callback computes serial from the unfiltered topic collection by stable group key, not filtered/sorted visible `index + 1`.
4. `AppNavHost.kt`: Type CQ compact bottom navigation applies Android navigation-bar padding scoped to the Type CQ compact bar. Other tabs use their previous inset behavior.
5. Version metadata updated to code 52 / `0.2.47-typecq-fixes`.

## Not fully corrected / risks
- Copy, concept copy, ordering and cross-topic move remain separate DAO operations in `TypeCqQuestionRepositoryImpl`; repository-level transaction protection was not implemented because the repository is not currently passed a database transaction runner. Partial-operation failure remains possible and must be addressed before considering this part complete.
- Card border/shape fidelity was not changed in this pass: the old-source visual comparison was not re-run to ground a new style adjustment, so avoid introducing an unverified color/shape change.
- System-inset layout is a source-level adjustment only; actual navigation gesture/3-button device layouts still need device validation.

## Static checks
- Reviewed affected source paths and imports/usage statically.
- ZIP archive integrity check performed after packaging.
- Room migration/schema, backup/media, categories, filters, and ordering files were not intentionally modified in this corrective pass; regression validation beyond source-diff review is not claimed.

## Execution limits
- Gradle wrapper compilation/tests and device runtime testing were not completed in this pass. No Kotlin compile success or Android runtime success is claimed.
