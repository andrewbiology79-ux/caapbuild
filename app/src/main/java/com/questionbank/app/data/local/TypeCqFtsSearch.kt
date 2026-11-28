package com.questionbank.app.data.local

import androidx.room.useReaderConnection

/**
 * Ids of the Type_CQ questions of [topicId] whose question text or short answer matches the FTS5 string [match]
 * (built by `QuestionSearchRules.ftsQuery`). The FTS row is joined to its question through `fts_id` (ADR-003), and the topic is
 * checked on the question row, so another topic's questions can never appear.
 *
 * Written with a plain prepared statement on a reader connection (like the benchmark and runtime tests) because Room's compile-time
 * query check does not know the FTS virtual tables. Read-only: it never blocks the writer.
 */
suspend fun QuestionBankDatabase.typeCqFtsMatch(topicId: String, match: String): List<String> =
    useReaderConnection { connection ->
        connection.usePrepared(
            "SELECT q.question_id FROM type_cq_question_fts f JOIN type_cq_questions q ON q.fts_id = f.rowid " +
                "WHERE f.type_cq_question_fts MATCH ? AND q.topic_id = ?"
        ) { statement ->
            statement.bindText(1, match)
            statement.bindText(2, topicId)
            val ids = ArrayList<String>()
            while (statement.step()) ids.add(statement.getText(0))
            ids
        }
    }
