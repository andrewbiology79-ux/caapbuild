# Version 0.2.27 - Question card and in-topic search (plan v1.33, section 42; UI-04, UI-05) - PART A of the split step

Owner decision (18 November 2026): the next step of plan 41.5 is split in two parts.
- **Part A = v0.2.27 (this package):** the question card in the new design and the Bengali search inside a topic. Read-only: nothing is edited or deleted.
- **Part B = v0.2.28 (not written yet):** open an existing question in the editor and save the change. It starts only after part A is confirmed (CI report + emulator report + phone check list).

## What changed
1. **Question card** (one card per stimulus): blue ribbon "প্রশ্ন ১" with a yellow rating badge ("৩★", rule U-1), a light strip with "ট্যাগ নেই", then the stimulus, and every sub-question with its label, type, marks and short answer. Dark theme has its own badge colours.
2. **Search** in the question list: the 🔍 button in the header opens a search box (keyboard opens at once). The list narrows 0.3 s after the last key.
   - Question text and short answer: FTS5. The last word may be unfinished ("আলোর প্রতিফ" finds "আলোর প্রতিফলন"); earlier words must be whole words; all words must match.
   - Stimulus text: plain text match of every word.
   - A card shows only the sub-questions that matched; if the stimulus matched it shows all of them.
   - Line above the cards: "N টি প্রশ্ন পাওয়া গেছে". No match: "কোনো প্রশ্ন পাওয়া যায়নি।". Only punctuation typed: "খোঁজার জন্য অক্ষর বা সংখ্যা লিখুন।".
   - ✕ clears the text; the Back key closes the search first. The "+ প্রশ্ন যোগ করুন" button is hidden while searching.
3. `versionCode` 27. No schema change: database version 1, identityHash must remain 786b471dfa14c9ae4739bb81479bab25. No new dependency.

## Not in this package (on purpose)
- Opening a question in the editor, edit, delete (part B = v0.2.28 and later), 3-dot menu and checkbox on the card.
- Solution toggle, pictures, board / paper chips ("ট্যাগ নেই" is always shown): none of these can be entered yet.
- Search in solutions, boards and years; search across Bengali and Latin digits (P-46); highlighting of the matched words.
- Rating is shown but cannot be set yet (editor fields come with v0.2.29), so every card shows ৩★ for now.

## Tests
- Unit (JVM), 17 new: `QuestionSearchRulesTest` 10 (words, NFC, quotes, limits, FTS string, plain match, card filter), `QuestionCardRulesTest` 4 (rule U-1), `QuestionListLogicTest` 3 (Bengali digit texts). Expected total **74 of 74** (57 + 17).
- Emulator, 8 new on the real Room database: `QuestionSearchTest` (Bengali word in text and short answer, prefix rule, stimulus match vs question match, topic scope, nukta spellings, punctuation and FTS syntax never fail, ratings reach the card, newest first and new rows found at once). Expected total **59** (51 + 8).
- The expected results of the FTS queries in these tests were also checked against a real SQLite 3.45.1 FTS5 table with the same tokenizer; the Kotlin code itself has NOT been compiled or run.

## Phone check list (owner) - please report step by step
1. Install over v0.2.26 without uninstall; the questions must still be there.
2. Open a topic with questions: every card has a blue ribbon "প্রশ্ন ১, ২, ৩…" with a yellow "৩★" badge, a grey strip "ট্যাগ নেই", then the text. Digits are Bengali.
3. Profile > Dark theme, back to the list: ribbon, badge and text are readable.
4. Tap 🔍: the keyboard opens, the box is in the blue header, the "+" button is gone. Type a Bengali word that is in some question: after a short pause only the matching cards remain; the count line is right.
5. In a card with a stimulus and several sub-questions: a word that is only in one sub-question shows only that one; a word from the stimulus shows all of them.
6. Type only the first letters of a word (it must find it); type two words (both must be present); type a word that exists nowhere; type only "...".
7. ✕ brings back the full list. With the search open, Back closes the search (you stay in the topic); a second Back leaves the topic. Rotate the phone while searching: text and result stay.
8. Add a new question with "+ প্রশ্ন যোগ করুন", save, search a word from it: it is found.

If any step fails or looks wrong, tell the assistant and the record will be corrected.

STATUS: written, NOT compiled, NOT run - UNCONFIRMED.
