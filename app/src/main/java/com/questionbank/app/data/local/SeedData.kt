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

    /** A built-in board: stable code (never changes) and the name shown in the app. */
    data class BuiltinBoard(val code: String, val name: String)

    /**
     * Built-in boards (v0.2.30c). DECISION by the assistant (owner may overrule): the nine general education boards, madrasa and
     * technical. The codes are stable ids; only the display name may be changed later. Custom boards added by the person get
     * `board_kind = 'CUSTOM'` and never clash with these codes (the code is unique).
     */
    val builtinBoards: List<BuiltinBoard> = listOf(
        BuiltinBoard("DHA", "ঢাকা"),
        BuiltinBoard("RAJ", "রাজশাহী"),
        BuiltinBoard("COM", "কুমিল্লা"),
        BuiltinBoard("JES", "যশোর"),
        BuiltinBoard("CTG", "চট্টগ্রাম"),
        BuiltinBoard("BAR", "বরিশাল"),
        BuiltinBoard("SYL", "সিলেট"),
        BuiltinBoard("DIN", "দিনাজপুর"),
        BuiltinBoard("MYM", "ময়মনসিংহ"),
        BuiltinBoard("MAD", "মাদ্রাসা"),
        BuiltinBoard("TEC", "কারিগরি"),
    )

    private const val SEED_TIME = 1_700_000_000_000L

    /** Idempotent like [statements]: INSERT OR IGNORE, so a restored or older database gets the built-in boards on the next open. */
    val boardStatements: List<String> = builtinBoards.mapIndexed { index, b ->
        "INSERT OR IGNORE INTO board_catalog(board_id, code, display_name, board_kind, is_archived, sort_order, created_at, updated_at) " +
            "VALUES('brd_${b.code}', '${b.code}', '${b.name}', 'BUILTIN', 0, ${index + 1}, $SEED_TIME, $SEED_TIME)"
    }
}
