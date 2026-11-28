package com.questionbank.app.data.local

/**
 * Room's @Entity cannot declare SQL CHECK constraints, so the 48 CHECK clauses of the canonical
 * schema (database/QuestionBank_SQLite_Schema_v1_2.sql) would be missing from the real database.
 * These BEFORE INSERT / BEFORE UPDATE triggers (2 per table, 23 tables) re-create them.
 * Semantics match CHECK: a row is rejected only when an expression evaluates to false (0);
 * NULL results pass. Generated from the canonical SQL - regenerate if a CHECK changes.
 */
internal object CheckEmulationTriggers {
    val statements: List<String> = listOf(
        """CREATE TRIGGER IF NOT EXISTS trg_chk_operation_journal_insert
BEFORE INSERT ON operation_journal
WHEN (SELECT (scope IN ('TYPE_CQ','CHAPTER_CQ','GLOBAL')) IS 0 OR (status IN ('PENDING','RUNNING','COMMITTED','FAILED','CANCELLED')) IS 0 FROM (SELECT NEW.operation_id AS operation_id, NEW.operation_type AS operation_type, NEW.scope AS scope, NEW.payload_json AS payload_json, NEW.status AS status, NEW.created_at AS created_at, NEW.updated_at AS updated_at))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: operation_journal'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_operation_journal_update
BEFORE UPDATE ON operation_journal
WHEN (SELECT (scope IN ('TYPE_CQ','CHAPTER_CQ','GLOBAL')) IS 0 OR (status IN ('PENDING','RUNNING','COMMITTED','FAILED','CANCELLED')) IS 0 FROM (SELECT NEW.operation_id AS operation_id, NEW.operation_type AS operation_type, NEW.scope AS scope, NEW.payload_json AS payload_json, NEW.status AS status, NEW.created_at AS created_at, NEW.updated_at AS updated_at))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: operation_journal'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_board_catalog_insert
BEFORE INSERT ON board_catalog
WHEN (SELECT (board_kind IN ('BUILTIN','CUSTOM')) IS 0 OR (is_archived IN (0,1)) IS 0 FROM (SELECT NEW.board_id AS board_id, NEW.code AS code, NEW.display_name AS display_name, NEW.board_kind AS board_kind, NEW.is_archived AS is_archived, NEW.sort_order AS sort_order, NEW.created_at AS created_at, NEW.updated_at AS updated_at))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: board_catalog'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_board_catalog_update
BEFORE UPDATE ON board_catalog
WHEN (SELECT (board_kind IN ('BUILTIN','CUSTOM')) IS 0 OR (is_archived IN (0,1)) IS 0 FROM (SELECT NEW.board_id AS board_id, NEW.code AS code, NEW.display_name AS display_name, NEW.board_kind AS board_kind, NEW.is_archived AS is_archived, NEW.sort_order AS sort_order, NEW.created_at AS created_at, NEW.updated_at AS updated_at))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: board_catalog'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_type_cq_question_types_insert
BEFORE INSERT ON type_cq_question_types
WHEN (SELECT (is_active IN (0,1)) IS 0 FROM (SELECT NEW.question_type_id AS question_type_id, NEW.code AS code, NEW.label AS label, NEW.sort_order AS sort_order, NEW.is_active AS is_active))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: type_cq_question_types'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_type_cq_question_types_update
BEFORE UPDATE ON type_cq_question_types
WHEN (SELECT (is_active IN (0,1)) IS 0 FROM (SELECT NEW.question_type_id AS question_type_id, NEW.code AS code, NEW.label AS label, NEW.sort_order AS sort_order, NEW.is_active AS is_active))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: type_cq_question_types'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_type_cq_stimuli_insert
BEFORE INSERT ON type_cq_stimuli
WHEN (SELECT (rating IS NULL OR rating BETWEEN 1 AND 5) IS 0 FROM (SELECT NEW.stimulus_id AS stimulus_id, NEW.topic_id AS topic_id, NEW.stimulus_text AS stimulus_text, NEW.rating AS rating, NEW.reference_text AS reference_text, NEW.created_at AS created_at, NEW.updated_at AS updated_at))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: type_cq_stimuli'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_type_cq_stimuli_update
BEFORE UPDATE ON type_cq_stimuli
WHEN (SELECT (rating IS NULL OR rating BETWEEN 1 AND 5) IS 0 FROM (SELECT NEW.stimulus_id AS stimulus_id, NEW.topic_id AS topic_id, NEW.stimulus_text AS stimulus_text, NEW.rating AS rating, NEW.reference_text AS reference_text, NEW.created_at AS created_at, NEW.updated_at AS updated_at))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: type_cq_stimuli'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_type_cq_questions_insert
BEFORE INSERT ON type_cq_questions
WHEN (SELECT (subquestion_label IN ('ক','খ','গ','ঘ')) IS 0 OR (marks > 0) IS 0 OR (rating IS NULL OR rating BETWEEN 1 AND 5) IS 0 FROM (SELECT NEW.question_id AS question_id, NEW.stimulus_id AS stimulus_id, NEW.topic_id AS topic_id, NEW.question_type_id AS question_type_id, NEW.subquestion_label AS subquestion_label, NEW.marks AS marks, NEW.question_text AS question_text, NEW.short_answer AS short_answer, NEW.rating AS rating, NEW.sort_order AS sort_order, NEW.created_at AS created_at, NEW.updated_at AS updated_at))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: type_cq_questions'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_type_cq_questions_update
BEFORE UPDATE ON type_cq_questions
WHEN (SELECT (subquestion_label IN ('ক','খ','গ','ঘ')) IS 0 OR (marks > 0) IS 0 OR (rating IS NULL OR rating BETWEEN 1 AND 5) IS 0 FROM (SELECT NEW.question_id AS question_id, NEW.stimulus_id AS stimulus_id, NEW.topic_id AS topic_id, NEW.question_type_id AS question_type_id, NEW.subquestion_label AS subquestion_label, NEW.marks AS marks, NEW.question_text AS question_text, NEW.short_answer AS short_answer, NEW.rating AS rating, NEW.sort_order AS sort_order, NEW.created_at AS created_at, NEW.updated_at AS updated_at))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: type_cq_questions'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_type_cq_stimulus_boards_insert
BEFORE INSERT ON type_cq_stimulus_boards
WHEN (SELECT (year BETWEEN 1900 AND 2200) IS 0 FROM (SELECT NEW.id AS id, NEW.stimulus_id AS stimulus_id, NEW.board_code AS board_code, NEW.year AS year, NEW.sort_order AS sort_order))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: type_cq_stimulus_boards'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_type_cq_stimulus_boards_update
BEFORE UPDATE ON type_cq_stimulus_boards
WHEN (SELECT (year BETWEEN 1900 AND 2200) IS 0 FROM (SELECT NEW.id AS id, NEW.stimulus_id AS stimulus_id, NEW.board_code AS board_code, NEW.year AS year, NEW.sort_order AS sort_order))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: type_cq_stimulus_boards'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_type_cq_question_boards_insert
BEFORE INSERT ON type_cq_question_boards
WHEN (SELECT (year BETWEEN 1900 AND 2200) IS 0 FROM (SELECT NEW.id AS id, NEW.question_id AS question_id, NEW.board_code AS board_code, NEW.year AS year, NEW.sort_order AS sort_order))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: type_cq_question_boards'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_type_cq_question_boards_update
BEFORE UPDATE ON type_cq_question_boards
WHEN (SELECT (year BETWEEN 1900 AND 2200) IS 0 FROM (SELECT NEW.id AS id, NEW.question_id AS question_id, NEW.board_code AS board_code, NEW.year AS year, NEW.sort_order AS sort_order))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: type_cq_question_boards'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_type_cq_question_categories_insert
BEFORE INSERT ON type_cq_question_categories
WHEN (SELECT (is_archived IN (0,1)) IS 0 FROM (SELECT NEW.category_id AS category_id, NEW.name AS name, NEW.description AS description, NEW.color AS color, NEW.icon AS icon, NEW.sort_order AS sort_order, NEW.is_archived AS is_archived, NEW.created_at AS created_at, NEW.updated_at AS updated_at))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: type_cq_question_categories'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_type_cq_question_categories_update
BEFORE UPDATE ON type_cq_question_categories
WHEN (SELECT (is_archived IN (0,1)) IS 0 FROM (SELECT NEW.category_id AS category_id, NEW.name AS name, NEW.description AS description, NEW.color AS color, NEW.icon AS icon, NEW.sort_order AS sort_order, NEW.is_archived AS is_archived, NEW.created_at AS created_at, NEW.updated_at AS updated_at))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: type_cq_question_categories'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_type_cq_images_insert
BEFORE INSERT ON type_cq_images
WHEN (SELECT (length(relative_path) > 0 AND substr(relative_path,1,1) <> '/' AND instr(relative_path,'..') = 0 AND instr(relative_path,char(92)) = 0) IS 0 OR (length(trim(mime_type)) > 0) IS 0 OR (width > 0) IS 0 OR (height > 0) IS 0 OR (byte_size >= 0) IS 0 OR (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*') IS 0 OR (processing_status IN ('PENDING','READY','MISSING','CORRUPT')) IS 0 FROM (SELECT NEW.image_id AS image_id, NEW.relative_path AS relative_path, NEW.original_name AS original_name, NEW.stored_name AS stored_name, NEW.mime_type AS mime_type, NEW.width AS width, NEW.height AS height, NEW.byte_size AS byte_size, NEW.sha256 AS sha256, NEW.processing_status AS processing_status, NEW.created_at AS created_at, NEW.updated_at AS updated_at))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: type_cq_images'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_type_cq_images_update
BEFORE UPDATE ON type_cq_images
WHEN (SELECT (length(relative_path) > 0 AND substr(relative_path,1,1) <> '/' AND instr(relative_path,'..') = 0 AND instr(relative_path,char(92)) = 0) IS 0 OR (length(trim(mime_type)) > 0) IS 0 OR (width > 0) IS 0 OR (height > 0) IS 0 OR (byte_size >= 0) IS 0 OR (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*') IS 0 OR (processing_status IN ('PENDING','READY','MISSING','CORRUPT')) IS 0 FROM (SELECT NEW.image_id AS image_id, NEW.relative_path AS relative_path, NEW.original_name AS original_name, NEW.stored_name AS stored_name, NEW.mime_type AS mime_type, NEW.width AS width, NEW.height AS height, NEW.byte_size AS byte_size, NEW.sha256 AS sha256, NEW.processing_status AS processing_status, NEW.created_at AS created_at, NEW.updated_at AS updated_at))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: type_cq_images'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_type_cq_stimulus_images_insert
BEFORE INSERT ON type_cq_stimulus_images
WHEN (SELECT (placement IN ('TOP','BOTTOM')) IS 0 FROM (SELECT NEW.stimulus_id AS stimulus_id, NEW.image_id AS image_id, NEW.position AS position, NEW.placement AS placement))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: type_cq_stimulus_images'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_type_cq_stimulus_images_update
BEFORE UPDATE ON type_cq_stimulus_images
WHEN (SELECT (placement IN ('TOP','BOTTOM')) IS 0 FROM (SELECT NEW.stimulus_id AS stimulus_id, NEW.image_id AS image_id, NEW.position AS position, NEW.placement AS placement))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: type_cq_stimulus_images'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_type_cq_solution_parts_insert
BEFORE INSERT ON type_cq_solution_parts
WHEN (SELECT (part_type IN ('TEXT','IMAGE')) IS 0 OR ((part_type = 'TEXT' AND text_content IS NOT NULL AND image_id IS NULL) OR (part_type = 'IMAGE' AND image_id IS NOT NULL AND text_content IS NULL)) IS 0 FROM (SELECT NEW.part_id AS part_id, NEW.question_id AS question_id, NEW.position AS position, NEW.part_type AS part_type, NEW.text_content AS text_content, NEW.image_id AS image_id, NEW.created_at AS created_at))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: type_cq_solution_parts'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_type_cq_solution_parts_update
BEFORE UPDATE ON type_cq_solution_parts
WHEN (SELECT (part_type IN ('TEXT','IMAGE')) IS 0 OR ((part_type = 'TEXT' AND text_content IS NOT NULL AND image_id IS NULL) OR (part_type = 'IMAGE' AND image_id IS NOT NULL AND text_content IS NULL)) IS 0 FROM (SELECT NEW.part_id AS part_id, NEW.question_id AS question_id, NEW.position AS position, NEW.part_type AS part_type, NEW.text_content AS text_content, NEW.image_id AS image_id, NEW.created_at AS created_at))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: type_cq_solution_parts'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_chapter_cq_stimuli_insert
BEFORE INSERT ON chapter_cq_stimuli
WHEN (SELECT (rating IS NULL OR rating BETWEEN 1 AND 5) IS 0 FROM (SELECT NEW.stimulus_id AS stimulus_id, NEW.chapter_id AS chapter_id, NEW.stimulus_text AS stimulus_text, NEW.rating AS rating, NEW.reference_text AS reference_text, NEW.created_at AS created_at, NEW.updated_at AS updated_at))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: chapter_cq_stimuli'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_chapter_cq_stimuli_update
BEFORE UPDATE ON chapter_cq_stimuli
WHEN (SELECT (rating IS NULL OR rating BETWEEN 1 AND 5) IS 0 FROM (SELECT NEW.stimulus_id AS stimulus_id, NEW.chapter_id AS chapter_id, NEW.stimulus_text AS stimulus_text, NEW.rating AS rating, NEW.reference_text AS reference_text, NEW.created_at AS created_at, NEW.updated_at AS updated_at))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: chapter_cq_stimuli'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_chapter_cq_questions_insert
BEFORE INSERT ON chapter_cq_questions
WHEN (SELECT (subquestion_label IN ('ক','খ','গ','ঘ')) IS 0 OR (marks > 0) IS 0 OR (rating IS NULL OR rating BETWEEN 1 AND 5) IS 0 FROM (SELECT NEW.question_id AS question_id, NEW.stimulus_id AS stimulus_id, NEW.chapter_id AS chapter_id, NEW.subquestion_label AS subquestion_label, NEW.marks AS marks, NEW.question_text AS question_text, NEW.short_answer AS short_answer, NEW.rating AS rating, NEW.sort_order AS sort_order, NEW.created_at AS created_at, NEW.updated_at AS updated_at))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: chapter_cq_questions'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_chapter_cq_questions_update
BEFORE UPDATE ON chapter_cq_questions
WHEN (SELECT (subquestion_label IN ('ক','খ','গ','ঘ')) IS 0 OR (marks > 0) IS 0 OR (rating IS NULL OR rating BETWEEN 1 AND 5) IS 0 FROM (SELECT NEW.question_id AS question_id, NEW.stimulus_id AS stimulus_id, NEW.chapter_id AS chapter_id, NEW.subquestion_label AS subquestion_label, NEW.marks AS marks, NEW.question_text AS question_text, NEW.short_answer AS short_answer, NEW.rating AS rating, NEW.sort_order AS sort_order, NEW.created_at AS created_at, NEW.updated_at AS updated_at))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: chapter_cq_questions'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_chapter_cq_stimulus_boards_insert
BEFORE INSERT ON chapter_cq_stimulus_boards
WHEN (SELECT (year BETWEEN 1900 AND 2200) IS 0 FROM (SELECT NEW.id AS id, NEW.stimulus_id AS stimulus_id, NEW.board_code AS board_code, NEW.year AS year, NEW.sort_order AS sort_order))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: chapter_cq_stimulus_boards'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_chapter_cq_stimulus_boards_update
BEFORE UPDATE ON chapter_cq_stimulus_boards
WHEN (SELECT (year BETWEEN 1900 AND 2200) IS 0 FROM (SELECT NEW.id AS id, NEW.stimulus_id AS stimulus_id, NEW.board_code AS board_code, NEW.year AS year, NEW.sort_order AS sort_order))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: chapter_cq_stimulus_boards'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_chapter_cq_question_boards_insert
BEFORE INSERT ON chapter_cq_question_boards
WHEN (SELECT (year BETWEEN 1900 AND 2200) IS 0 FROM (SELECT NEW.id AS id, NEW.question_id AS question_id, NEW.board_code AS board_code, NEW.year AS year, NEW.sort_order AS sort_order))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: chapter_cq_question_boards'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_chapter_cq_question_boards_update
BEFORE UPDATE ON chapter_cq_question_boards
WHEN (SELECT (year BETWEEN 1900 AND 2200) IS 0 FROM (SELECT NEW.id AS id, NEW.question_id AS question_id, NEW.board_code AS board_code, NEW.year AS year, NEW.sort_order AS sort_order))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: chapter_cq_question_boards'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_chapter_cq_question_categories_insert
BEFORE INSERT ON chapter_cq_question_categories
WHEN (SELECT (is_archived IN (0,1)) IS 0 FROM (SELECT NEW.category_id AS category_id, NEW.name AS name, NEW.description AS description, NEW.color AS color, NEW.icon AS icon, NEW.sort_order AS sort_order, NEW.is_archived AS is_archived, NEW.created_at AS created_at, NEW.updated_at AS updated_at))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: chapter_cq_question_categories'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_chapter_cq_question_categories_update
BEFORE UPDATE ON chapter_cq_question_categories
WHEN (SELECT (is_archived IN (0,1)) IS 0 FROM (SELECT NEW.category_id AS category_id, NEW.name AS name, NEW.description AS description, NEW.color AS color, NEW.icon AS icon, NEW.sort_order AS sort_order, NEW.is_archived AS is_archived, NEW.created_at AS created_at, NEW.updated_at AS updated_at))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: chapter_cq_question_categories'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_chapter_cq_images_insert
BEFORE INSERT ON chapter_cq_images
WHEN (SELECT (length(relative_path) > 0 AND substr(relative_path,1,1) <> '/' AND instr(relative_path,'..') = 0 AND instr(relative_path,char(92)) = 0) IS 0 OR (length(trim(mime_type)) > 0) IS 0 OR (width > 0) IS 0 OR (height > 0) IS 0 OR (byte_size >= 0) IS 0 OR (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*') IS 0 OR (processing_status IN ('PENDING','READY','MISSING','CORRUPT')) IS 0 FROM (SELECT NEW.image_id AS image_id, NEW.relative_path AS relative_path, NEW.original_name AS original_name, NEW.stored_name AS stored_name, NEW.mime_type AS mime_type, NEW.width AS width, NEW.height AS height, NEW.byte_size AS byte_size, NEW.sha256 AS sha256, NEW.processing_status AS processing_status, NEW.created_at AS created_at, NEW.updated_at AS updated_at))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: chapter_cq_images'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_chapter_cq_images_update
BEFORE UPDATE ON chapter_cq_images
WHEN (SELECT (length(relative_path) > 0 AND substr(relative_path,1,1) <> '/' AND instr(relative_path,'..') = 0 AND instr(relative_path,char(92)) = 0) IS 0 OR (length(trim(mime_type)) > 0) IS 0 OR (width > 0) IS 0 OR (height > 0) IS 0 OR (byte_size >= 0) IS 0 OR (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*') IS 0 OR (processing_status IN ('PENDING','READY','MISSING','CORRUPT')) IS 0 FROM (SELECT NEW.image_id AS image_id, NEW.relative_path AS relative_path, NEW.original_name AS original_name, NEW.stored_name AS stored_name, NEW.mime_type AS mime_type, NEW.width AS width, NEW.height AS height, NEW.byte_size AS byte_size, NEW.sha256 AS sha256, NEW.processing_status AS processing_status, NEW.created_at AS created_at, NEW.updated_at AS updated_at))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: chapter_cq_images'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_chapter_cq_stimulus_images_insert
BEFORE INSERT ON chapter_cq_stimulus_images
WHEN (SELECT (placement IN ('TOP','BOTTOM')) IS 0 FROM (SELECT NEW.stimulus_id AS stimulus_id, NEW.image_id AS image_id, NEW.position AS position, NEW.placement AS placement))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: chapter_cq_stimulus_images'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_chapter_cq_stimulus_images_update
BEFORE UPDATE ON chapter_cq_stimulus_images
WHEN (SELECT (placement IN ('TOP','BOTTOM')) IS 0 FROM (SELECT NEW.stimulus_id AS stimulus_id, NEW.image_id AS image_id, NEW.position AS position, NEW.placement AS placement))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: chapter_cq_stimulus_images'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_chapter_cq_solution_parts_insert
BEFORE INSERT ON chapter_cq_solution_parts
WHEN (SELECT (part_type IN ('TEXT','IMAGE')) IS 0 OR ((part_type = 'TEXT' AND text_content IS NOT NULL AND image_id IS NULL) OR (part_type = 'IMAGE' AND image_id IS NOT NULL AND text_content IS NULL)) IS 0 FROM (SELECT NEW.part_id AS part_id, NEW.question_id AS question_id, NEW.position AS position, NEW.part_type AS part_type, NEW.text_content AS text_content, NEW.image_id AS image_id, NEW.created_at AS created_at))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: chapter_cq_solution_parts'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_chapter_cq_solution_parts_update
BEFORE UPDATE ON chapter_cq_solution_parts
WHEN (SELECT (part_type IN ('TEXT','IMAGE')) IS 0 OR ((part_type = 'TEXT' AND text_content IS NOT NULL AND image_id IS NULL) OR (part_type = 'IMAGE' AND image_id IS NOT NULL AND text_content IS NULL)) IS 0 FROM (SELECT NEW.part_id AS part_id, NEW.question_id AS question_id, NEW.position AS position, NEW.part_type AS part_type, NEW.text_content AS text_content, NEW.image_id AS image_id, NEW.created_at AS created_at))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: chapter_cq_solution_parts'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_paper_categories_insert
BEFORE INSERT ON paper_categories
WHEN (SELECT (is_system IN (0,1)) IS 0 FROM (SELECT NEW.paper_category_id AS paper_category_id, NEW.name AS name, NEW.description AS description, NEW.color AS color, NEW.icon AS icon, NEW.sort_order AS sort_order, NEW.is_system AS is_system, NEW.created_at AS created_at, NEW.updated_at AS updated_at))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: paper_categories'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_paper_categories_update
BEFORE UPDATE ON paper_categories
WHEN (SELECT (is_system IN (0,1)) IS 0 FROM (SELECT NEW.paper_category_id AS paper_category_id, NEW.name AS name, NEW.description AS description, NEW.color AS color, NEW.icon AS icon, NEW.sort_order AS sort_order, NEW.is_system AS is_system, NEW.created_at AS created_at, NEW.updated_at AS updated_at))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: paper_categories'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_paper_question_items_insert
BEFORE INSERT ON paper_question_items
WHEN (SELECT (NOT (type_cq_question_id IS NOT NULL AND chapter_cq_question_id IS NOT NULL)) IS 0 FROM (SELECT NEW.item_id AS item_id, NEW.paper_id AS paper_id, NEW.section_id AS section_id, NEW.type_cq_question_id AS type_cq_question_id, NEW.chapter_cq_question_id AS chapter_cq_question_id, NEW.snapshot_json AS snapshot_json, NEW.sort_order AS sort_order, NEW.marks_override AS marks_override, NEW.created_at AS created_at))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: paper_question_items'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_paper_question_items_update
BEFORE UPDATE ON paper_question_items
WHEN (SELECT (NOT (type_cq_question_id IS NOT NULL AND chapter_cq_question_id IS NOT NULL)) IS 0 FROM (SELECT NEW.item_id AS item_id, NEW.paper_id AS paper_id, NEW.section_id AS section_id, NEW.type_cq_question_id AS type_cq_question_id, NEW.chapter_cq_question_id AS chapter_cq_question_id, NEW.snapshot_json AS snapshot_json, NEW.sort_order AS sort_order, NEW.marks_override AS marks_override, NEW.created_at AS created_at))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: paper_question_items'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_paper_images_insert
BEFORE INSERT ON paper_images
WHEN (SELECT (length(relative_path) > 0 AND substr(relative_path,1,1) <> '/' AND instr(relative_path,'..') = 0 AND instr(relative_path,char(92)) = 0) IS 0 OR (length(trim(mime_type)) > 0) IS 0 OR (width > 0) IS 0 OR (height > 0) IS 0 OR (byte_size >= 0) IS 0 OR (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*') IS 0 FROM (SELECT NEW.paper_image_id AS paper_image_id, NEW.relative_path AS relative_path, NEW.mime_type AS mime_type, NEW.width AS width, NEW.height AS height, NEW.byte_size AS byte_size, NEW.sha256 AS sha256, NEW.created_at AS created_at))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: paper_images'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_paper_images_update
BEFORE UPDATE ON paper_images
WHEN (SELECT (length(relative_path) > 0 AND substr(relative_path,1,1) <> '/' AND instr(relative_path,'..') = 0 AND instr(relative_path,char(92)) = 0) IS 0 OR (length(trim(mime_type)) > 0) IS 0 OR (width > 0) IS 0 OR (height > 0) IS 0 OR (byte_size >= 0) IS 0 OR (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*') IS 0 FROM (SELECT NEW.paper_image_id AS paper_image_id, NEW.relative_path AS relative_path, NEW.mime_type AS mime_type, NEW.width AS width, NEW.height AS height, NEW.byte_size AS byte_size, NEW.sha256 AS sha256, NEW.created_at AS created_at))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: paper_images'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_paper_item_images_insert
BEFORE INSERT ON paper_item_images
WHEN (SELECT (placement IN ('STIMULUS_TOP','STIMULUS_BOTTOM','SOLUTION')) IS 0 FROM (SELECT NEW.item_id AS item_id, NEW.paper_image_id AS paper_image_id, NEW.position AS position, NEW.placement AS placement))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: paper_item_images'); END""",
        """CREATE TRIGGER IF NOT EXISTS trg_chk_paper_item_images_update
BEFORE UPDATE ON paper_item_images
WHEN (SELECT (placement IN ('STIMULUS_TOP','STIMULUS_BOTTOM','SOLUTION')) IS 0 FROM (SELECT NEW.item_id AS item_id, NEW.paper_image_id AS paper_image_id, NEW.position AS position, NEW.placement AS placement))
BEGIN SELECT RAISE(ABORT, 'CHECK failed: paper_item_images'); END"""
    )
}
