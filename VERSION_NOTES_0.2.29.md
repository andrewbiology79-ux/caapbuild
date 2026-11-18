# Version 0.2.29 - Edit drafts, part 2 of 2, and hashtag search (plan v1.37, section 46)

v0.2.28 is CONFIRMED by owner report (CI clean, emulator clean, 10-step phone check clean; the counts were not sent to the assistant).
This package has two small, separate parts. Neither one changes the database schema.

## Part 1 - Automatic edit draft (B-2)
1. While you edit an existing question, every change is saved automatically as a **draft** (key `draft:type_cq:edit:<card>` in `app_metadata`), exactly like the draft of a new question. The saved question is NOT touched by a draft: it stays as it was until you press "পরিবর্তন সংরক্ষণ করুন".
2. If the app is closed or killed in the middle of an edit, open the same card's "সম্পাদনা" again: your typed text is back and a blue line says "আগের অসমাপ্ত সম্পাদনা ফিরিয়ে আনা হয়েছে।".
3. A draft exists only while the typed text differs from the saved text. If you type the old text back, the draft is removed.
4. **Save** removes the draft in the SAME database transaction as the update (all or nothing). If the save is refused or fails, the draft stays and your text stays on the screen.
5. **"ফেলে দিন"** in the leave dialog removes the draft and leaves; the question is unchanged. (The dialog text now says the draft is thrown away too.)
6. The status line under the title shows "ড্রাফটে সংরক্ষণ হচ্ছে…" / "ড্রাফট সংরক্ষিত ✓ (প্রশ্নটি এখনো আগের মতোই আছে)".
7. Each card has its own draft; the new-question draft of the topic is separate and not affected.

## Part 2 - Hashtag search (option A of plan 45.3; decision by the assistant, owner may overrule)
- A search word that starts with `#` (also `#` alone) is matched as plain text, with the `#` sign, in the question text, the short answer and the stimulus.
- `#` alone finds every question that contains a `#`. `#আলো` finds `#আলো` and `#আলোর`, but NOT a text that has only the bare word `আলো`.
- Words without `#` work as before (FTS5). All words must match; a stimulus match still shows all sub-questions of the card.
- Latin letters ignore case (`#Optics` = `#optics`). Read-only: nothing is written.

## Not in this package (on purpose)
Editable fields (ratings, boards, years, marks: v0.2.30), delete and selection (v0.2.31), JSON paste import (v0.2.32).

## Version
`versionCode` 29, `versionName` 0.2.29-edit-drafts-hashtag. No schema change: database version 1, identityHash must remain 786b471dfa14c9ae4739bb81479bab25. No new dependency.

## Tests
- Unit (JVM), 6 new in `QuestionSearchRulesTest` (hash word kept, not sent to FTS5, plain match rules, case, lone `#`, stimulus). Expected total **95 of 95** (89 + 6).
- Emulator, 10 new: `QuestionEditDraftTest` 7 (store and load every field, blank draft stored, draft never changes the saved row or FTS, update removes the draft in the same transaction, refused update and no-change keep it, discard removes only that card's draft, edit draft separate from the new-question draft) and `QuestionSearchTest` 3 (lone `#`, hashtag is not the plain word, hashtag with plain words and in the stimulus). Expected total **78** (68 + 10).
- The Kotlin code has NOT been compiled or run in this environment (no Gradle).

## Phone check list (owner) - please report step by step
1. Install over v0.2.28 without uninstall; every question must still be there.
2. Open "সম্পাদনা" on a card, change one word, do NOT save. The status line shows "ড্রাফট সংরক্ষিত ✓". Swipe the app away from recent apps (kill it).
3. Open the app, the same topic, the same card, "সম্পাদনা": your changed word is back, the blue line "আগের অসমাপ্ত সম্পাদনা ফিরিয়ে আনা হয়েছে।" shows, the save button is on. In the list the card still shows the OLD text.
4. Type the old word back: the save button turns grey. Leave with Back (no dialog). Open "সম্পাদনা" again: no restored text.
5. Change something, press Back: the dialog appears. Choose "সম্পাদনা চালিয়ে যান": the text is still there. Press Back again, choose "ফেলে দিন": you return to the list, the card is unchanged. Open "সম্পাদনা" again: no restored text.
6. Change something and press save: the card shows the new text. Open "সম্পাদনা" again: no restored text (the draft was removed with the save).
7. Edit TWO different cards (change a word in each, kill the app): each card brings back only its own text.
8. Empty the text of an existing question and press save: the red message refuses it. Kill the app, reopen the same edit: your emptied text is still there (the draft stayed).
9. In a topic write `#physics` inside a question (use "নতুন প্রশ্ন"), save. Search `#physics`: the card is found. Search `#`: the card is found (and every other question with a `#`).
10. Search the bare word `physics`: the card is found too. Search `#xyz` (a tag nobody used): nothing is found, the screen says nothing matched (not an error).

If any step fails or looks wrong, tell the assistant and the record will be corrected.

STATUS: written, NOT compiled, NOT run - UNCONFIRMED.
