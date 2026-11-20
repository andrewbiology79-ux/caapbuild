# Version notes — QuestionBank v1.77 CAA Editor correction

Base: v1.76 CAA Editor parity source candidate

## Fixed
- Corrected the Full Edit Add-label selection so a persisted label marked for deletion is not incorrectly treated as a new empty slot before the transaction commits.
- Added a matching ViewModel guard for addable labels.
- Corrected persisted-block deletion eligibility to count visible pending blocks even before their required question text is entered.
- Added four pure unit regression test cases for these rules.

## Preserved
- Existing Room schema and single-row-per-CAA-label data model.
- Existing transaction-based persistence/deletion, edit draft, undo/redo, board/year, rating, image and solution flows.
- All CAA gaps and compatibility limitations disclosed in `CAA_EDITOR_IMPLEMENTATION_STATUS_v1_77.md`.

## Verification
- Targeted helper behavior passed an isolated Kotlin compiler/run harness.
- Android Gradle build and complete test suite are not verified; Gradle distribution download is blocked by DNS in this environment.
- Source archive integrity is checked separately; do not treat it as APK/build verification.
