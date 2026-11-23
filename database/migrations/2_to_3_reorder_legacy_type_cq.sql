-- One-time v2 -> v3 migration: rewrite only sort_order. Older cards are listed oldest first.
-- Every stimulus + all its subquestions receives a contiguous sort-order band.
WITH grouped AS (
                SELECT q.topic_id AS topic_id,
                       COALESCE(q.stimulus_id, 'single:' || q.question_id) AS group_key,
                       MIN(COALESCE(s.created_at, q.created_at)) AS group_created_at,
                       MAX(q.sort_order) AS legacy_order
                FROM type_cq_questions q
                LEFT JOIN type_cq_stimuli s ON s.stimulus_id = q.stimulus_id
                GROUP BY q.topic_id, COALESCE(q.stimulus_id, 'single:' || q.question_id)
            ), ranked_groups AS (
                SELECT topic_id, group_key,
                       ROW_NUMBER() OVER (
                           PARTITION BY topic_id
                           ORDER BY group_created_at ASC, legacy_order ASC, group_key ASC
                       ) AS group_rank,
                       COUNT(*) OVER (PARTITION BY topic_id) AS group_count
                FROM grouped
            ), ranked_questions AS (
                SELECT q.question_id, q.topic_id,
                       COALESCE(q.stimulus_id, 'single:' || q.question_id) AS group_key,
                       ROW_NUMBER() OVER (
                           PARTITION BY q.topic_id, COALESCE(q.stimulus_id, 'single:' || q.question_id)
                           ORDER BY CASE q.subquestion_label
                               WHEN 'ক' THEN 1 WHEN 'খ' THEN 2 WHEN 'গ' THEN 3 WHEN 'ঘ' THEN 4 ELSE 5 END,
                               q.sort_order DESC, q.question_id ASC
                       ) AS question_rank
                FROM type_cq_questions q
            )
            UPDATE type_cq_questions
            SET sort_order = (
                SELECT ((g.group_count - g.group_rank + 1) * 10) + (5 - r.question_rank)
                FROM ranked_groups g
                JOIN ranked_questions r
                  ON r.topic_id = g.topic_id AND r.group_key = g.group_key
                WHERE r.question_id = type_cq_questions.question_id
            )
            WHERE question_id IN (SELECT question_id FROM ranked_questions);
