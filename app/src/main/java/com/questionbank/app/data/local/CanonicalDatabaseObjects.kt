package com.questionbank.app.data.local

/**
 * Idempotent non-entity database objects copied from the canonical SQLite schema v1.2.
 * Room creates the 36 ordinary tables; this list installs both FTS5 virtual tables,
 * all 17 canonical triggers, 46 CHECK-emulation triggers (see CheckEmulationTriggers), and the canonical system paper-category seed.
 */
internal object CanonicalDatabaseObjects {
    private val baseStatements: List<String> = listOf(
        """CREATE VIRTUAL TABLE IF NOT EXISTS type_cq_question_fts USING fts5(question_text, short_answer, tokenize = "unicode61 tokenchars 'ািীুূৃেৈোৌংঃঁ়্'")""",
        """CREATE VIRTUAL TABLE IF NOT EXISTS chapter_cq_question_fts USING fts5(question_text, short_answer, tokenize = "unicode61 tokenchars 'ািীুূৃেৈোৌংঃঁ়্'")""",
        """CREATE TRIGGER IF NOT EXISTS trg_paper_item_source_required_insert
BEFORE INSERT ON paper_question_items
WHEN NEW.type_cq_question_id IS NULL AND NEW.chapter_cq_question_id IS NULL
BEGIN SELECT RAISE(ABORT, 'New paper item must reference exactly one source question'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_type_question_topic_match_insert
BEFORE INSERT ON type_cq_questions
WHEN NEW.stimulus_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM type_cq_stimuli s WHERE s.stimulus_id=NEW.stimulus_id AND s.topic_id=NEW.topic_id)
BEGIN SELECT RAISE(ABORT, 'Type_CQ question topic must match stimulus topic'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_type_question_topic_match_update
BEFORE UPDATE OF stimulus_id, topic_id ON type_cq_questions
WHEN NEW.stimulus_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM type_cq_stimuli s WHERE s.stimulus_id=NEW.stimulus_id AND s.topic_id=NEW.topic_id)
BEGIN SELECT RAISE(ABORT, 'Type_CQ question topic must match stimulus topic'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_type_stimulus_topic_parent_update
BEFORE UPDATE OF topic_id ON type_cq_stimuli
WHEN EXISTS (SELECT 1 FROM type_cq_questions q WHERE q.stimulus_id=OLD.stimulus_id AND q.topic_id<>NEW.topic_id)
BEGIN SELECT RAISE(ABORT, 'Cannot move stimulus to a topic that conflicts with its questions'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chapter_question_chapter_match_insert
BEFORE INSERT ON chapter_cq_questions
WHEN NEW.stimulus_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM chapter_cq_stimuli s WHERE s.stimulus_id=NEW.stimulus_id AND s.chapter_id=NEW.chapter_id)
BEGIN SELECT RAISE(ABORT, 'Chapter_CQ question chapter must match stimulus chapter'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chapter_question_chapter_match_update
BEFORE UPDATE OF stimulus_id, chapter_id ON chapter_cq_questions
WHEN NEW.stimulus_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM chapter_cq_stimuli s WHERE s.stimulus_id=NEW.stimulus_id AND s.chapter_id=NEW.chapter_id)
BEGIN SELECT RAISE(ABORT, 'Chapter_CQ question chapter must match stimulus chapter'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chapter_stimulus_chapter_parent_update
BEFORE UPDATE OF chapter_id ON chapter_cq_stimuli
WHEN EXISTS (SELECT 1 FROM chapter_cq_questions q WHERE q.stimulus_id=OLD.stimulus_id AND q.chapter_id<>NEW.chapter_id)
BEGIN SELECT RAISE(ABORT, 'Cannot move stimulus to a chapter that conflicts with its questions'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_paper_item_section_match_insert
BEFORE INSERT ON paper_question_items
WHEN NEW.section_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM paper_sections s WHERE s.section_id=NEW.section_id AND s.paper_id=NEW.paper_id)
BEGIN SELECT RAISE(ABORT, 'Paper item section must belong to the same paper'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_paper_item_section_match_update
BEFORE UPDATE OF paper_id, section_id ON paper_question_items
WHEN NEW.section_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM paper_sections s WHERE s.section_id=NEW.section_id AND s.paper_id=NEW.paper_id)
BEGIN SELECT RAISE(ABORT, 'Paper item section must belong to the same paper'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_paper_section_parent_update
BEFORE UPDATE OF paper_id ON paper_sections
WHEN EXISTS (SELECT 1 FROM paper_question_items i WHERE i.section_id=OLD.section_id AND i.paper_id<>NEW.paper_id)
BEGIN SELECT RAISE(ABORT, 'Cannot move section while attached items belong to another paper'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_system_paper_category_no_delete
BEFORE DELETE ON paper_categories WHEN OLD.is_system=1
BEGIN SELECT RAISE(ABORT, 'System paper category cannot be deleted'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_type_question_fts_insert AFTER INSERT ON type_cq_questions BEGIN
 INSERT INTO type_cq_question_fts(rowid, question_text, short_answer) VALUES (NEW.fts_id, NEW.question_text, NEW.short_answer);
END""",
        """CREATE TRIGGER IF NOT EXISTS trg_type_question_fts_update AFTER UPDATE OF fts_id, question_text, short_answer ON type_cq_questions BEGIN
 DELETE FROM type_cq_question_fts WHERE rowid=OLD.fts_id;
 INSERT INTO type_cq_question_fts(rowid, question_text, short_answer) VALUES (NEW.fts_id, NEW.question_text, NEW.short_answer);
END""",
        """CREATE TRIGGER IF NOT EXISTS trg_type_question_fts_delete AFTER DELETE ON type_cq_questions BEGIN
 DELETE FROM type_cq_question_fts WHERE rowid=OLD.fts_id;
END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chapter_question_fts_insert AFTER INSERT ON chapter_cq_questions BEGIN
 INSERT INTO chapter_cq_question_fts(rowid, question_text, short_answer) VALUES (NEW.fts_id, NEW.question_text, NEW.short_answer);
END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chapter_question_fts_update AFTER UPDATE OF fts_id, question_text, short_answer ON chapter_cq_questions BEGIN
 DELETE FROM chapter_cq_question_fts WHERE rowid=OLD.fts_id;
 INSERT INTO chapter_cq_question_fts(rowid, question_text, short_answer) VALUES (NEW.fts_id, NEW.question_text, NEW.short_answer);
END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chapter_question_fts_delete AFTER DELETE ON chapter_cq_questions BEGIN
 DELETE FROM chapter_cq_question_fts WHERE rowid=OLD.fts_id;
END""",
    )

