# Version 0.2.13 - Schema parity test

CI run 14 (package v0.2.11): first verified non-cached run. v0.2.12 build also reported successful by the user.

Added (not yet run in CI): app/src/test/java/com/questionbank/app/RoomSchemaParityTest.kt
- roomSchemaJsonBaselineIsExpected: Room JSON database version 1 and 35 entities.
- roomSchemaJsonMatchesCanonicalSqlStructure: compares committed 1.json with the canonical SQL
  loaded into in-memory SQLite: tables, columns (name, affinity, NOT NULL), primary keys,
  foreign keys (columns, referenced columns, parent table, ON DELETE), indexes (columns, uniqueness).
  A failure lists every difference.
- Known accepted difference: canonical SQL has a plain index on (question_id, position) in
  type_cq_solution_parts and chapter_cq_solution_parts that duplicates UNIQUE(question_id, position);
  Room declares only the unique one. The test ignores a non-unique SQL index that duplicates a unique one.
- Not compared: CHECK clauses, triggers, FTS tables.

Dependency: testImplementation com.google.code.gson:gson:2.11.0 (JSON parsing; org.json is stubbed in Android unit tests).
versionName 0.2.13-schema-parity-test. No main-source changes.

CI run 16 (package v0.2.13): BUILD SUCCESSFUL in 51s, exit code 0, "Using: sh ./gradlew", non-cached.
CanonicalSqlContractTest 5/5 and RoomSchemaParityTest 2/2 passed (7 tests, 0 failures, 0 errors, 0 skipped).

Prototype result: the same comparison logic run offline with Python sqlite3 found 0 differences
after the redundant-index rule. The Kotlin test was compiled and run successfully in CI run 16.
