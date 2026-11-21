# v1.72 - compilefix3 (CI run 68 driven)
- ChapterCqQuestionGroupCard.kt:174 - rating converted to Int before coerceIn (Long/Int mismatch).
- EditorModePicker duplicate (EditorDesign.kt vs QuestionEditorScreen.kt): EditorDesign.kt is NOT part of this package. If it exists in the GitHub repo, delete app/src/main/java/com/questionbank/app/ui/question/EditorDesign.kt before pushing.
UNVERIFIED until the next CI run is green. No schema change.

## v1.72b - crash diagnostics (startup crash after installing over the old app)
- New CrashLog.kt: saves the last uncaught crash to crash_log.txt (app files dir + external app files dir).
- QuestionBankApp.onCreate installs it first; MainActivity shows the saved crash as plain text (copy button) on the next launch, before anything touches the database.
- No schema change, no behaviour change otherwise. If the crash happens inside Application.onCreate the file is still written, read it at Android/data/com.questionbank.app/files/crash_log.txt.
