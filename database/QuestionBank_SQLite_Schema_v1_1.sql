-- QuestionBank SQLite Schema Draft v1.1
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
CREATE TABLE IF NOT EXISTS app_metadata ( key TEXT PRIMARY KEY NOT NULL, value_json TEXT NOT NULL, updated_at INTEGER NOT NULL );
CREATE TABLE IF NOT EXISTS schema_migrations ( version INTEGER PRIMARY KEY NOT NULL, description TEXT NOT NULL, applied_at INTEGER NOT NULL );
CREATE TABLE IF NOT EXISTS operation_journal ( operation_id TEXT PRIMARY KEY NOT NULL, operation_type TEXT NOT NULL, scope TEXT NOT NULL CHECK (scope IN ('TYPE_CQ','CHAPTER_CQ','GLOBAL')), payload_json TEXT NOT NULL, status TEXT NOT NULL CHECK ( status IN ('PENDING','RUNNING','COMMITTED','FAILED','CANCELLED') ), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL );
CREATE INDEX IF NOT EXISTS idx_operation_journal_status ON operation_journal(status, updated_at);
CREATE TABLE IF NOT EXISTS board_catalog (
 board_id TEXT PRIMARY KEY NOT NULL,
 code TEXT NOT NULL UNIQUE,
 display_name TEXT NOT NULL,
 board_kind TEXT NOT NULL CHECK (board_kind IN ('BUILTIN','CUSTOM')),
 is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0,1)),
 sort_order INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS type_cq_subjects ( subject_id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL );
