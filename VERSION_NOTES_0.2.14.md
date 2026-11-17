# Version 0.2.14 - FK indexes, redundant index removed, explicit WAL

Context: the user plans several hundred thousand questions plus solutions and images.

CI run 16 (package v0.2.13): BUILD SUCCESSFUL, 7/7 tests passed.

Changes:
1. Canonical SQL (database/QuestionBank_SQLite_Schema_v1_1.sql):
   - Removed redundant idx_type_cq_solution_parts_order and idx_chapter_cq_solution_parts_order
     (duplicates of UNIQUE(question_id, position)).
   - Added 12 indexes so every foreign key has a covering index (previously 12 were uncovered):
     paper_sections(paper_id); paper_question_items(chapter_cq_question_id | type_cq_question_id | section_id);
     paper_item_images(paper_image_id); type/chapter solution_parts(image_id);
     type/chapter stimulus_images(image_id); chapter question_boards and stimulus_boards(board_code, year);
     chapter_cq_question_category_links(category_id, question_id).
2. Room entities: matching @Index declarations on 10 entity files (same indexes as the SQL).
3. RoomSchemaParityTest is now strict (no accepted index difference).
4. QuestionBankDatabase.create(): explicit setJournalMode(WRITE_AHEAD_LOGGING).
   NOTE: not compiled locally. If the build fails on this line, send the CI report.
5. versionName 0.2.14-fk-indexes-wal. Database version stays 1 (no released app yet, so no migration).

IMPORTANT: app/schemas/.../1.json in this package is the OLD export (v0.2.12). Room regenerates it
during the CI build, and the parity test reads the regenerated file. After the CI run, download
QuestionBank-ci-report and replace app/schemas/.../1.json in the repository with the new one.

Offline check (Python sqlite3 prototype): strict index comparison 0 differences; uncovered foreign keys 0.
