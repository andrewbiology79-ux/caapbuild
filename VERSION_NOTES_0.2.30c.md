# Version 0.2.30c part C-1 - Boards and years: catalog, data and rule layer (plan v1.41, section 50)

v0.2.30a + b + b-fix1 are CONFIRMED by owner report (CI clean, instrumented test clean, phone check list clean; the counts and the step-by-step results were not sent).
The next step of "editor fields" is part C: boards + years + custom boards (UI-08). It is big, so it is split again (plan 50.2). This package holds the FIRST small piece:
**C-1 = the board catalog, and boards + years in the data and rule layer. NO screen change** (the app looks and behaves exactly as v0.2.30b).

## What is new
1. **Built-in boards** are seeded into `board_catalog` on every open (INSERT OR IGNORE, so an older or restored database gets them too): ঢাকা, রাজশাহী, কুমিল্লা, যশোর, চট্টগ্রাম, বরিশাল, সিলেট, দিনাজপুর, ময়মনসিংহ, মাদ্রাসা, কারিগরি (codes DHA, RAJ, COM, JES, CTG, BAR, SYL, DIN, MYM, MAD, TEC). This list is a DECISION by the assistant (see below).
2. **Custom boards:** `addCustomBoard(code, name)`. Code: A-Z, 0-9 and "_" (lower case is made upper case), 1-20 characters. Name: any text, 1-40 characters, spaces cleaned. A code or name that already exists (names compared ignoring case) is refused; nothing is written when refused. Read back before reporting success.
3. **Board tags** (board + year, year 1900-2200): a group can be saved with tags on the stimulus and on each sub-question. The same board+year twice is stored once; the order the person chose is kept.
4. **Edit:** same meaning as ratings. `boards = null` leaves every stored tag alone; when given, the stimulus list and each listed question list are the wanted full lists (an empty list clears); a label that is absent keeps its tags; the same tags again are "no change"; a tags-only change is a real change (`updated_at` moves, text and search index stay).
5. Rules: tags of a block without text are not stored (stimulus tags need stimulus text, question tags need question text); an unknown board code is refused BEFORE the write with the message "অজানা বোর্ড: CODE"; a year outside 1900-2200, an empty code, or more than 30 tags on one block is refused (SaveResult.Failed / UpdateResult.Failed, nothing written).
6. Saving and editing read the tags back from the database before reporting success; everything is still ONE transaction together with the draft removal.
7. The list, the search result and the edit screen's loaded card now carry the tags (`SavedGroup.stimulusBoards`, `SavedSubQuestion.boards`). Nothing shows them yet (chips come in C-2).

## Decisions taken by the assistant (owner may overrule)
- **Built-in boards:** the nine general education boards plus মাদ্রাসা and কারিগরি, short names without the word "বোর্ড". Only the display name may change later; codes never change. If you want other boards or other names, tell me and the seed list changes (one small list).
- **Codes of custom boards are A-Z / 0-9 / "_" only** (stable ids); the name is what people see and may be Bengali.
- **Drafts do not carry boards yet.** The automatic drafts (new and edit) keep texts and ratings only. Boards go into the drafts in C-2 together with the screen, so that the draft format changes once.
- Archiving / renaming / removing a custom board is not part of C-1 (no screen yet); a board that questions use cannot be removed anyway (foreign key RESTRICT).

## Not in this package (on purpose)
Board picker, year window, "অন্য সাল লিখুন", chips, "নতুন বোর্ড যুক্ত করুন" dialog (C-2); search by board / year (C-3); reference text + editable marks (part D), Minimum / Full modes, undo / redo, duplicate warning (part E).

## Version
`versionCode` 32, `versionName` 0.2.30c-boards-data. **No schema change:** database version 1, identityHash must remain 786b471dfa14c9ae4739bb81479bab25. No new dependency. Same debug key.

## Tests (expected, NOT run)
- Unit (JVM): 13 new in `BoardRulesTest`. Expected total **122 of 122** (109 + 13).
- Emulator: 8 new in `QuestionBoardTest` (seed of 11 built-in boards once; tags read back in chosen order; tags of blocks without text not stored; tags-only edit leaves text / search rows alone, null keeps, same = no change, empty clears; unknown code refused and nothing written; year out of range refused; custom board added / refused / used; loadGroup and search carry the tags). Expected total **93** (85 + 8).
- The Kotlin code has NOT been compiled or run in this environment (no Gradle). The first CI run may show a compile error; send the report.

## Phone check list (owner) - nothing visible changes, so only 3 steps
1. Install over v0.2.30b-fix1 without uninstall; every subject, chapter, topic and question must still be there; ratings and cards look as before.
2. "নতুন প্রশ্ন": save one question with a stimulus and two sub-questions; edit it and change a rating; search a word and "#": all still work.
3. Kill the app from recent apps and open it again: the data is still there and the app starts normally (the board seed runs on every open).

If any step fails or looks wrong, tell the assistant and the record will be corrected.

STATUS: written, NOT compiled, NOT run - UNCONFIRMED.

FIX1: CI failed to compile (TypeCqQuestionRepositoryImpl.kt:160, missing BadBoard branch in the `when` of updateGroup). One line added; nothing else changed.
