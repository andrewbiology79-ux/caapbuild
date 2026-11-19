# Phase 4 data-layer implementation notes

Base package: `QuestionBank_v0_2_30c3` (plan baseline `PROJECT_PLAN_v1_45_UPDATED.txt`). Current state: WIP2 (plan v1.47).

## Added in this working package

- `SharedDataDao`: shared board catalog, app metadata, operation journal, paper/category/section/item/image access, and transactional paper snapshot insertion.
- `TypeCqReferenceDao`: Type_CQ-only question type, stimulus, question, category, board/category link, solution-part and stimulus-image reads/writes; editor projection; ordered queries.
- `ChapterCqDataDao`: Chapter_CQ-only subject/chapter/stimulus/question operations; editor projection; transaction-safe insert/update and relationship replacement; FTS ID allocation and per-chapter ordering.
- `CategoryDataDao`: Type_CQ and Chapter_CQ category reassignment + archive transactions, kept separate by scope.
- `MediaDataDao`: separate Type_CQ / Chapter_CQ image metadata access; filesystem operations remain outside Room transactions.
- Repository interfaces/implementations for Type_CQ reference data, Chapter_CQ questions, papers, categories, media and editor drafts; wired through the existing manual `AppContainer`.
- Domain use cases for draft validation, Type_CQ and Chapter_CQ save paths, duplicate checks, category assignment, board/year replacement, solution-part ordering and paper snapshots.
- JVM tests for editor-draft validation and Android instrumentation tests for Chapter_CQ FTS allocation, invalid chapter references and Type_CQ / Chapter_CQ write isolation.

## Safety and compatibility

- No Room entity, table, column, migration or database-version change was intended. Existing schema remains version 1 with 35 entities and expected identity hash `786b471dfa14c9ae4739bb81479bab25`.
- New observable collections use `Flow`; one-shot lookups use `suspend`; ordered queries have explicit `ORDER BY` clauses.
- Relationship replacement and paper snapshot insertion run in Room transactions. Chapter_CQ saves preserve an existing question ID, FTS ID, creation timestamp and sort position on edit; new rows allocate a scope-local FTS ID.
- Type_CQ and Chapter_CQ data DAOs do not cross-read or cross-write each other's question tables. Shared paper logic only checks a source row's existence before storing an immutable snapshot.
- The app continues to use the existing manual dependency container; no second DI framework was introduced.

## Verification status

- SQLite validation: 87 DAO `@Query` statements (24 + 23 + 26 + 8 + 6) were checked against `database/QuestionBank_SQLite_Schema_v1_1.sql` with SQLite `EXPLAIN`; 0 SQL errors (WIP2 corrects the earlier "85 / 77" wording). The seed SQL of the WIP2 tests was also executed against the schema (OK). This is not a Room/KSP compile.
- Gradle / KSP / JVM tests / Android instrumentation: **NOT RUN** in this environment. `./gradlew --offline testDebugUnitTest` still attempted to download Gradle 8.14.3 and failed with `UnknownHostException: services.gradle.org`. Therefore Kotlin compilation, Room KSP validation, test outcomes and generated schema identity remain unconfirmed.
- Phase 4 is **IN PROGRESS, not closed** until CI compiles the package, all JVM and emulator tests pass, and the owner completes a device smoke check. The previous Run #47 (142 unit / 99 emulator) belongs to the unmodified baseline and is not evidence for this package.

## WIP2 additions (plan v1.47, section 56)

- `EditorWorkflowUseCasesTest` (JVM, 8 tests, in-memory fakes): solution-part renumbering and rejection, category / board-link ownership checks, scope routing, duplicate check scope, paper snapshot rules, draft scope separation.
- `SharedCategoryPaperRepositoryTest` (emulator, 4 tests): editor-draft round trip, category reassign + archive with Chapter_CQ untouched, reassign rejection, paper snapshot accept / reject of invalid references.
- Housekeeping: stale `PROJECT_PLAN_v1_44_UPDATED.txt` removed; four empty folders removed; notes corrected.
- DAO layout decision recorded in plan section 56.2: five consolidated DAOs instead of one DAO per table.
- NOT changed: domain-model mapping (Room entities still cross the repository boundary), draft-format reconciliation, TypeCq / Media repository tests. See plan 56.4.
