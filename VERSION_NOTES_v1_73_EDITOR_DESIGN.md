# v1.73 — Editor design (প্রশ্ন সম্পাদনা)

Changed (UI only, no database or save-logic change):
- `ui/question/EditorDesign.kt` (new): top bar (close, title, "অসংরক্ষিত" badge, undo/redo, round save button), segmented Minimum | Full Editor switch, rounded cards, pills (বোর্ড, রেটিং, ধরন), dashed add buttons, text area with math toolbar that inserts at the cursor, image thumbnails with remove/replace.
- `ui/question/QuestionEditorScreen.kt`: "প্রশ্ন যোগ করুন" editor rebuilt in the new design. Save is the round check button in the top bar. Question cards are added with "+ আরও প্রশ্ন যোগ করো"; the label chip moves a question to another free label (ক..ঘ); the trash button (Full) empties a card.
- `QuestionEditorViewModel.kt`: `swapBlocks(a, b)` and `clearBlock(index)`.
- `EditorModePicker` now draws the segmented switch, so the edit screens get the new tabs too.
- `BoardTagsEditor.kt` / `EditorImageAttachments.kt`: `BoardYearDialog`, `moveStimulusImage`, `moveSolutionPart` made `internal`.
- `AppNavHost.kt`: passes the topic name to the editor.

NOT compiled or run here (no Kotlin/Gradle/Android SDK in the sandbox). Run `./gradlew assembleDebug` and the unit tests first.
