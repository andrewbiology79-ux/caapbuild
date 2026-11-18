# Version 0.2.30c part C-2 - Boards and years: the screens (plan v1.43, section 52)

v0.2.30c-1 and its fix1 are CONFIRMED by owner report (CI run 45 clean: 122 unit tests, identityHash unchanged, debug key; emulator 94 of 94; check list clean). P-55 is closed.
This package is the SECOND piece of "boards + years" (UI-08): **the screens**. Search by board / year is C-3.

## What is new
1. **Board + year picker** on the new-question screen and on the edit screen, for the stimulus and for each question (ক..ঘ). Each block shows its chips and a button "+ বোর্ড ও সাল যোগ করুন". The picker: choose one board (list of the built-in and custom boards), then a year from the **year window** (the 12 most recent years, newest first) or "অন্য সাল" and type a year with Bengali or Latin digits (১৯০০ - ২২০০). "যোগ করুন" is enabled only when board and year are both valid and the pair is not already there.
2. **Chips with remove** in the editor: "ঢাকা · ২০১৯ ✕"; tap a chip to remove it. At most 30 tags per block.
3. **"+ নতুন বোর্ড"** inside the picker: code (A-Z, 0-9, _) and name; refusals are explained (bad code, bad name, code exists, name exists); the new board is selected at once.
4. **Cards show the tags** (read only): the light chip row under the ribbon shows the stimulus tags (or the tags of a single question); the tags of each sub-question of a group with a stimulus show under that question's heading. "ট্যাগ নেই" shows only when nothing on the card is tagged.
5. **Drafts carry the tags** (new-question draft and edit draft). The draft format gets the tag fields once; a draft written before this version still loads (no tags). Bad entries inside a draft (empty code, year out of range, a repeated tag) are skipped when it is loaded.
6. A tags-only edit is a real change (the save button turns on; "back" asks before discarding), exactly like a rating-only edit.

## Decisions taken by the assistant (owner may overrule)
- **B-5** Chips are removed in the EDITOR, not on the card. Removing a chip directly on a card in the list would be a second write path; it is a small separate step if you want it (it was named in plan 50.2).
- **B-6** Tapping a chip in the editor removes it at once (no question). A removed tag can be added again in two taps, and the draft keeps the typed state.
- **B-7** The year window is the 12 most recent years counted from the phone's current year.
- **B-8** The picker lists only boards that are not archived. After "যোগ করুন" the picker closes (add the next tag with the button again).
- **B-9** A block without text stores no tags (same rule as ratings): the tag controls of a question appear only when that question has text, and those of the stimulus only when the stimulus has text.

## Not in this package (on purpose)
Search by board / year (C-3); removing a chip on the card; archiving / renaming a custom board; reference text, editable marks, type chooser (part D); Minimum / Full modes, undo / redo, duplicate warning (part E).

## Version
`versionCode` 33, `versionName` 0.2.30c2-boards-screens. **No schema change:** database version 1, identityHash must remain 786b471dfa14c9ae4739bb81479bab25. No new dependency. Same debug key.

## Tests (expected, NOT run)
- Unit (JVM): 10 new in `BoardPickerLogicTest` (year window, add / remove / limit of tags, chip text, card chip-row rules, typed-year error, tags are not draft content). Expected total **132 of 132** (122 + 10).
- Emulator: 2 new in `QuestionBoardTest` (drafts carry tags and an older draft without tags still loads; bad tags in a draft are skipped and a repeated tag is kept once). Expected total **96** (94 + 2). The screens themselves have no emulator test; they are checked by the phone list below.
- The Kotlin code has NOT been compiled or run in this environment (no Gradle). Risk points for the first CI run: `BoardTagsEditor.kt` (new Compose code: InputChip, nested AlertDialogs, `supportingText` lambda), the new `boards` parameter of `QuestionCard`, the `StateFlow` of the board catalog in three ViewModels, and the draft codec. If CI fails, send the report.

## Phone check list (owner) - 8 steps
1. Install over v0.2.30c-fix1 without uninstall. Old questions, ratings and cards look as before; a card with no tags shows "ট্যাগ নেই".
2. "নতুন প্রশ্ন": type a stimulus and a ক question. Under the stimulus tap "+ বোর্ড ও সাল যোগ করুন", choose ঢাকা and a year from the window, "যোগ করুন": a chip appears. Add রাজশাহী with "অন্য সাল" and the year typed in Bengali digits (for example ২০১৫).
3. Add ঢাকা and the same year again: the picker says it is already there and the button is off. Type "২০" or "১৮৯৯" as the year: an error shows and the button is off. Tap a chip: it is removed.
4. In the picker tap "+ নতুন বোর্ড": try an empty name, a code with a space, then a good code and name (for example TEST1 / পরীক্ষামূলক); the new board is selected. Try the same code again later: refused.
5. Give ক) a tag too, save the question. The card shows the stimulus tags in the light row and the ক tags under the ক heading, with Bengali digits.
6. Open the new-question screen again, add tags, leave the screen (back), come back: the tags are still there. Kill the app from recent apps, open it again: still there.
7. Edit the saved card: the chips are loaded. Remove one, add one, press "পরিবর্তন সংরক্ষণ করুন": the card shows the new tags. Edit again, change only a tag, press back: it asks before discarding. Kill the app in the middle of an edit and reopen the edit: the change is back.
8. Search a word and "#": still works.

If any step fails or looks wrong, tell the assistant and the record will be corrected.

STATUS: written, NOT compiled, NOT run - UNCONFIRMED.
