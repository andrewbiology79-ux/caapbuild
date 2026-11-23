-- Additive migration: Type CQ Concept notes and ordered TEXT/IMAGE parts.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS type_cq_concepts (
    concept_id TEXT NOT NULL PRIMARY KEY,
    question_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(question_id) REFERENCES type_cq_questions(question_id)
        ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS index_type_cq_concepts_question_id
    ON type_cq_concepts(question_id);
CREATE TABLE IF NOT EXISTS type_cq_concept_parts (
    part_id TEXT NOT NULL PRIMARY KEY,
    concept_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    part_type TEXT NOT NULL,
    text_content TEXT,
    image_id TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(concept_id) REFERENCES type_cq_concepts(concept_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY(image_id) REFERENCES type_cq_images(image_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS index_type_cq_concept_parts_concept_id_position
    ON type_cq_concept_parts(concept_id, position);
CREATE INDEX IF NOT EXISTS index_type_cq_concept_parts_image_id
    ON type_cq_concept_parts(image_id);
