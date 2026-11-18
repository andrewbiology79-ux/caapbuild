# Version 0.2.26 - Hierarchy management (plan v1.29, section 40.6 step 2; UI-02, UI-03)

Owner report on v0.2.25 (18 November 2026): CI report OK, emulator (instrumented) test OK, phone check list done. The test counts (46 unit, 40 emulator) and the identityHash were not sent; status is "green by owner report".

## What changed
1. **Counts** on every card of the subject, chapter and topic lists: "২ টি অধ্যায় · ১৪ টি প্রশ্ন" (topics: only questions). Above the list: "মোট বিষয়: N টি" (chapters, topics likewise).
2. **Breadcrumb** under the header: "বিষয় তালিকা › পদার্থ › গতি". Every part except the last is tappable and goes back to that list. The header shows the list name with the parent name as small subtitle.
3. **Cards in the new design**: blue rounded square with the two-digit Bengali serial, name, count line, chevron, 3-dot menu.
4. **Rename** (3-dot menu "নাম পরিবর্তন"): same rules as adding (blank, 200 characters, duplicate in the same parent). The old name is filled in.
5. **Delete** (3-dot menu "মুছে ফেলুন"): asks for confirmation. Only an EMPTY item can be deleted. A subject with chapters, a chapter with topics, or anything with questions is refused with a message that says why (ADR-010). Deleting questions comes in v0.2.29.
6. **Reorder**: button "ক্রম পরিবর্তন" shows up/down arrows on every card; "ক্রম সংরক্ষণ" saves the order once, "বাতিল" or Back drops the change. The order is kept in the database (sort_order) and survives restart and backup/restore.
7. `versionCode` 26. No schema change: database version 1, identityHash must remain 786b471dfa14c9ae4739bb81479bab25. No new dependency.

## Not in this package (on purpose)
- Rename/delete of the OPEN item from the header menu (the cards' 3-dot menu does the same job one level up).
- Deleting a non-empty item (needs the v0.2.29 delete-safety design).
- Selection counts ("N নির্বাচিত") on cards: selection arrives in v0.2.29.
- Hind Siliguri font, real tab icons (still open from v0.2.25).

## Tests
- Unit (JVM): new `HierarchyListLogicTest` (11: arrow moves, count line, text of the refused delete). Expected total **57 of 57** (46 + 11).
- Emulator: new `HierarchyManageTest` (11 on the real Room database: counts, rename, scope of names, delete only when empty, draft removal, reorder, stale list refused, scope of reorder, breadcrumb path). Expected total **51** (40 + 11).

## Phone check list (owner)
1. Install over v0.2.25 without uninstall; the questions must still be there.
2. Subject list: each card shows the serial, the name and "N টি অধ্যায় · N টি প্রশ্ন" with Bengali digits; the total line is right.
3. Open a subject and a chapter: the breadcrumb grows; tap "বিষয় তালিকা" or the subject name in it: you go back to that list.
4. 3-dot > নাম পরিবর্তন: change a name; a name that already exists in the same list is refused; the same name in another subject/chapter is accepted.
5. 3-dot > মুছে ফেলুন on an empty topic: confirmation, then it disappears. On a topic with questions and on a chapter with topics: the "মুছে ফেলা যাবে না" message; nothing is deleted.
6. ক্রম পরিবর্তন: move items with the arrows, tap ক্রম সংরক্ষণ; close and reopen the app: the order is kept. Try বাতিল and the Back key: the old order stays.
7. Add a new subject: it appears at the end of the list.

STATUS: emulator run on API 34: 50 of 51 passed; the one failure was a wrong expectation in HierarchyManageTest.renameUsesTheSameCleaningAsAdd (NFC form of য়), fixed in this package. CI (unit tests) and phone check still to be reported.
