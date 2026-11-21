# v1.72 - compilefix3 (CI run 68 driven)
- ChapterCqQuestionGroupCard.kt:174 - rating converted to Int before coerceIn (Long/Int mismatch).
- EditorModePicker duplicate (EditorDesign.kt vs QuestionEditorScreen.kt): EditorDesign.kt is NOT part of this package. If it exists in the GitHub repo, delete app/src/main/java/com/questionbank/app/ui/question/EditorDesign.kt before pushing.
UNVERIFIED until the next CI run is green. No schema change.
