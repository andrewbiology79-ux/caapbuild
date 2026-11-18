package com.questionbank.app.domain.question

import com.questionbank.app.data.local.BanglaText

/** One board and one year a question appeared in (v0.2.30c, UI-08). [boardCode] is a `board_catalog.code`. */
data class BoardTag(val boardCode: String, val year: Int)

/**
 * Boards and years chosen in the editor. Same meaning as [RatingsInput]: for a NEW group the map holds the labels the person
 * tagged; for an EDIT the object means "these are the wanted tags": [stimulus] is the full wanted list (empty clears), a label
 * present holds the full wanted list of that question (empty clears), a label absent keeps whatever is stored.
 */
data class BoardsInput(
    val stimulus: List<BoardTag> = emptyList(),
    val byLabel: Map<CqLabel, List<BoardTag>> = emptyMap(),
)

/** A board of the catalog as the editor lists it. */
data class BoardItem(val code: String, val displayName: String, val isCustom: Boolean, val isArchived: Boolean)

/** The wanted tag list of a stimulus or a question on edit (an empty list clears). */
data class BoardChange(val tags: List<BoardTag>)

/** One stored sub-question whose tags change (v0.2.30c). */
data class QuestionBoardsUpdate(val questionId: String, val label: CqLabel, val change: BoardChange)

sealed interface AddBoardResult {
    data class Added(val board: BoardItem) : AddBoardResult
    /** The code is empty, longer than [BoardRules.MAX_CODE_LENGTH], or has a character other than A-Z, 0-9 and "_". */
    data object BadCode : AddBoardResult
    /** The name is empty or longer than [BoardRules.MAX_NAME_LENGTH]. */
    data object BadName : AddBoardResult
    data object CodeExists : AddBoardResult
    data object NameExists : AddBoardResult
    data class Failed(val reason: String) : AddBoardResult
}

/** Pure rules for boards and years (no database, no Android classes). */
object BoardRules {
    const val MIN_YEAR = 1900
    const val MAX_YEAR = 2200
    const val MAX_CODE_LENGTH = 20
    const val MAX_NAME_LENGTH = 40
    const val MAX_TAGS_PER_BLOCK = 30

    private val CODE_PATTERN = Regex("[A-Z0-9_]+")
    private val SPACES = Regex("\\s+")

    fun isValidYear(year: Int): Boolean = year in MIN_YEAR..MAX_YEAR

    /** A year typed with Bengali or Latin digits ("২০২৪" or "2024"): exactly four digits in the allowed range, else null. */
    fun parseYear(raw: String): Int? {
        val ascii = StringBuilder()
        for (c in raw.trim()) {
            if (c in '০'..'৯') ascii.append('0' + (c - '০')) else ascii.append(c)
        }
        if (ascii.length != 4 || !ascii.all { it in '0'..'9' }) return null
        val year = ascii.toString().toInt()
        return if (isValidYear(year)) year else null
    }

    /** The same tag twice is stored once; the order the person chose is kept. */
    fun normalizeTags(tags: List<BoardTag>): List<BoardTag> = tags.distinct()

    fun isValid(tags: List<BoardTag>): Boolean =
        normalizeTags(tags).size <= MAX_TAGS_PER_BLOCK && tags.all { it.boardCode.isNotBlank() && isValidYear(it.year) }

    fun allValid(b: BoardsInput): Boolean = isValid(b.stimulus) && b.byLabel.values.all { isValid(it) }

    /** Upper-case code of a custom board, or null when it is not usable. */
    fun cleanCode(raw: String): String? {
        val code = raw.trim().uppercase()
        if (code.isEmpty() || code.length > MAX_CODE_LENGTH || !CODE_PATTERN.matches(code)) return null
        return code
    }

    /** Name of a custom board (NFC, ends trimmed, inner runs of spaces made one), or null when empty or too long. */
    fun cleanName(raw: String): String? {
        val name = BanglaText.normalize(raw).trim().replace(SPACES, " ")
        if (name.isEmpty() || name.length > MAX_NAME_LENGTH) return null
        return name
    }
}
