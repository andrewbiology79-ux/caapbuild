# Version 0.2.21 - Type_CQ hierarchy: subjects, chapters, topics (Step D, first part)

Evidence for v0.2.20: the debug APK produced by CI was installed on a phone; the home screen and the Bengali text display correctly
(owner report, 18 November 2026). The CI report itself was not supplied, so unit-test counts for v0.2.20 are not on record.

Changes in this package
1. Data layer: `TypeCqSubjectDao`, `TypeCqChapterDao`, `TypeCqTopicDao` (Flow lists ordered by sort_order, name, id; atomic
   INSERT ... SELECT MAX+1). Registered in `QuestionBankDatabase`. No table or column changes: database version stays 1 and the
   Room schema hash must stay 786b471dfa14c9ae4739bb81479bab25 (compare with the schema JSON in the CI report).
2. Domain: `HierarchyName.clean` (NFC, white space, 200 characters), `HierarchyItem`, `AddResult`, `TypeCqHierarchyRepository`.
3. `TypeCqHierarchyRepositoryImpl`: add subject / chapter / topic with blank, too-long, duplicate, missing-parent and failure results.
   `AppContainer.typeCqHierarchy` exposes it; the UI never touches a DAO.
4. UI: one `HierarchyListViewModel` and one `HierarchyListScreen` used for subjects -> chapters -> topics, with loading, empty and
   error states and an add dialog; navigation routes for the three levels; home screen button.
5. Tests: `HierarchyNameTest` (6 JVM tests, so 17 unit tests in total) and `TypeCqHierarchyRepositoryTest` (7 tests on the real Room
   database; runs in the manual emulator workflow, compiles in the normal one).
6. ADR-004 (UUID ids, epoch-millisecond timestamps, name rules) recorded in docs/.
7. New dependency: lifecycle-viewmodel-compose 2.10.0 (UNCONFIRMED).

Not in this package: rename, delete, reorder, question types, questions, search. Chapter_CQ is untouched.

STATUS: written, NOT compiled, NOT run - UNCONFIRMED (no network where this was prepared).

What to check
- Normal CI: BUILD SUCCESSFUL, unit tests 17 of 17, kspDebugKotlin executed, identityHash unchanged. Room generates the three DAOs;
  if it rejects an INSERT ... SELECT query, the report names the query.
- Emulator workflow (manual, use 20000 rows to be quick): RoomRuntimeTest 11 + TypeCqHierarchyRepositoryTest 7 + ScaleBenchmarkTest 1 = 19.
- On the phone: Home -> Type_CQ -> add a subject, open it, add a chapter, open it, add a topic. Close the app completely and open it
  again: the data must still be there. Try the same name twice (must say it already exists) and a name with extra spaces.

Next (v0.2.22): question types (seed list), then the minimum editor for Type_CQ (text only) with atomic save and the question list
with keyset paging.
