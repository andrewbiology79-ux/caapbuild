package com.questionbank.app.domain.question

/**
 * Pure rules for saving an EXISTING group (v0.2.28; no database, no Android classes).
 *
 * Same cleaning and limits as a new save ([QuestionRules]). What an edit may NOT do: blank the text of a stored sub-question or
 * the stimulus of a group that has one (that is a delete, a later package). What it may do: change texts and short answers, and
 * add a sub-question for a label that was empty (only in a group with a stimulus). Marks and types never change here. v0.2.30: ratings may change (see [RatingsInput]); a rating-only change is a real change.
 * Nothing that equals the stored value is written again, so a save without a real change is [Checked.NoChange].
 */
object QuestionEditRules {
    sealed interface Checked {
        /**
         * [stimulusText] is null when the stimulus stays as it is. v0.2.30: [stimulusRating] is null when the stimulus rating stays;
         * [ratingUpdates] lists stored questions whose rating changes (text may stay the same); [addRatings] holds the ratings of [adds].
         */
        data class Ok(
            val stimulusText: String?,
            val updates: List<QuestionUpdate>,
            val adds: List<SubQuestionInput>,
            val stimulusRating: RatingChange? = null,
            val ratingUpdates: List<QuestionRatingUpdate> = emptyList(),
            val addRatings: Map<CqLabel, Int?> = emptyMap(),
            /** v0.2.30c: [stimulusBoards] is null when the stimulus tags stay; [boardUpdates] lists stored questions whose tags change; [addBoards] holds the tags of [adds]. */
            val stimulusBoards: BoardChange? = null,
            val boardUpdates: List<QuestionBoardsUpdate> = emptyList(),
            val addBoards: Map<CqLabel, List<BoardTag>> = emptyMap(),
        ) : Checked
        data object NoChange : Checked
        data class BlankedQuestion(val label: CqLabel) : Checked
        data object BlankedStimulus : Checked
        data class MissingText(val label: CqLabel) : Checked
        data class TooLong(val field: String) : Checked
        data object BadRating : Checked
        data object BadBoard : Checked
    }

    fun check(original: SavedGroup, input: GroupEditInput): Checked {
        val wanted = input.ratings
        if (wanted != null && !RatingRules.allValid(wanted)) return Checked.BadRating
        val wantedBoards = input.boards
        if (wantedBoards != null && !BoardRules.allValid(wantedBoards)) return Checked.BadBoard
        val hasStimulus = original.stimulusId != null
        var newStimulus: String? = null
        if (hasStimulus) {
            val stimulus = QuestionRules.clean(input.stimulusText)
            if (stimulus.isEmpty()) return Checked.BlankedStimulus
            if (stimulus.length > QuestionRules.MAX_TEXT_LENGTH) return Checked.TooLong("উদ্দীপক")
            if (stimulus != original.stimulusText) newStimulus = stimulus
        }
        val updates = ArrayList<QuestionUpdate>()
        val adds = ArrayList<SubQuestionInput>()
        val ratingUpdates = ArrayList<QuestionRatingUpdate>()
        val addRatings = LinkedHashMap<CqLabel, Int?>()
        val boardUpdates = ArrayList<QuestionBoardsUpdate>()
        val addBoards = LinkedHashMap<CqLabel, List<BoardTag>>()
        // A stimulus rating can only change on a group that has a stimulus.
        val stimulusRating: RatingChange? =
            if (hasStimulus && wanted != null && wanted.stimulus != original.stimulusRating) RatingChange(wanted.stimulus) else null
        val stimulusBoards: BoardChange? =
            if (hasStimulus && wantedBoards != null && BoardRules.normalizeTags(wantedBoards.stimulus) != original.stimulusBoards) {
                BoardChange(BoardRules.normalizeTags(wantedBoards.stimulus))
            } else null
        for (sub in input.subQuestions) {
            val text = QuestionRules.clean(sub.text)
            val answer = QuestionRules.clean(sub.shortAnswer)
            val stored = original.subQuestions.firstOrNull { it.label == sub.label }
            if (stored != null) {
                if (text.isEmpty()) return Checked.BlankedQuestion(sub.label)
                if (text.length > QuestionRules.MAX_TEXT_LENGTH) return Checked.TooLong("${sub.label.letter}) প্রশ্ন")
                if (answer.length > QuestionRules.MAX_TEXT_LENGTH) return Checked.TooLong("${sub.label.letter}) উত্তর")
                if (text != stored.text || answer != stored.shortAnswer) updates.add(QuestionUpdate(stored.id, sub.label, text, answer))
                if (wanted != null && wanted.byLabel.containsKey(sub.label) && wanted.byLabel[sub.label] != stored.rating) {
                    ratingUpdates.add(QuestionRatingUpdate(stored.id, sub.label, RatingChange(wanted.byLabel[sub.label])))
                }
                val wantedTags = wantedBoards?.byLabel?.get(sub.label)
                if (wantedTags != null && BoardRules.normalizeTags(wantedTags) != stored.boards) {
                    boardUpdates.add(QuestionBoardsUpdate(stored.id, sub.label, BoardChange(BoardRules.normalizeTags(wantedTags))))
                }
            } else {
                if (text.isEmpty()) {
                    if (answer.isNotEmpty()) return Checked.MissingText(sub.label)
                    continue
                }
                if (!hasStimulus) continue // a single question never gains new sub-questions
                if (text.length > QuestionRules.MAX_TEXT_LENGTH) return Checked.TooLong("${sub.label.letter}) প্রশ্ন")
                if (answer.length > QuestionRules.MAX_TEXT_LENGTH) return Checked.TooLong("${sub.label.letter}) উত্তর")
                adds.add(SubQuestionInput(sub.label, text, answer))
                if (wanted != null && wanted.byLabel.containsKey(sub.label)) addRatings[sub.label] = wanted.byLabel[sub.label]
                val newTags = wantedBoards?.byLabel?.get(sub.label)
                if (newTags != null) addBoards[sub.label] = BoardRules.normalizeTags(newTags)
            }
        }
        if (newStimulus == null && updates.isEmpty() && adds.isEmpty() && stimulusRating == null && ratingUpdates.isEmpty() &&
            stimulusBoards == null && boardUpdates.isEmpty()
        ) return Checked.NoChange
        return Checked.Ok(newStimulus, updates, adds, stimulusRating, ratingUpdates, addRatings, stimulusBoards, boardUpdates, addBoards)
    }
}
