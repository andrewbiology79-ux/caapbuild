# Version 0.2.30c part C-3 - Search by board and year (plan v1.44, section 53)

v0.2.30c-2 (the board + year screens) is CONFIRMED by owner report (CI clean, instrumented test clean, check list clean; the counts and the step-by-step results were not sent). This package is the THIRD and last piece of "boards + years" (UI-08): **search by board and year**. It closes the open part of UI-05.

## What is new
1. **Filter bar under the search box**: two chips, "বোর্ড: সব" and "সাল: সব". Tap the board chip: a list of the boards ("সব বোর্ড" + every board of the catalog). Tap the year chip: "সব সাল", the 12 most recent years, or "অন্য সাল" typed with Bengali or Latin digits. "ফিল্টার মুছুন" clears both.
2. **The filter works alone or together with the typed text.** With the filter only (the text box empty) the cards of the topic that fit are shown. With text, a question must fit BOTH the text and the filter.
3. **Rules (decided at the start of C-3, owner may overrule)**
   - C3-1 The filter is a pair of chips, not magic words in the text box (typing "ঢাকা" in the text box still searches the question texts only).
   - C3-2 Board and year together mean ONE tag: ঢাকা + ২০২০ finds a tag "ঢাকা ২০২০", not a question that has ঢাকা ২০১৯ and some other board ২০২০.
   - C3-3 A tag on the stimulus counts for every sub-question of that card; a tag on a question counts for that question.
   - C3-4 With a filter on, a card shows only the sub-questions that fit both the text and the tags (without a filter nothing changed: a stimulus match still shows all sub-questions).
   - C3-5 Closing the search (back arrow) clears the text and the filter.
   - C3-6 Text that has no usable word (for example only "...") still says "খোঁজার জন্য অক্ষর বা সংখ্যা লিখুন।", also with a filter on.
4. The result cards show their board chips (from C-2), so a result can be checked by eye.
5. **P-46 for years:** the year filter compares numbers, so "২০১৯" and "2019" are the same year there. (The text box still treats Bengali and Latin digits in the TEXT as different words; that stays open, low priority.)

## Not in this package (on purpose)
Removing a chip directly on a card; archiving / renaming custom boards; filter by rating; reference text, editable marks, type chooser (part D); Minimum / Full modes, undo / redo, duplicate warning (part E).

## Version
`versionCode` 34, `versionName` 0.2.30c3-board-search. **No schema change:** database version 1, identityHash must remain 786b471dfa14c9ae4739bb81479bab25. No new dependency. Same debug key.

## Tests (expected, NOT run)
- Unit (JVM): 10 new in `BoardFilterSearchTest` (filter empty / board only / year only / same-tag rule, tag on the stimulus, text + tag on the same question, stimulus text match narrowed by tags, single question and order, chip texts). Expected total **142 of 142** (132 + 10).
- Emulator: 3 new in `QuestionBoardTest` (search by board / year without text; text + filter together and the old search unchanged; no usable text is still NoTerms). Expected total **99** (96 + 3). The filter bar has no emulator test; it is checked by the phone list below.
- The Kotlin code has NOT been compiled or run in this environment (no Gradle). Risk points for the first CI run: `BoardFilterBar.kt` (new Compose code), the 3-flow `combine` in `QuestionListViewModel`, the new default parameter of `TypeCqQuestionRepository.search`. If CI fails, send the report.

## Phone check list (owner) - 6 steps
1. Install over v0.2.30c2 without uninstall. Open a topic that has questions with board tags (tag a few in different boards and years if needed: at least ঢাকা ২০১৯, ঢাকা ২০২০, রাজশাহী ২০২০; one tag on a stimulus, one on a question).
2. Tap the search icon: under the search box you see "বোর্ড: সব" and "সাল: সব"; the list is still shown (nothing typed, nothing filtered).
3. Choose the board ঢাকা: the cards with a ঢাকা tag (on the stimulus or on a question) are shown with a "N টি প্রশ্ন পাওয়া গেছে" line; the chip says "বোর্ড: ঢাকা". Then choose the year ২০২০: only a ঢাকা ২০২০ tag fits (a card with ঢাকা ২০১৯ and রাজশাহী ২০২০ is NOT shown).
4. Type a word that is in some of those questions: only the questions that fit text AND filter are shown. "ফিল্টার মুছুন" brings back the text-only result. Type the year with "অন্য সাল" in Bengali digits (for example ২০১৫).
5. A board or year nobody has: the message "কোনো প্রশ্ন পাওয়া যায়নি।" shows. Type only "..." with a filter on: "খোঁজার জন্য অক্ষর বা সংখ্যা লিখুন।".
6. Close the search with the back arrow: the full list is back, the filter is cleared when you open the search again. Search a word and "#": still works.

If any step fails or looks wrong, tell the assistant and the record will be corrected.

STATUS: written, NOT compiled, NOT run - UNCONFIRMED.