CREATE UNIQUE INDEX IF NOT EXISTS uq_type_cq_subject_name ON type_cq_subjects(name);
CREATE TABLE IF NOT EXISTS type_cq_chapters ( chapter_id TEXT PRIMARY KEY NOT NULL, subject_id TEXT NOT NULL, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(subject_id) REFERENCES type_cq_subjects(subject_id) ON UPDATE CASCADE ON DELETE RESTRICT );
CREATE INDEX IF NOT EXISTS idx_type_cq_chapters_subject ON type_cq_chapters(subject_id, sort_order);
CREATE TABLE IF NOT EXISTS type_cq_topics ( topic_id TEXT PRIMARY KEY NOT NULL, chapter_id TEXT NOT NULL, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(chapter_id) REFERENCES type_cq_chapters(chapter_id) ON UPDATE CASCADE ON DELETE RESTRICT );
CREATE INDEX IF NOT EXISTS idx_type_cq_topics_chapter ON type_cq_topics(chapter_id, sort_order);
CREATE TABLE IF NOT EXISTS type_cq_question_types ( question_type_id TEXT PRIMARY KEY NOT NULL, code TEXT NOT NULL UNIQUE, label TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)) );
CREATE TABLE IF NOT EXISTS type_cq_stimuli ( stimulus_id TEXT PRIMARY KEY NOT NULL, topic_id TEXT NOT NULL, stimulus_text TEXT NOT NULL DEFAULT '', rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5), reference_text TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(topic_id) REFERENCES type_cq_topics(topic_id) ON UPDATE CASCADE ON DELETE RESTRICT );
CREATE INDEX IF NOT EXISTS idx_type_cq_stimuli_topic ON type_cq_stimuli(topic_id, updated_at);
CREATE TABLE IF NOT EXISTS type_cq_questions ( question_id TEXT PRIMARY KEY NOT NULL, stimulus_id TEXT, topic_id TEXT NOT NULL, question_type_id TEXT NOT NULL, subquestion_label TEXT NOT NULL CHECK (subquestion_label IN ('ক','খ','গ','ঘ')), marks REAL NOT NULL CHECK (marks > 0), question_text TEXT NOT NULL DEFAULT '', short_answer TEXT NOT NULL DEFAULT '', rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5), sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(stimulus_id) REFERENCES type_cq_stimuli(stimulus_id) ON UPDATE CASCADE ON DELETE RESTRICT, FOREIGN KEY(topic_id) REFERENCES type_cq_topics(topic_id) ON UPDATE CASCADE ON DELETE RESTRICT, FOREIGN KEY(question_type_id) REFERENCES type_cq_question_types(question_type_id) ON UPDATE CASCADE ON DELETE RESTRICT );
CREATE INDEX IF NOT EXISTS idx_type_cq_questions_topic ON type_cq_questions(topic_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_type_cq_questions_stimulus ON type_cq_questions(stimulus_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_type_cq_questions_type ON type_cq_questions(question_type_id, sort_order);
CREATE TABLE IF NOT EXISTS type_cq_stimulus_boards ( id TEXT PRIMARY KEY NOT NULL, stimulus_id TEXT NOT NULL, board_code TEXT NOT NULL, year INTEGER NOT NULL CHECK (year BETWEEN 1900 AND 2200), sort_order INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(stimulus_id) REFERENCES type_cq_stimuli(stimulus_id) ON UPDATE CASCADE ON DELETE CASCADE, FOREIGN KEY(board_code) REFERENCES board_catalog(code) ON UPDATE CASCADE ON DELETE RESTRICT, UNIQUE(stimulus_id, board_code, year) );
CREATE TABLE IF NOT EXISTS type_cq_question_boards ( id TEXT PRIMARY KEY NOT NULL, question_id TEXT NOT NULL, board_code TEXT NOT NULL, year INTEGER NOT NULL CHECK (year BETWEEN 1900 AND 2200), sort_order INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(question_id) REFERENCES type_cq_questions(question_id) ON UPDATE CASCADE ON DELETE CASCADE, FOREIGN KEY(board_code) REFERENCES board_catalog(code) ON UPDATE CASCADE ON DELETE RESTRICT, UNIQUE(question_id, board_code, year) );
CREATE INDEX IF NOT EXISTS idx_type_cq_stimulus_board_year ON type_cq_stimulus_boards(board_code, year);
CREATE INDEX IF NOT EXISTS idx_type_cq_question_board_year ON type_cq_question_boards(board_code, year);
CREATE TABLE IF NOT EXISTS type_cq_question_categories ( category_id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0, is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0,1)), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL );
CREATE UNIQUE INDEX IF NOT EXISTS uq_type_cq_category_name ON type_cq_question_categories(name);
CREATE TABLE IF NOT EXISTS type_cq_question_category_links ( question_id TEXT NOT NULL, category_id TEXT NOT NULL, assigned_at INTEGER NOT NULL, PRIMARY KEY(question_id, category_id), FOREIGN KEY(question_id) REFERENCES type_cq_questions(question_id) ON UPDATE CASCADE ON DELETE CASCADE, FOREIGN KEY(category_id) REFERENCES type_cq_question_categories(category_id) ON UPDATE CASCADE ON DELETE RESTRICT );
CREATE INDEX IF NOT EXISTS idx_type_cq_category_links_category ON type_cq_question_category_links(category_id, question_id);
CREATE TABLE IF NOT EXISTS type_cq_images ( image_id TEXT PRIMARY KEY NOT NULL, relative_path TEXT NOT NULL UNIQUE CHECK (length(relative_path) > 0 AND substr(relative_path,1,1) <> '/' AND instr(relative_path,'..') = 0 AND instr(relative_path,char(92)) = 0), original_name TEXT NOT NULL DEFAULT '', stored_name TEXT NOT NULL, mime_type TEXT NOT NULL CHECK (length(trim(mime_type)) > 0), width INTEGER NOT NULL CHECK (width > 0), height INTEGER NOT NULL CHECK (height > 0), byte_size INTEGER NOT NULL CHECK (byte_size >= 0), sha256 TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'), processing_status TEXT NOT NULL DEFAULT 'READY' CHECK (processing_status IN ('PENDING','READY','MISSING','CORRUPT')), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL );
CREATE TABLE IF NOT EXISTS type_cq_stimulus_images ( stimulus_id TEXT NOT NULL, image_id TEXT NOT NULL, position INTEGER NOT NULL, placement TEXT NOT NULL CHECK (placement IN ('TOP','BOTTOM')), PRIMARY KEY(stimulus_id, image_id), UNIQUE(stimulus_id, position), FOREIGN KEY(stimulus_id) REFERENCES type_cq_stimuli(stimulus_id) ON UPDATE CASCADE ON DELETE CASCADE, FOREIGN KEY(image_id) REFERENCES type_cq_images(image_id) ON UPDATE CASCADE ON DELETE RESTRICT );
CREATE INDEX IF NOT EXISTS idx_type_cq_stimulus_images_order ON type_cq_stimulus_images(stimulus_id, placement, position);
CREATE TABLE IF NOT EXISTS type_cq_solution_parts ( part_id TEXT PRIMARY KEY NOT NULL, question_id TEXT NOT NULL, position INTEGER NOT NULL, part_type TEXT NOT NULL CHECK (part_type IN ('TEXT','IMAGE')), text_content TEXT, image_id TEXT, created_at INTEGER NOT NULL, CHECK ( (part_type = 'TEXT' AND text_content IS NOT NULL AND image_id IS NULL) OR (part_type = 'IMAGE' AND image_id IS NOT NULL AND text_content IS NULL) ), UNIQUE(question_id, position), FOREIGN KEY(question_id) REFERENCES type_cq_questions(question_id) ON UPDATE CASCADE ON DELETE CASCADE, FOREIGN KEY(image_id) REFERENCES type_cq_images(image_id) ON UPDATE CASCADE ON DELETE RESTRICT );
CREATE INDEX IF NOT EXISTS idx_type_cq_solution_parts_order ON type_cq_solution_parts(question_id, position);
CREATE TABLE IF NOT EXISTS chapter_cq_subjects ( subject_id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL );
CREATE UNIQUE INDEX IF NOT EXISTS uq_chapter_cq_subject_name ON chapter_cq_subjects(name);
CREATE TABLE IF NOT EXISTS chapter_cq_chapters ( chapter_id TEXT PRIMARY KEY NOT NULL, subject_id TEXT NOT NULL, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(subject_id) REFERENCES chapter_cq_subjects(subject_id) ON UPDATE CASCADE ON DELETE RESTRICT );
CREATE INDEX IF NOT EXISTS idx_chapter_cq_chapters_subject ON chapter_cq_chapters(subject_id, sort_order);
CREATE TABLE IF NOT EXISTS chapter_cq_stimuli ( stimulus_id TEXT PRIMARY KEY NOT NULL, chapter_id TEXT NOT NULL, stimulus_text TEXT NOT NULL DEFAULT '', rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5), reference_text TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(chapter_id) REFERENCES chapter_cq_chapters(chapter_id) ON UPDATE CASCADE ON DELETE RESTRICT );
CREATE TABLE IF NOT EXISTS chapter_cq_questions ( question_id TEXT PRIMARY KEY NOT NULL, stimulus_id TEXT, chapter_id TEXT NOT NULL, subquestion_label TEXT NOT NULL CHECK (subquestion_label IN ('ক','খ','গ','ঘ')), marks REAL NOT NULL CHECK (marks > 0), question_text TEXT NOT NULL DEFAULT '', short_answer TEXT NOT NULL DEFAULT '', rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5), sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(stimulus_id) REFERENCES chapter_cq_stimuli(stimulus_id) ON UPDATE CASCADE ON DELETE RESTRICT, FOREIGN KEY(chapter_id) REFERENCES chapter_cq_chapters(chapter_id) ON UPDATE CASCADE ON DELETE RESTRICT );
CREATE INDEX IF NOT EXISTS idx_chapter_cq_stimuli_chapter ON chapter_cq_stimuli(chapter_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_chapter_cq_questions_chapter ON chapter_cq_questions(chapter_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_chapter_cq_questions_stimulus ON chapter_cq_questions(stimulus_id, sort_order);
CREATE TABLE IF NOT EXISTS chapter_cq_stimulus_boards ( id TEXT PRIMARY KEY NOT NULL, stimulus_id TEXT NOT NULL, board_code TEXT NOT NULL, year INTEGER NOT NULL CHECK (year BETWEEN 1900 AND 2200), sort_order INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(stimulus_id) REFERENCES chapter_cq_stimuli(stimulus_id) ON UPDATE CASCADE ON DELETE CASCADE, FOREIGN KEY(board_code) REFERENCES board_catalog(code) ON UPDATE CASCADE ON DELETE RESTRICT, UNIQUE(stimulus_id, board_code, year) );
CREATE TABLE IF NOT EXISTS chapter_cq_question_boards ( id TEXT PRIMARY KEY NOT NULL, question_id TEXT NOT NULL, board_code TEXT NOT NULL, year INTEGER NOT NULL CHECK (year BETWEEN 1900 AND 2200), sort_order INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(question_id) REFERENCES chapter_cq_questions(question_id) ON UPDATE CASCADE ON DELETE CASCADE, FOREIGN KEY(board_code) REFERENCES board_catalog(code) ON UPDATE CASCADE ON DELETE RESTRICT, UNIQUE(question_id, board_code, year) );
CREATE TABLE IF NOT EXISTS chapter_cq_question_categories ( category_id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0, is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0,1)), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL );
CREATE UNIQUE INDEX IF NOT EXISTS uq_chapter_cq_category_name ON chapter_cq_question_categories(name);
CREATE TABLE IF NOT EXISTS chapter_cq_question_category_links ( question_id TEXT NOT NULL, category_id TEXT NOT NULL, assigned_at INTEGER NOT NULL, PRIMARY KEY(question_id, category_id), FOREIGN KEY(question_id) REFERENCES chapter_cq_questions(question_id) ON UPDATE CASCADE ON DELETE CASCADE, FOREIGN KEY(category_id) REFERENCES chapter_cq_question_categories(category_id) ON UPDATE CASCADE ON DELETE RESTRICT );
CREATE TABLE IF NOT EXISTS chapter_cq_images ( image_id TEXT PRIMARY KEY NOT NULL, relative_path TEXT NOT NULL UNIQUE CHECK (length(relative_path) > 0 AND substr(relative_path,1,1) <> '/' AND instr(relative_path,'..') = 0 AND instr(relative_path,char(92)) = 0), original_name TEXT NOT NULL DEFAULT '', stored_name TEXT NOT NULL, mime_type TEXT NOT NULL CHECK (length(trim(mime_type)) > 0), width INTEGER NOT NULL CHECK (width > 0), height INTEGER NOT NULL CHECK (height > 0), byte_size INTEGER NOT NULL CHECK (byte_size >= 0), sha256 TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'), processing_status TEXT NOT NULL DEFAULT 'READY' CHECK (processing_status IN ('PENDING','READY','MISSING','CORRUPT')), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL );
CREATE TABLE IF NOT EXISTS chapter_cq_stimulus_images ( stimulus_id TEXT NOT NULL, image_id TEXT NOT NULL, position INTEGER NOT NULL, placement TEXT NOT NULL CHECK (placement IN ('TOP','BOTTOM')), PRIMARY KEY(stimulus_id, image_id), UNIQUE(stimulus_id, position), FOREIGN KEY(stimulus_id) REFERENCES chapter_cq_stimuli(stimulus_id) ON UPDATE CASCADE ON DELETE CASCADE, FOREIGN KEY(image_id) REFERENCES chapter_cq_images(image_id) ON UPDATE CASCADE ON DELETE RESTRICT );
CREATE TABLE IF NOT EXISTS chapter_cq_solution_parts ( part_id TEXT PRIMARY KEY NOT NULL, question_id TEXT NOT NULL, position INTEGER NOT NULL, part_type TEXT NOT NULL CHECK (part_type IN ('TEXT','IMAGE')), text_content TEXT, image_id TEXT, created_at INTEGER NOT NULL, CHECK ( (part_type = 'TEXT' AND text_content IS NOT NULL AND image_id IS NULL) OR (part_type = 'IMAGE' AND image_id IS NOT NULL AND text_content IS NULL) ), UNIQUE(question_id, position), FOREIGN KEY(question_id) REFERENCES chapter_cq_questions(question_id) ON UPDATE CASCADE ON DELETE CASCADE, FOREIGN KEY(image_id) REFERENCES chapter_cq_images(image_id) ON UPDATE CASCADE ON DELETE RESTRICT );
CREATE INDEX IF NOT EXISTS idx_chapter_cq_solution_parts_order ON chapter_cq_solution_parts(question_id, position);
CREATE TABLE IF NOT EXISTS paper_categories ( paper_category_id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL UNIQUE, description TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0, is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0,1)), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL );
CREATE TABLE IF NOT EXISTS papers ( paper_id TEXT PRIMARY KEY NOT NULL, paper_category_id TEXT NOT NULL, short_name TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, subject_line TEXT NOT NULL DEFAULT '', duration_text TEXT NOT NULL DEFAULT '', total_marks REAL, note_text TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(paper_category_id) REFERENCES paper_categories(paper_category_id) ON UPDATE CASCADE ON DELETE RESTRICT );
CREATE INDEX IF NOT EXISTS idx_papers_category_order ON papers(paper_category_id, sort_order);
CREATE TABLE IF NOT EXISTS paper_sections ( section_id TEXT PRIMARY KEY NOT NULL, paper_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(paper_id) REFERENCES papers(paper_id) ON UPDATE CASCADE ON DELETE CASCADE );
CREATE TABLE IF NOT EXISTS paper_question_items ( item_id TEXT PRIMARY KEY NOT NULL, paper_id TEXT NOT NULL, section_id TEXT, type_cq_question_id TEXT, chapter_cq_question_id TEXT, snapshot_json TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, marks_override REAL, created_at INTEGER NOT NULL, CHECK (NOT (type_cq_question_id IS NOT NULL AND chapter_cq_question_id IS NOT NULL)), FOREIGN KEY(paper_id) REFERENCES papers(paper_id) ON UPDATE CASCADE ON DELETE CASCADE, FOREIGN KEY(section_id) REFERENCES paper_sections(section_id) ON UPDATE CASCADE ON DELETE SET NULL, FOREIGN KEY(type_cq_question_id) REFERENCES type_cq_questions(question_id) ON UPDATE CASCADE ON DELETE SET NULL, FOREIGN KEY(chapter_cq_question_id) REFERENCES chapter_cq_questions(question_id) ON UPDATE CASCADE ON DELETE SET NULL );
CREATE INDEX IF NOT EXISTS idx_paper_items_paper_order ON paper_question_items(paper_id, sort_order);
CREATE TABLE IF NOT EXISTS paper_item_overrides ( item_id TEXT PRIMARY KEY NOT NULL, question_text_override TEXT, stimulus_text_override TEXT, short_answer_override TEXT, solution_json_override TEXT, marks_override REAL, updated_at INTEGER NOT NULL, FOREIGN KEY(item_id) REFERENCES paper_question_items(item_id) ON UPDATE CASCADE ON DELETE CASCADE );
CREATE TABLE IF NOT EXISTS paper_images ( paper_image_id TEXT PRIMARY KEY NOT NULL, relative_path TEXT NOT NULL UNIQUE CHECK (length(relative_path) > 0 AND substr(relative_path,1,1) <> '/' AND instr(relative_path,'..') = 0 AND instr(relative_path,char(92)) = 0), mime_type TEXT NOT NULL CHECK (length(trim(mime_type)) > 0), width INTEGER NOT NULL CHECK (width > 0), height INTEGER NOT NULL CHECK (height > 0), byte_size INTEGER NOT NULL CHECK (byte_size >= 0), sha256 TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'), created_at INTEGER NOT NULL );
CREATE TABLE IF NOT EXISTS paper_item_images ( item_id TEXT NOT NULL, paper_image_id TEXT NOT NULL, position INTEGER NOT NULL, placement TEXT NOT NULL CHECK (placement IN ('STIMULUS_TOP','STIMULUS_BOTTOM','SOLUTION')), PRIMARY KEY(item_id, paper_image_id), UNIQUE(item_id, position), FOREIGN KEY(item_id) REFERENCES paper_question_items(item_id) ON UPDATE CASCADE ON DELETE CASCADE, FOREIGN KEY(paper_image_id) REFERENCES paper_images(paper_image_id) ON UPDATE CASCADE ON DELETE RESTRICT );
CREATE VIRTUAL TABLE IF NOT EXISTS type_cq_question_fts USING fts5(question_id UNINDEXED, question_text, short_answer, tokenize = "unicode61 tokenchars 'ািীুূৃেৈোৌংঃঁ়্'");
CREATE VIRTUAL TABLE IF NOT EXISTS chapter_cq_question_fts USING fts5(question_id UNINDEXED, question_text, short_answer, tokenize = "unicode61 tokenchars 'ািীুূৃেৈোৌংঃঁ়্'");
INSERT OR IGNORE INTO paper_categories (paper_category_id, name, description, color, icon, sort_order, is_system, created_at, updated_at) VALUES ('system_uncategorized', 'অশ্রেণিবদ্ধ', 'সিস্টেমের ডিফল্ট ক্যাটাগরি', '', '', 0, 1, 0, 0);
CREATE TRIGGER IF NOT EXISTS trg_paper_item_source_required_insert
BEFORE INSERT ON paper_question_items
WHEN NEW.type_cq_question_id IS NULL AND NEW.chapter_cq_question_id IS NULL
BEGIN SELECT RAISE(ABORT, 'New paper item must reference exactly one source question'); END;
CREATE TRIGGER IF NOT EXISTS trg_type_question_topic_match_insert
BEFORE INSERT ON type_cq_questions
WHEN NEW.stimulus_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM type_cq_stimuli s WHERE s.stimulus_id=NEW.stimulus_id AND s.topic_id=NEW.topic_id)
BEGIN SELECT RAISE(ABORT, 'Type_CQ question topic must match stimulus topic'); END;
CREATE TRIGGER IF NOT EXISTS trg_type_question_topic_match_update
BEFORE UPDATE OF stimulus_id, topic_id ON type_cq_questions
WHEN NEW.stimulus_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM type_cq_stimuli s WHERE s.stimulus_id=NEW.stimulus_id AND s.topic_id=NEW.topic_id)
BEGIN SELECT RAISE(ABORT, 'Type_CQ question topic must match stimulus topic'); END;
CREATE TRIGGER IF NOT EXISTS trg_type_stimulus_topic_parent_update
BEFORE UPDATE OF topic_id ON type_cq_stimuli
WHEN EXISTS (SELECT 1 FROM type_cq_questions q WHERE q.stimulus_id=OLD.stimulus_id AND q.topic_id<>NEW.topic_id)
BEGIN SELECT RAISE(ABORT, 'Cannot move stimulus to a topic that conflicts with its questions'); END;
CREATE TRIGGER IF NOT EXISTS trg_chapter_question_chapter_match_insert
BEFORE INSERT ON chapter_cq_questions
WHEN NEW.stimulus_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM chapter_cq_stimuli s WHERE s.stimulus_id=NEW.stimulus_id AND s.chapter_id=NEW.chapter_id)
BEGIN SELECT RAISE(ABORT, 'Chapter_CQ question chapter must match stimulus chapter'); END;
CREATE TRIGGER IF NOT EXISTS trg_chapter_question_chapter_match_update
BEFORE UPDATE OF stimulus_id, chapter_id ON chapter_cq_questions
WHEN NEW.stimulus_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM chapter_cq_stimuli s WHERE s.stimulus_id=NEW.stimulus_id AND s.chapter_id=NEW.chapter_id)
BEGIN SELECT RAISE(ABORT, 'Chapter_CQ question chapter must match stimulus chapter'); END;
CREATE TRIGGER IF NOT EXISTS trg_chapter_stimulus_chapter_parent_update
BEFORE UPDATE OF chapter_id ON chapter_cq_stimuli
WHEN EXISTS (SELECT 1 FROM chapter_cq_questions q WHERE q.stimulus_id=OLD.stimulus_id AND q.chapter_id<>NEW.chapter_id)
BEGIN SELECT RAISE(ABORT, 'Cannot move stimulus to a chapter that conflicts with its questions'); END;
CREATE TRIGGER IF NOT EXISTS trg_paper_item_section_match_insert
BEFORE INSERT ON paper_question_items
WHEN NEW.section_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM paper_sections s WHERE s.section_id=NEW.section_id AND s.paper_id=NEW.paper_id)
BEGIN SELECT RAISE(ABORT, 'Paper item section must belong to the same paper'); END;
CREATE TRIGGER IF NOT EXISTS trg_paper_item_section_match_update
BEFORE UPDATE OF paper_id, section_id ON paper_question_items
WHEN NEW.section_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM paper_sections s WHERE s.section_id=NEW.section_id AND s.paper_id=NEW.paper_id)
BEGIN SELECT RAISE(ABORT, 'Paper item section must belong to the same paper'); END;
CREATE TRIGGER IF NOT EXISTS trg_paper_section_parent_update
BEFORE UPDATE OF paper_id ON paper_sections
WHEN EXISTS (SELECT 1 FROM paper_question_items i WHERE i.section_id=OLD.section_id AND i.paper_id<>NEW.paper_id)
BEGIN SELECT RAISE(ABORT, 'Cannot move section while attached items belong to another paper'); END;
CREATE TRIGGER IF NOT EXISTS trg_system_paper_category_no_delete
BEFORE DELETE ON paper_categories WHEN OLD.is_system=1
BEGIN SELECT RAISE(ABORT, 'System paper category cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS trg_type_question_fts_insert AFTER INSERT ON type_cq_questions BEGIN
 INSERT INTO type_cq_question_fts(question_id, question_text, short_answer) VALUES (NEW.question_id, NEW.question_text, NEW.short_answer);
END;
CREATE TRIGGER IF NOT EXISTS trg_type_question_fts_update AFTER UPDATE OF question_id, question_text, short_answer ON type_cq_questions BEGIN
 DELETE FROM type_cq_question_fts WHERE question_id=OLD.question_id;
 INSERT INTO type_cq_question_fts(question_id, question_text, short_answer) VALUES (NEW.question_id, NEW.question_text, NEW.short_answer);
END;
CREATE TRIGGER IF NOT EXISTS trg_type_question_fts_delete AFTER DELETE ON type_cq_questions BEGIN
 DELETE FROM type_cq_question_fts WHERE question_id=OLD.question_id;
END;
CREATE TRIGGER IF NOT EXISTS trg_chapter_question_fts_insert AFTER INSERT ON chapter_cq_questions BEGIN
 INSERT INTO chapter_cq_question_fts(question_id, question_text, short_answer) VALUES (NEW.question_id, NEW.question_text, NEW.short_answer);
END;
CREATE TRIGGER IF NOT EXISTS trg_chapter_question_fts_update AFTER UPDATE OF question_id, question_text, short_answer ON chapter_cq_questions BEGIN
 DELETE FROM chapter_cq_question_fts WHERE question_id=OLD.question_id;
 INSERT INTO chapter_cq_question_fts(question_id, question_text, short_answer) VALUES (NEW.question_id, NEW.question_text, NEW.short_answer);
END;
CREATE TRIGGER IF NOT EXISTS trg_chapter_question_fts_delete AFTER DELETE ON chapter_cq_questions BEGIN
 DELETE FROM chapter_cq_question_fts WHERE question_id=OLD.question_id;
END;
