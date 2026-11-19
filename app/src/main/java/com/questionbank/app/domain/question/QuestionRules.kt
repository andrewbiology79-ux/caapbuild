package com.questionbank.app.domain.question

import com.questionbank.app.data.local.BanglaText

/**
 * Pure rules for one editor save (no database, no Android classes except java.text.Normalizer through [BanglaText]).
 *
 * Cleaning: NFC (finding F-2), then the ends are trimmed. Line breaks inside the text are kept on purpose.
 * A sub-question is stored only when its text is not blank. A short answer without a question text is an error,
 * so typed content is never dropped silently.
 */
object QuestionRules {
    const val MAX_TEXT_LENGTH = 20_000

    sealed interface Checked {
        /** [stimulusRating] and [ratings] (v0.2.30) only hold what will really be stored: a rating needs its stimulus text or its question text. */
        data class Ok(
            val stimulusText: String,
            val items: List<SubQuestionInput>,
            val referenceText: String = "",
            val stimulusRating: Int? = null,
            val ratings: Map<CqLabel, Int?> = emptyMap(),
            /** v0.2.30c: like the ratings, only the tags of blocks that are really stored (duplicates removed, chosen order kept). */
            val stimulusBoards: List<BoardTag> = emptyList(),
            val boards: Map<CqLabel, List<BoardTag>> = emptyMap(),
        ) : Checked
        data object Empty : Checked
        data class MissingText(val label: CqLabel) : Checked
        data class TooLong(val field: String) : Checked
        /** A rating outside 1-5 (the editor cannot produce one; this guards the data). */
        data object BadRating : Checked
        /** A board tag with an empty code or a year outside 1900-2200, or too many tags on one block (the editor cannot produce one; this guards the data). */
        data object BadBoard : Checked
    }

    fun clean(raw: String): String = BanglaText.normalize(raw).trim()

    fun check(input: QuestionGroupInput): Checked {
        if (input.ratings != null && !RatingRules.allValid(input.ratings)) return Checked.BadRating
        val wantedBoards = input.boards
        if (wantedBoards != null && !BoardRules.allValid(wantedBoards)) return Checked.BadBoard
        val stimulus = clean(input.stimulusText)
        val reference = clean(input.referenceText)
        if (reference.length > MAX_TEXT_LENGTH) return Checked.TooLong("রেফারেন্স")
        if (stimulus.length > MAX_TEXT_LENGTH) return Checked.TooLong("উদ্দীপক")
        val items = ArrayList<SubQuestionInput>()
        for (sub in input.subQuestions) {
            val text = clean(sub.text)
            val answer = clean(sub.shortAnswer)
            if (text.isEmpty()) {
                if (answer.isNotEmpty()) return Checked.MissingText(sub.label)
                continue
            }
            if (text.length > MAX_TEXT_LENGTH) return Checked.TooLong("${sub.label.letter}) প্রশ্ন")
            if (answer.length > MAX_TEXT_LENGTH) return Checked.TooLong("${sub.label.letter}) উত্তর")
            if (sub.questionTypeId.isBlank()) return Checked.TooLong("প্রশ্নের ধরন")
            if (!sub.marks.isFinite() || sub.marks <= 0.0) return Checked.TooLong("নম্বর")
            if (sub.solutionParts.any { clean(it).length > MAX_TEXT_LENGTH }) return Checked.TooLong("সমাধান")
            items.add(sub.copy(text = text, shortAnswer = answer, solutionParts = sub.solutionParts.map(::clean).filter { it.isNotEmpty() }))
        }
        if (items.isEmpty()) return Checked.Empty
        val wanted = input.ratings
        val stimulusRating = if (stimulus.isNotEmpty() || reference.isNotEmpty()) wanted?.stimulus else null
        val ratings = LinkedHashMap<CqLabel, Int?>()
        if (wanted != null) {
            for (item in items) {
                if (wanted.byLabel.containsKey(item.label)) ratings[item.label] = wanted.byLabel[item.label]
            }
        }
        val stimulusBoards = if ((stimulus.isNotEmpty() || reference.isNotEmpty()) && wantedBoards != null) BoardRules.normalizeTags(wantedBoards.stimulus) else emptyList()
        val boards = LinkedHashMap<CqLabel, List<BoardTag>>()
        if (wantedBoards != null) {
            for (item in items) {
                val tags = wantedBoards.byLabel[item.label]
                if (tags != null) boards[item.label] = BoardRules.normalizeTags(tags)
            }
        }
        return Checked.Ok(stimulus, items, reference, stimulusRating, ratings, stimulusBoards, boards)
    }
}
