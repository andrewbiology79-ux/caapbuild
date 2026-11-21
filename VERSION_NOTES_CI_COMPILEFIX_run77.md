# CI compile fix (run #77)
- ChapterCqQuestionDetailDialog.kt: added import foundation.layout.fillMaxWidth
- ChapterCqQuestionGroupCard.kt: added import ui.unit.sp
- QuestionEditScreen.kt: added import ui.unit.sp
- ChapterCqWorkspaceScreen.kt:852: EdLabelChip trailing lambda changed to named onPick = { ... } (it was binding to `compact: Boolean`)
