package com.questionbank.app.domain.question

/**
 * Pure rules for saving an EXISTING group (v0.2.28; no database, no Android classes).
 *
 * Same cleaning and limits as a new save ([QuestionRules]). Blanking a stored question or stimulus remains invalid.
 * A stored sub-question can be removed only by supplying its explicit ID in [GroupEditInput.deletedQuestionIds];
 * deletion is limited to stimulus groups and cannot leave the group empty. Other edits can change text/answers,
 * add a sub-question to an empty label, change metadata, ratings, board/category links and ordered text solution parts.
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
            val referenceText: String? = null,
            val metadataUpdates: List<QuestionMetaUpdate> = emptyList(),
            val solutionUpdates: List<QuestionSolutionUpdate> = emptyList(),
            val deletes: List<String> = emptyList(),
            val categoryUpdates: List<QuestionCategoryUpdate> = emptyList(),
            val addCategories: Map<CqLabel, List<String>> = emptyMap(),
        ) : Checked
        data object NoChange : Checked
        data class BlankedQuestion(val label: CqLabel) : Checked
        data object BlankedStimulus : Checked
        data class MissingText(val label: CqLabel) : Checked
        data class TooLong(val field: String) : Checked
        data object BadRating : Checked
        data object BadBoard : Checked
        data object BadCategories : Checked
        data object BadDeletion : Checked
    }

    fun check(original: SavedGroup, input: GroupEditInput): Checked {
        val wanted = input.ratings
        if (wanted != null && !RatingRules.allValid(wanted)) return Checked.BadRating
        val wantedBoards = input.boards
        if (wantedBoards != null && !BoardRules.allValid(wantedBoards)) return Checked.BadBoard
        val wantedCategories = input.categoriesByLabel
        if (wantedCategories != null && wantedCategories.any { (_, ids) -> ids.any(String::isBlank) || ids.distinct().size != ids.size }) return Checked.BadCategories
        val deleteIds = input.deletedQuestionIds.toList()
        val existingIds = original.subQuestions.map { it.id }.toSet()
        if (deleteIds.any { it.isBlank() || it !in existingIds } || (deleteIds.isNotEmpty() && original.stimulusId == null)) return Checked.BadDeletion
        val hasStimulus = original.stimulusId != null
        var newStimulus: String? = null
        var newReference: String? = null
        if (hasStimulus && input.referenceText != null) {
            val reference = QuestionRules.clean(input.referenceText)
            if (reference.length > QuestionRules.MAX_TEXT_LENGTH) return Checked.TooLong("রেফারেন্স")
            if (reference != original.referenceText) newReference = reference
        }
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
        val metadataUpdates = ArrayList<QuestionMetaUpdate>()
        val solutionUpdates = ArrayList<QuestionSolutionUpdate>()
        val categoryUpdates = ArrayList<QuestionCategoryUpdate>()
        val addCategories = LinkedHashMap<CqLabel, List<String>>()
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
                if (stored.id in input.deletedQuestionIds) continue
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
                val wantedType = input.questionTypes[sub.label] ?: stored.questionTypeId
                val wantedMarks = input.marksByLabel[sub.label] ?: stored.marks
                if (wantedType.isBlank()) return Checked.TooLong("প্রশ্নের ধরন")
                if (!wantedMarks.isFinite() || wantedMarks <= 0.0) return Checked.TooLong("নম্বর")
                if (wantedType != stored.questionTypeId || wantedMarks != stored.marks) {
                    metadataUpdates.add(QuestionMetaUpdate(stored.id, sub.label, wantedType, wantedMarks))
                }
                val desiredSolutions = input.solutionsByLabel[sub.label]?.map(QuestionRules::clean)?.filter { it.isNotEmpty() }
                if (desiredSolutions != null) {
                    if (desiredSolutions.any { it.length > QuestionRules.MAX_TEXT_LENGTH }) return Checked.TooLong("সমাধান")
                    if (desiredSolutions != stored.solutionParts) solutionUpdates.add(QuestionSolutionUpdate(stored.id, desiredSolutions))
                }
                val desiredCategories = wantedCategories?.get(sub.label)
                if (desiredCategories != null && desiredCategories.toSet() != stored.categoryIds.toSet()) {
                    categoryUpdates.add(QuestionCategoryUpdate(stored.id, desiredCategories.toList()))
                }
            } else {
                if (text.isEmpty()) {
                    if (answer.isNotEmpty()) return Checked.MissingText(sub.label)
                    continue
                }
                if (!hasStimulus) continue // a single question never gains new sub-questions
                if (text.length > QuestionRules.MAX_TEXT_LENGTH) return Checked.TooLong("${sub.label.letter}) প্রশ্ন")
                if (answer.length > QuestionRules.MAX_TEXT_LENGTH) return Checked.TooLong("${sub.label.letter}) উত্তর")
                val wantedType = input.questionTypes[sub.label] ?: sub.questionTypeId
                val wantedMarks = input.marksByLabel[sub.label] ?: sub.marks
                if (wantedType.isBlank()) return Checked.TooLong("প্রশ্নের ধরন")
                if (!wantedMarks.isFinite() || wantedMarks <= 0.0) return Checked.TooLong("নম্বর")
                val solutions = input.solutionsByLabel[sub.label]?.map(QuestionRules::clean)?.filter { it.isNotEmpty() }.orEmpty()
                if (solutions.any { it.length > QuestionRules.MAX_TEXT_LENGTH }) return Checked.TooLong("সমাধান")
                adds.add(SubQuestionInput(sub.label, text, answer, wantedType, wantedMarks, solutions))
                if (wanted != null && wanted.byLabel.containsKey(sub.label)) addRatings[sub.label] = wanted.byLabel[sub.label]
                val newTags = wantedBoards?.byLabel?.get(sub.label)
                if (newTags != null) addBoards[sub.label] = BoardRules.normalizeTags(newTags)
                wantedCategories?.get(sub.label)?.let { addCategories[sub.label] = it.toList() }
            }
        }
        if (deleteIds.size >= original.subQuestions.size + adds.size) return Checked.BadDeletion
        if (newStimulus == null && newReference == null && updates.isEmpty() && adds.isEmpty() && stimulusRating == null && ratingUpdates.isEmpty() &&
            stimulusBoards == null && boardUpdates.isEmpty() && metadataUpdates.isEmpty() && solutionUpdates.isEmpty() &&
            deleteIds.isEmpty() && categoryUpdates.isEmpty()
        ) return Checked.NoChange
        return Checked.Ok(newStimulus, updates, adds, stimulusRating, ratingUpdates, addRatings, stimulusBoards, boardUpdates, addBoards, newReference, metadataUpdates, solutionUpdates, deleteIds, categoryUpdates, addCategories)
    }
}
