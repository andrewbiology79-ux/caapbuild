-- Room migration 3 -> 4 (QuestionBankDatabase.MIGRATION_3_4)
-- Adds one nullable category ID per complete Type CQ card.
-- Existing rows remain NULL; no legacy per-question category links are read, copied, updated or deleted.
-- A card with a stimulus stores the ID on type_cq_stimuli; a standalone card stores it on type_cq_questions.

ALTER TABLE type_cq_questions
    ADD COLUMN card_category_id TEXT
    REFERENCES type_cq_question_categories(category_id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE type_cq_stimuli
    ADD COLUMN card_category_id TEXT
    REFERENCES type_cq_question_categories(category_id) ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS index_type_cq_questions_card_category_id
    ON type_cq_questions(card_category_id);

CREATE INDEX IF NOT EXISTS index_type_cq_stimuli_card_category_id
    ON type_cq_stimuli(card_category_id);
