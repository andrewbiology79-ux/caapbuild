# CI run 74 compile fix
compileDebugKotlin failed with 8 errors (3 files):
- ChapterCqQuestionDetailDialog.kt: missing import androidx.compose.foundation.layout.fillMaxWidth (3 errors)
- QuestionEditScreen.kt: missing import androidx.compose.ui.unit.sp (2 errors)
- ChapterCqWorkspaceScreen.kt:852: EdLabelChip trailing lambda bound to last param `compact: Boolean`; now passed as named `onPick = { ... }` (3 errors)
Not compiled/tested locally (no Android SDK/network); next CI run is the verification.
