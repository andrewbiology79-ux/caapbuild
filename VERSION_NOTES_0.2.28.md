# Version 0.2.28 - Edit an existing question, part 1 of 2 (plan v1.34, section 43; UI-11 edit part)

Owner decision (18 November 2026): part B of the split step is itself split in two, because it is the first package that changes saved questions.
- **v0.2.28 (this package) = B-1:** the 3-dot menu on the card, the edit screen with the stored texts, and one all-or-nothing save.
- **v0.2.29 = B-2 (not written yet):** automatic drafts for an edit (key `draft:type_cq:edit:<id>`). Starts only after v0.2.28 is confirmed (CI + emulator + phone).
v0.2.27 is CONFIRMED (CI run 38: 74 of 74; emulator 59 of 59; identityHash unchanged; phone check list clear by owner report).

## What changed
1. **Card menu:** the blue ribbon has a "⋮" button with one item, "সম্পাদনা". It works in the normal list and in search results.
2. **Edit screen** "প্রশ্ন সম্পাদনা" (full screen, no bottom tabs): the stimulus (only when the card has one) and the sub-question blocks with the stored texts and short answers.
   - A card WITH a stimulus shows all four blocks (ক, খ, গ, ঘ): an empty block can get a new question.
   - A single question (no stimulus) shows only its own block.
   - Marks and question types never change here (editable marks come with the editor fields, v0.2.30).
3. **Save** "পরিবর্তন সংরক্ষণ করুন" is enabled only when something really changed (same cleaning as a new save: NFC, trim). It is ONE database transaction: stimulus text, texts and short answers of stored sub-questions, new rows for labels that were empty (own `fts_id`), `updated_at`. The FTS rows follow through the existing update trigger. "Saved" is reported only after the rows were read back. Any failure rolls everything back and the old text stays.
4. **Refused with a message, nothing written:** blanking the text of a stored sub-question (that is a delete, v0.2.31); blanking the stimulus; a short answer without a question text; too long (20,000 characters); the card disappeared meanwhile.
5. **Leaving with unsaved changes** (Back key or arrow) asks "পরিবর্তন সংরক্ষিত হয়নি" first. There is NO edit draft in this package: if the app is killed in the middle of an edit, the typed edit is lost and the saved question stays as it was (drafts: v0.2.29).
6. After saving: back to the list, snackbar "পরিবর্তন সংরক্ষিত হয়েছে ✓"; the card shows the new text at once. An open search runs again by itself, so its result never shows old text.
7. `versionCode` 28. No schema change: database version 1, identityHash must remain 786b471dfa14c9ae4739bb81479bab25. No new dependency.

## Decision taken by the assistant (owner may overrule)
- A new sub-question added to an existing card gets the card's current highest `sort_order` (plan 42.4 item 3 said "next sort_order"). Reason: the list is newest-first and a card is placed by its highest `sort_order`; the next number would make the edited card jump to the top. With this rule the card keeps its place.

## Not in this package (on purpose)
- Edit drafts (v0.2.29). Ratings, boards, years, reference, editable marks (v0.2.30). Delete, copy, selection (v0.2.31). Undo/redo.
- Changing the type or marks of a sub-question; adding a stimulus to a single question; moving a question to another topic.

## Tests
- Unit (JVM), 15 new: `QuestionEditRulesTest` (no change, spaces and Nukta spellings are no change, changed text / short answer / stimulus, blanking refused for a question and for the stimulus, new label added, answer without text, single question, limits, group key and bad keys). Expected total **89 of 89** (74 + 15).
- Emulator, 9 new on the real Room database: `QuestionEditTest` (old word gone from FTS and new word found, stimulus group changed in one save, blanking a question refused with nothing written, blanking the stimulus refused, missing label added with its own FTS row and the card keeps its place, no-change writes nothing, failure in the middle rolls back the stimulus change too, group deleted meanwhile, other cards and topics untouched). Expected total **68** (59 + 9).
- The Kotlin code has NOT been compiled or run in this environment (no Gradle).

## Phone check list (owner) - please report step by step
1. Install over v0.2.27 without uninstall; every question must still be there.
2. Open a topic: every card has a "⋮" at the right end of the blue ribbon. Tap it: one item "সম্পাদনা".
3. Tap "সম্পাদনা" on a card WITH a stimulus: the screen "প্রশ্ন সম্পাদনা" shows the stimulus and all four blocks with the saved texts. The save button is grey.
4. Change one word in a question text: the save button turns on. Save: you return to the list, the snackbar "পরিবর্তন সংরক্ষিত হয়েছে ✓" shows, the card shows the new text, and the card is in the same place in the list.
5. Edit a card, change the stimulus, save: the card shows the new stimulus. Edit a SINGLE question (no stimulus): only its own block is shown; change and save.
6. In an empty block (for example গ) of a card with a stimulus type a question and an answer, save: the new sub-question appears on the card in the right order.
7. Empty the text of an existing question and press save: a red message refuses it and the question stays. Empty the stimulus: refused the same way.
8. Change something and press Back (and again with the ← arrow): the dialog asks; "সম্পাদনা চালিয়ে যান" stays, "ফেলে দিন" leaves and the question is unchanged.
9. Search for a word, open "সম্পাদনা" from a search result, change that word, save: the search result updates by itself (the old word no longer finds the card).
10. Search for the NEW word you typed in step 4: it finds the card. Rotate the phone on the edit screen: your typed text stays.

If any step fails or looks wrong, tell the assistant and the record will be corrected.

STATUS: written, NOT compiled, NOT run - UNCONFIRMED.

## CI fix (run 39)
- `QuestionEditViewModel`: `fun setStimulus(value)` clashed with the JVM setter of `var stimulus ... private set` ("Platform declaration clash", compileDebugKotlin failed). Renamed the function to `changeStimulus` and updated `QuestionEditScreen`. No behaviour change.
