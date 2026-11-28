-- Room migration 1 -> 2: add Type CQ stimulus category links.
-- Existing question category links remain in type_cq_question_category_links.
CREATE TABLE IF NOT EXISTS type_cq_stimulus_category_links (
    stimulus_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    assigned_at INTEGER NOT NULL,
    PRIMARY KEY(stimulus_id, category_id),
    FOREIGN KEY(stimulus_id) REFERENCES type_cq_stimuli(stimulus_id) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY(category_id) REFERENCES type_cq_question_categories(category_id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS index_type_cq_stimulus_category_links_category_id_stimulus_id
    ON type_cq_stimulus_category_links(category_id, stimulus_id);
