package com.questionbank.app.domain.hierarchy

import com.questionbank.app.data.local.BanglaText

/**
 * Cleaning rule for names of subjects, chapters and topics.
 * NFC first (so both spellings of য়, ড়, ঢ় are stored the same way), then runs of white space become one space and the
 * ends are trimmed. (?U) makes \s match Unicode white space such as the no-break space. Zero-width joiner and non-joiner are not white space, so Bengali conjuncts keep them.
 */
object HierarchyName {
    const val MAX_LENGTH = 200
    private val whitespace = Regex("(?U)\\s+")

    fun clean(raw: String): String = BanglaText.normalize(raw).replace(whitespace, " ").trim()
}
