# Version 0.2.6 — fixes from the review report (Fix_txt_file_by_clude.txt)

Changed
- #1: 46 BEFORE INSERT/UPDATE triggers (CheckEmulationTriggers.kt, 2 per table, 23 tables) re-create the 48 canonical
  CHECK clauses that Room @Entity cannot declare. Generated from the canonical SQL; NULL semantics match CHECK.
  Offline fuzz (~124k insert/update operations, SQLite 3.45.1): 0 differences vs the real CHECK constraints.
- #2: both FTS5 tables use `tokenize = "unicode61 tokenchars '...Bengali vowel signs...'"` (SQL file + Kotlin).
  Existing devices keep old FTS tables (IF NOT EXISTS); the app is unpublished so no migration was added.
- #10: FTS update triggers now fire on `UPDATE OF question_id, question_text, short_answer`.
- #3: removed `/app/schemas/*` from .gitignore so Room schema JSON can be committed.
- #6: removed redundant unique index on type_cq_question_category_links.
- #8: removed duplicate SQL copy in app/src/test/resources; tests read ../database via sourceSets.
- Tests: trigger count now 17 + 46; new tests for CHECK emulation and Bengali FTS.

Not done / not verified
- No Gradle/Kotlin build was run (offline). Kotlin and test code are uncompiled; run GitHub Actions.
- Gradle wrapper (#4) not generated: needs `gradle wrapper --gradle-version 8.14.3` on a machine with Gradle.
- Room-generated DB, BundledSQLiteDriver behavior, and an androidTest (#7) are still unverified.
