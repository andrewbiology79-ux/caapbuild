package com.questionbank.app.data.local

import com.questionbank.app.domain.question.CqLabel

/**
 * Idempotent seed rows, run on every database open (INSERT OR IGNORE), kept apart from [CanonicalDatabaseObjects]
 * because the canonical list mirrors the canonical SQL file one to one.
 *
 * Question types: one per CQ sub-question label, generated from [CqLabel] so the ids used by the editor and the ids
 * in the table can never drift apart. If the owner later renames a type, only `label` may change; ids and codes stay.
 */
internal object SeedData {
    val statements: List<String> = CqLabel.entries.map { l ->
        "INSERT OR IGNORE INTO type_cq_question_types(question_type_id, code, label, sort_order, is_active) " +
            "VALUES('${l.typeId}', '${l.typeCode}', '${l.typeLabel}', ${l.sortOrder}, 1)"
    }
}
