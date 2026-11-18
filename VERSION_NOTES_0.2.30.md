# Version 0.2.30 parts A-1 + A-2 - Ratings: data layer and rating buttons (plan v1.39, sections 47 and 48)

v0.2.29 is CONFIRMED by owner report (CI clean, instrumented test clean, phone check list clean; the counts were not sent to the assistant).
The next step, v0.2.30 "editor fields" (UI-06 to UI-10), is big, so it is split (plan 47.2). This package holds the FIRST TWO small pieces: **A-1 ratings in the data and rule layer, A-2 the rating buttons on both editor screens.** A-1 was never tested alone: the owner asked for A-2 on top of it, so a and b are tested together.

## What is new
1. A group can be saved with a **stimulus rating** and a **rating per sub-question** (1-5, or none). The columns already exist (`type_cq_stimuli.rating`, `type_cq_questions.rating`, with CHECK 1..5): no schema change.
2. An edit can change ratings: a rating-only change is a real change (it is saved, and `updated_at` moves); the same ratings again are "no change"; a rating can be cleared on purpose.
3. `ratings = null` means "leave every stored rating alone". The screens of v0.2.29 pass nothing, so **the app looks and behaves exactly as v0.2.29**.
4. Rating rules: a stimulus rating without a stimulus text is not stored; a rating for a block without question text is not stored; a rating outside 1-5 is refused (SaveResult.Failed / UpdateResult.Failed, nothing written).
5. Saving and editing read the ratings back from the database together with the text before reporting success.
6. Drafts (new and edit) can carry ratings (`stimulusRating`, `ratings`). A rating alone is not content (a draft that is otherwise blank is still blank). Drafts written by v0.2.29 load as "no rating".
7. Rule U-1 for the card is unchanged (stimulus rating, else average of the question ratings with ties rounded up, else 3).

## Part A-2 (v0.2.30b) - rating buttons on the screens
1. **New-question screen:** under the stimulus box, five buttons "১★ ২★ ৩★ ৪★ ৫★" with the line "উদ্দীপকের রেটিং"; under each question box the same with "ক) প্রশ্নের রেটিং" and so on. The buttons of a block appear only when that block has text (a rating is stored only with its text).
2. **Edit screen:** the same buttons, filled with the saved ratings. Changing only a rating turns the save button on; saving it changes only the rating (the text and the search index stay as they are).
3. Under the buttons one line: "মাঝারি" style name of the chosen rating ("৩★ · মাঝারি"), or "রেটিং বাছা হয়নি (কার্ডে ৩★ দেখাবে)". Names: ১ সহজ, ২ মোটামুটি, ৩ মাঝারি, ৪ ভালো, ৫ চ্যালেঞ্জিং.
4. Tapping the chosen button again clears the rating (nothing saved = the card shows ৩★ by rule U-1).
5. Ratings are part of the automatic drafts: new-question draft and edit draft keep them when the app is killed. On the edit screen an edit that differs only in a rating is a change (the leave dialog appears, the draft is kept).
6. The card needs no change: it already shows the rating by rule U-1 (stimulus rating; else average of the question ratings, ties rounded up; else ৩).
7. New files: `RatingPicker.kt` (the buttons), `RatingHint.kt` (the line under them, pure so it can be unit tested). Changed: both editor ViewModels and both editor screens.

## Decision taken by the assistant (owner may overrule)
- **No rating chosen = null (not saved), not "3".** The card still shows 3 by rule U-1. Reason: if 3 were saved by default, every stimulus would have a saved rating and the question ratings could never count (rule U-1 would be dead). The names for the five stars are fixed: 1 সহজ, 2 মোটামুটি, 3 মাঝারি, 4 ভালো, 5 চ্যালেঞ্জিং.

## Not in this package (on purpose)
Boards + years (part B), reference text + editable marks (part C), Minimum / Full modes, undo / redo, duplicate warning (part D).

## Version
`versionCode` 31, `versionName` 0.2.30b-rating-buttons. No schema change: database version 1, identityHash must remain 786b471dfa14c9ae4739bb81479bab25. No new dependency.

## Tests
- Unit (JVM), 11 new in `QuestionRatingRulesTest` and 3 new in `RatingHintTest`. Expected total **109 of 109** (95 + 11 + 3).
- Emulator, 7 new in `QuestionRatingTest` (saved ratings read back + rule U-1, nothing stored for a block without text, no ratings = null, rating-only edit leaves text and FTS rows alone, `null` keeps / same = no change / clear, rating added with a new sub-question, value outside 1-5 refused, drafts with ratings and old drafts). Expected total **85** (78 + 7; part A-2 adds no emulator test: the screens are checked on the phone).
- The Kotlin code has NOT been compiled or run in this environment (no Gradle). Like earlier packages, the first CI run may show a compile error; send the report.

## Phone check list (owner) - please report step by step
1. Install over v0.2.29 without uninstall; every subject, chapter, topic and question must still be there; old cards show "৩★".
2. "নতুন প্রশ্ন": the five buttons appear only after you type in the stimulus box, and under a question box only after you type in it. Empty blocks have no buttons.
3. Tap "৪★" for the stimulus: the line says "৪★ · ভালো". Tap "৪★" again: the line says "রেটিং বাছা হয়নি (কার্ডে ৩★ দেখাবে)".
4. Stimulus "৫★", ক "২★", save: the card shows "৫★" (the stimulus rating wins).
5. A question WITHOUT stimulus: ক "১★" and খ "২★" (no stimulus rating), save: the card shows "২★" (average 1.5 rounded up, rule U-1).
6. Open "সম্পাদনা" on the first card: the buttons show ৫★ and ২★. Change ONLY the stimulus rating to "১★" (no text change): the save button is on. Save: the card shows "১★". Open the edit again: ১★ and ২★ are there, no restored-draft line.
7. Edit, change the ক rating, kill the app from recent apps, open the same edit: your rating is back with the blue line "আগের অসমাপ্ত সম্পাদনা ফিরিয়ে আনা হয়েছে।".
8. Clear the stimulus rating and the ক rating (tap the chosen button again), save: the card shows "৩★". Search a word and "#": still works.

If any step fails or looks wrong, tell the assistant and the record will be corrected.

STATUS: written, NOT compiled, NOT run - UNCONFIRMED.
