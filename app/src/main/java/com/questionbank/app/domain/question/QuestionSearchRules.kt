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
 *
 * v0.2.29 (plan 45.3 option A): a word that STARTS with `#` (also `#` alone) is a hashtag word. The FTS5 tokenizer never stores `#`,
 * so such a word is not sent to FTS5; it is matched as plain text, `#` included (case-insensitive for Latin letters), in the
 * question text, the short answer and the stimulus. `#` alone finds every text that contains a `#`; `#আলো` finds `#আলো` and
 * `#আলোর` but no longer the bare word `আলো`. Other words stay FTS5 words. All words (hashtag or not) must still match.
 */
object QuestionSearchRules {
    const val MAX_QUERY_LENGTH = 200
    const val MAX_WORDS = 8

    fun tokens(raw: String): List<String> =
        BanglaText.normalize(raw).take(MAX_QUERY_LENGTH)
            .split(Regex("\\s+"))
            .map { it.replace("\"", "") }
            .filter { word -> isHashWord(word) || word.any { it.isLetterOrDigit() } }
            .take(MAX_WORDS)

    /** A hashtag word starts with `#` (v0.2.29). It is matched as plain text, never by FTS5. */
    fun isHashWord(word: String): Boolean = word.startsWith("#")

    /** The FTS5 MATCH string for the non-hashtag words of [tokens], or null when there is none (for example only `#tag`). */
    fun ftsQuery(tokens: List<String>): String? {
        val words = tokens.filterNot { isHashWord(it) }
        if (words.isEmpty()) return null
        val last = words.lastIndex
        return words.mapIndexed { i, word -> if (i == last) "\"$word\"*" else "\"$word\"" }.joinToString(" ")
    }

    /**
     * True when every hashtag word of [tokens] occurs in the question text or the short answer (plain text, case-insensitive for
     * Latin letters). True when [tokens] has no hashtag word.
     */
    fun hashWordsMatch(text: String, shortAnswer: String, tokens: List<String>): Boolean {
        val hashWords = tokens.filter { isHashWord(it) }
        if (hashWords.isEmpty()) return true
        val haystack = (text + "\n" + shortAnswer).lowercase(Locale.ROOT)
        return hashWords.all { haystack.contains(it.lowercase(Locale.ROOT)) }
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

    /**
     * v0.2.30c-3: the search with a board / year filter. A sub-question is kept when BOTH hold:
     *  - the text part: [textMatchedQuestionIds] is null (no text was typed: every question fits), or the question matched, or its
     *    stimulus matched ([textMatchedStimulusIds]);
     *  - the tag part: a tag of the question fits [filter], or (for a group with a stimulus) a tag of the stimulus fits it.
     * A card shows only the kept sub-questions; a group without any disappears. The order of [groups] is kept.
     */
    fun filterByBoards(
        groups: List<SavedGroup>,
        textMatchedQuestionIds: Set<String>?,
        textMatchedStimulusIds: Set<String>,
        filter: BoardFilter,
    ): List<SavedGroup> =
        groups.mapNotNull { group ->
            val stimulusId = group.stimulusId
            val stimulusTextOk = stimulusId != null && stimulusId in textMatchedStimulusIds
            val hasBoardFilter = filter.boardCode != null || filter.year != null
            val stimulusTagOk = hasBoardFilter && stimulusId != null && filter.matches(group.stimulusBoards)
            val kept = group.subQuestions.filter { q ->
                val textOk = textMatchedQuestionIds == null || q.id in textMatchedQuestionIds || stimulusTextOk
                val boardOk = !hasBoardFilter || stimulusTagOk || filter.matches(q.boards)
                val categoryOk = filter.categoryId == null || filter.categoryId in q.categoryIds
                val ratingOk = filter.rating == null || q.rating == filter.rating
                val typeOk = filter.questionTypeId == null || q.questionTypeId == filter.questionTypeId
                textOk && boardOk && categoryOk && ratingOk && typeOk
            }
            if (kept.isEmpty()) null else group.copy(subQuestions = kept)
        }
}