    /**
     * Idempotent repair run whenever the database is opened (including after a restored backup).
     * A legacy/imported row using either known spelling of the uncategorized name is adopted as the permanent system row when possible;
     * any additional spelling variants are merged into it before the unique name is normalized.
     */
    val uncategorizedRepairStatements: List<String> = listOf(
        """UPDATE paper_categories
           SET paper_category_id = 'system_uncategorized', name = 'অশ্রেণিবদ্ধ',
               description = CASE WHEN trim(description) = '' THEN 'সিস্টেমের ডিফল্ট ক্যাটাগরি' ELSE description END,
               sort_order = 0, is_system = 1
           WHERE paper_category_id = (
               SELECT paper_category_id FROM paper_categories
               WHERE trim(name) IN ('অশ্রেণিবদ্ধ', 'অশ্রেণীবদ্ধ') AND paper_category_id <> 'system_uncategorized'
               ORDER BY CASE
                          WHEN name = 'অশ্রেণিবদ্ধ' THEN 0
                          WHEN name = 'অশ্রেণীবদ্ধ' THEN 1
                          ELSE 2
                        END,
                        is_system DESC, sort_order, created_at, paper_category_id LIMIT 1
           )
           AND NOT EXISTS (SELECT 1 FROM paper_categories WHERE paper_category_id = 'system_uncategorized')""",
        """INSERT OR IGNORE INTO paper_categories
           (paper_category_id, name, description, color, icon, sort_order, is_system, created_at, updated_at)
           VALUES ('system_uncategorized', 'অশ্রেণিবদ্ধ', 'সিস্টেমের ডিফল্ট ক্যাটাগরি', '', '', 0, 1, 0, 0)""",
        """UPDATE papers SET paper_category_id = 'system_uncategorized'
           WHERE paper_category_id IN (
             SELECT paper_category_id FROM paper_categories
             WHERE trim(name) IN ('অশ্রেণিবদ্ধ', 'অশ্রেণীবদ্ধ') AND paper_category_id <> 'system_uncategorized'
           )""",
        """UPDATE paper_categories SET is_system = 0
           WHERE paper_category_id <> 'system_uncategorized' AND trim(name) IN ('অশ্রেণিবদ্ধ', 'অশ্রেণীবদ্ধ')""",
        """DELETE FROM paper_categories
           WHERE paper_category_id <> 'system_uncategorized' AND trim(name) IN ('অশ্রেণিবদ্ধ', 'অশ্রেণীবদ্ধ')""",
        """UPDATE paper_categories
           SET name = 'অশ্রেণিবদ্ধ', description = 'সিস্টেমের ডিফল্ট ক্যাটাগরি',
               sort_order = 0, is_system = 1
           WHERE paper_category_id = 'system_uncategorized'""",
    )

    /** Base objects plus triggers, CHECK emulation and restore-safe singleton repair. */
    val statements: List<String> = baseStatements + CheckEmulationTriggers.statements + uncategorizedRepairStatements
}
