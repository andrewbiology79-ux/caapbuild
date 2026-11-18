package com.questionbank.app.domain.question

import com.questionbank.app.data.local.BanglaText
import java.util.Locale

/**
 * Pure rules of the in-topic search (v0.2.27, ADR-011). No database and no Android classes, so they run in plain JVM unit tests.
 *
 * The typed text becomes a list of words: NFC first (finding F-2, so both spellings of য় ড় ঢ় find the same rows), split on white
 * space, double quotes removed, words without any letter or digit dropped. Each word is sent to FTS5 as a quoted phrase, so characters
 * such as `-`, `:`, `*`, `(` can never be read as FTS syntax. The LAST word is a prefix (`"আলো"*`): while typing, "আলো" finds "আলোর".
 * All words must match (implicit AND).
 */
object QuestionSearchRules {
    const val MAX_QUERY_LENGTH = 200
    const val MAX_WORDS = 8

    fun tokens(raw: String): List<String> =
        BanglaText.normalize(raw).take(MAX_QUERY_LENGTH)
            .split(Regex("\\s+"))
            .map { it.replace("\"", "") }
            .filter { word -> word.any { it.isLetterOrDigit() } }
            .take(MAX_WORDS)

    /** The FTS5 MATCH string for [tokens], or null when there is no word. */
    fun ftsQuery(tokens: List<String>): String? {
        if (tokens.isEmpty()) return null
        val last = tokens.lastIndex
        return tokens.mapIndexed { i, word -> if (i == last) "\"$word\"*" else "\"$word\"" }.joinToString(" ")
    }

    /** Plain-text match used for the stimulus (it is not in the FTS table): every word occurs, case-insensitive for Latin letters. */
    fun containsAll(text: String, tokens: List<String>): Boolean {
        if (tokens.isEmpty()) return false
        val haystack = text.lowercase(Locale.ROOT)
        return tokens.all { haystack.contains(it.lowercase(Locale.ROOT)) }
    }

    /**
     * A card shows only the sub-questions that matched; a match in the stimulus shows all of them (plan 39.3). Groups without any
     * match disappear. The order of [groups] is kept.
     */
    fun filter(groups: List<SavedGroup>, matchedQuestionIds: Set<String>, matchedStimulusIds: Set<String>): List<SavedGroup> =
        groups.mapNotNull { group ->
            val stimulusId = group.stimulusId
            if (stimulusId != null && stimulusId in matchedStimulusIds) {
                group
            } else {
                val matching = group.subQuestions.filter { it.id in matchedQuestionIds }
                if (matching.isEmpty()) null else group.copy(subQuestions = matching)
            }
        }
}
