# Version 0.2.25 - UI shell (plan v1.29, section 40)

Owner test of v0.2.24 (18 November 2026): install over v0.2.23 without uninstall OK; backup and restore OK; a photo chosen as backup file is refused. P-30, P-31 and P-34 are confirmed.
The owner delegated the design decisions D-1 to D-14 to the assistant (plan 40.2).

## What changed
1. **Five bottom tabs** in the owner's order: Create, Type CQ, Chapter CQ, Filter, Profile. Each tab keeps its own position when you switch (leave Type CQ deep inside a topic, visit Profile, come back: you are still in the topic).
   Create, Chapter CQ and Filter are placeholders that say what comes later. Type CQ is the existing hierarchy and question screens. The app starts on Type CQ.
2. **Blue header** on every screen (back arrow, title; fills the area behind the status bar). The old white top bars are gone.
3. **Profile tab**: backup status and the button to the backup screen (the old home screen is removed), theme Light / Dark, text size 12 to 28 with minus / plus / default, app version.
4. **Theme chosen by the owner**, not by the system. Palette from plan 39.4 (brand #3B4FD8, light and dark), 16 dp card corners. Text size scales the whole app (16 = same as before).
5. **Bengali digits** for numbers on screen: question counts, marks, backup counts and times. File names and database values keep Latin digits.
6. **Back** at the first screen asks "অ্যাপ থেকে বের হবেন?". The question editor hides the bottom bar.
7. `versionCode` 25. No schema change: database version 1, identityHash must remain 786b471dfa14c9ae4739bb81479bab25.

## Not in this package (on purpose, small later steps)
- Hind Siliguri font: a font file is needed and cannot be downloaded in the build environment (the screens still use the system font).
- Real tab icons: plain text symbols are used (no new dependency). The bottom bar has the standard Material height (80 dp), not 64 dp.
- Theme and text size are not inside the backup file yet (they live in preferences, because the first frame needs them before the database opens).
- Subject/chapter/topic counts, breadcrumb, rename, delete, reorder: v0.2.26.

## Tests
- Unit (JVM): new `BengaliDigitsTest` (6) and `TextSizePolicyTest` (5). Expected total 46 of 46 (35 + 11).
- Emulator: new `AppSettingsTest` (3: defaults, survives a new instance, limits). Expected total 40 (37 + 3).
- Cold start must still be at most 10 s (N-1): the owner checks this on the phone (first open after install).

## Phone check list (owner)
1. Install over v0.2.24 without uninstall; the questions must still be there.
2. Five tabs at the bottom; Type CQ shows the subjects; open a subject, chapter, topic: bottom bar stays, header is blue with a back arrow.
3. Go to Profile and back to Type CQ: you are still inside the topic you left.
4. Profile: switch to Dark and back; change the text size (for example 22): the whole app follows; close and reopen the app: both choices are remembered.
5. Add a question: the editor hides the bottom bar; save; the list shows Bengali digits ("... টি প্রশ্ন সংরক্ষিত").
6. Back at the first screen asks before leaving.

STATUS: written, NOT compiled, NOT run - UNCONFIRMED.
