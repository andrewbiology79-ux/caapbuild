package com.questionbank.app.domain.hierarchy

import com.questionbank.app.data.local.BanglaText

/**
 * Cleaning rule for names of subjects, chapters and topics.
 * NFC first (so both spellings of য়, ড়, ঢ় are stored the same way), then every run of white space becomes one space and
 * the ends are trimmed. White space is decided by Kotlin's Char.isWhitespace(), which includes the no-break space; zero-width
 * joiner and non-joiner are not white space, so Bengali conjuncts keep them.
 *
 * No regular expression on purpose: Java (JVM tests) and Android (ICU) disagree on what \s matches, and Android rejects the
 * (?U) flag with PatternSyntaxException (found in the v0.2.21 emulator run). A plain loop behaves the same on both.
 */
object HierarchyName {
    const val MAX_LENGTH = 200

    fun clean(raw: String): String {
        val text = BanglaText.normalize(raw)
        val out = StringBuilder(text.length)
        var pendingSpace = false
        for (ch in text) {
            if (ch.isWhitespace()) {
                pendingSpace = out.isNotEmpty()
            } else {
                if (pendingSpace) out.append(' ')
                pendingSpace = false
                out.append(ch)
            }
        }
        return out.toString()
    }
}
