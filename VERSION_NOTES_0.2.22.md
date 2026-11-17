# Version 0.2.22 - fix: HierarchyName crashed on Android (found by the emulator run of v0.2.21)

Evidence (instrumented report, 20,000 rows, emulator API 34, v0.2.21):
- The app and all test sources compiled; the three new DAOs, the repository and lifecycle-viewmodel-compose 2.10.0 build.
- The 10 existing RoomRuntimeTest tests and the benchmark passed; the 7 TypeCqHierarchyRepositoryTest tests FAILED (suite total 18, 7 failures).
- Cause (logcat): `PatternSyntaxException` at `HierarchyName.<clinit>`: Android's regex engine does not accept the `(?U)` flag used in v0.2.21.
  The JVM unit test passed on a desktop JDK, which accepts it - so the normal CI could not see this. Any attempt to add a subject on a phone
  with v0.2.21 would have crashed. Do not use the v0.2.21 APK.

Change
1. `HierarchyName.clean` rewritten as a plain loop over `Char.isWhitespace()` (same rules, same results, same on JVM and Android).
2. New emulator test `HierarchyNameAndroidTest` (2 tests) runs the same rules on the Android runtime.
3. Notes/ADR-004/plan updated. No other code change; database version 1, schema unchanged.

Side result: the 20,000-row baseline (P-22) now exists. Edit 0.11 ms and delete 0.11 ms per row, rank-ordered search 9.9 ms,
deep OFFSET (10,000) 4.7 ms, FTS rows = question rows (19,800).

STATUS: written, NOT compiled, NOT run - UNCONFIRMED.
Expected: normal CI 17 of 17 unit tests, schema hash unchanged. Emulator workflow: 20 tests (10 RoomRuntimeTest + 1 benchmark + 7 hierarchy + 2 name) all green.
Then check on the phone: Home -> Type_CQ -> add subject, chapter, topic; close the app completely and reopen; the data must still be there.
