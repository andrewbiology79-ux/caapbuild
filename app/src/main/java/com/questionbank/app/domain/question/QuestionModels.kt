package com.questionbank.app.domain.question

/**
 * The four CQ sub-questions. Each label has a default type and marks (ক 1, খ 2, গ 3, ঘ 4);
 * Full Editor mode may change these values. [typeId] must match a seeded question-type id.
 */
enum class CqLabel(val letter: String, val typeId: String, val typeCode: String, val typeLabel: String, val marks: Double, val sortOrder: Int) {
    KA("ক", "qt_knowledge", "KNOWLEDGE", "জ্ঞানমূলক", 1.0, 1),
    KHA("খ", "qt_comprehension", "COMPREHENSION", "অনুধাবনমূলক", 2.0, 2),
    GA("গ", "qt_application", "APPLICATION", "প্রয়োগমূলক", 3.0, 3),
    GHA("ঘ", "qt_higher_order", "HIGHER_ORDER", "উচ্চতর দক্ষতা", 4.0, 4);

    companion object {
        fun fromLetter(letter: String): CqLabel? = entries.firstOrNull { it.letter == letter }
    }
}

/** What the person typed for one sub-question (raw, not yet cleaned). */
data class SubQuestionInput(
    val label: CqLabel,
    val text: String,
    val shortAnswer: String,
    val questionTypeId: String = label.typeId,
    val marks: Double = label.marks,
    val solutionParts: List<String> = emptyList(),
)

/**
 * Ratings chosen in the editor (v0.2.30, UI-07). A rating is 1-5 or null (= not saved; the card then shows 3 by rule U-1).
 * For a NEW group the map holds the labels the person rated. For an EDIT the object means "these are the wanted ratings":
 * [stimulus] null clears the stimulus rating, a label present with null clears that question's rating, a label that is
 * absent from [byLabel] keeps whatever is stored.
 */
data class RatingsInput(
    val stimulus: Int? = null,
    val byLabel: Map<CqLabel, Int?> = emptyMap(),
)

/** Names of the five ratings (plan 39.3). */
object RatingRules {
    const val MIN = 1
    const val MAX = 5
    private val NAMES = listOf("সহজ", "মোটামুটি", "মাঝারি", "ভালো", "চ্যালেঞ্জিং")

    fun isValid(rating: Int?): Boolean = rating == null || rating in MIN..MAX

    fun name(rating: Int): String = NAMES[(rating - MIN).coerceIn(0, NAMES.size - 1)]

    fun allValid(r: RatingsInput): Boolean = isValid(r.stimulus) && r.byLabel.values.all { isValid(it) }
}

/** Everything typed in the editor: an optional stimulus (উদ্দীপক) and the four sub-question blocks. */
data class QuestionGroupInput(
    val topicId: String,
    val stimulusText: String,
    val subQuestions: List<SubQuestionInput>,
    /** v0.2.30: null = no rating chosen. Ratings of a label without question text, and a stimulus rating without stimulus text, are not stored. */
    val ratings: RatingsInput? = null,
    /** v0.2.30c: null = no boards chosen. Boards of a label without question text, and stimulus boards without stimulus text, are not stored. */
    val boards: BoardsInput? = null,
    /** Reference text belongs to the stimulus record and is independent from its main text. */
    val referenceText: String = "",
)

/** Raw editor text, used for the automatic draft. Index 0..3 = ক, খ, গ, ঘ. */
data class DraftText(
    val stimulus: String = "",
    val texts: List<String> = List(4) { "" },
    val answers: List<String> = List(4) { "" },
    /** v0.2.30: the rating chosen for the stimulus and for ক..ঘ (1-5 or null). A rating alone is not content: see [isBlank]. */
    val stimulusRating: Int? = null,
    val ratings: List<Int?> = List(4) { null },
    /** v0.2.30c-2: boards and years chosen for the stimulus and for ক..ঘ, in the order chosen. Tags alone are not content: see [isBlank]. */
    val stimulusBoards: List<BoardTag> = emptyList(),
    val boards: List<List<BoardTag>> = List(4) { emptyList() },
    val referenceText: String = "",
    val questionTypeIds: List<String> = CqLabel.entries.map { it.typeId },
    val marks: List<Double> = CqLabel.entries.map { it.marks },
    val solutionTexts: List<List<String>> = List(4) { emptyList() },
) {
    val isBlank: Boolean
        get() = stimulus.isBlank() && referenceText.isBlank() && texts.all { it.isBlank() } && answers.all { it.isBlank() } && solutionTexts.all { row -> row.all { it.isBlank() } }
}

/** One saved sub-question as the list shows it. */
data class SavedSubQuestion(
    val id: String,
    val label: CqLabel?,
    val marks: Double,
    val text: String,
    val shortAnswer: String,
    /** The question's own rating 1-5, or null when none was saved (set in the editor since v0.2.30). */
    val rating: Int? = null,
    /** v0.2.30c: boards and years of this question, in the order they were chosen. */
    val boards: List<BoardTag> = emptyList(),
    val questionTypeId: String = label?.typeId.orEmpty(),
    val solutionParts: List<String> = emptyList(),
)

/** One stimulus with its sub-questions, or one single question without a stimulus. */
data class SavedGroup(
    val stimulusId: String?,
    val stimulusText: String,
    val subQuestions: List<SavedSubQuestion>,
    /** The stimulus rating 1-5, or null. Together with the question ratings it gives the card rating (rule U-1). */
    val stimulusRating: Int? = null,
    /** v0.2.30c: boards and years of the stimulus, in the order they were chosen. */
    val stimulusBoards: List<BoardTag> = emptyList(),
    val referenceText: String = "",
)

sealed interface SaveResult {
    data class Saved(val stimulusId: String?, val questionIds: List<String>) : SaveResult
    /** Nothing to save: no sub-question has text. */
    data object Empty : SaveResult
    /** A short answer was typed for a sub-question whose question text is empty (nothing is dropped silently). */
    data class MissingQuestionText(val label: CqLabel) : SaveResult
    data class TooLong(val field: String) : SaveResult
    data object TopicMissing : SaveResult
    /** The database refused the write, or the read-back after the write did not match. Nothing was stored. */
    data class Failed(val reason: String) : SaveResult
}

/** Result of a search inside one topic (v0.2.27). */
sealed interface SearchOutcome {
    /** The typed text has no usable word (empty, or only punctuation). Nothing was searched. */
    data object NoTerms : SearchOutcome
    /** [groups] is empty when nothing matched. A group holds only the matching sub-questions, or all of them when its stimulus matched. */
    data class Found(val groups: List<SavedGroup>) : SearchOutcome
    data class Failed(val reason: String) : SearchOutcome
}

/**
 * What the edit screen hands over when an EXISTING group is saved (v0.2.28). [groupKey] comes from [QuestionGroupKey].
 * [subQuestions] holds the blocks the person could edit: all four labels for a group with a stimulus, only the question's own
 * label for a single question. [stimulusText] is ignored for a single question.
 */
data class GroupEditInput(
    val topicId: String,
    val groupKey: String,
    val stimulusText: String,
    val subQuestions: List<SubQuestionInput>,
    /** v0.2.30: null = leave every stored rating untouched (the older screens pass nothing). See [RatingsInput] for the meaning when given. */
    val ratings: RatingsInput? = null,
    /** v0.2.30c: null = leave every stored board tag untouched. See [BoardsInput] for the meaning when given. */
    val boards: BoardsInput? = null,
    /** null means keep the stored reference unchanged. */
    val referenceText: String? = null,
    val questionTypes: Map<CqLabel, String> = emptyMap(),
    val marksByLabel: Map<CqLabel, Double> = emptyMap(),
    val solutionsByLabel: Map<CqLabel, List<String>> = emptyMap(),
)

data class QuestionMetaUpdate(val questionId: String, val label: CqLabel, val questionTypeId: String, val marks: Double)
data class QuestionSolutionUpdate(val questionId: String, val parts: List<String>)

/** A rating that changes to [value] (null = cleared). Used where "no change" must be told apart from "cleared". */
data class RatingChange(val value: Int?)

/** One stored sub-question whose rating changes (v0.2.30). */
data class QuestionRatingUpdate(val questionId: String, val label: CqLabel, val change: RatingChange)

/** New cleaned text and short answer for one stored sub-question. */
data class QuestionUpdate(val questionId: String, val label: CqLabel, val text: String, val answer: String)

sealed interface UpdateResult {
    /** Written in one transaction and read back. */
    data object Updated : UpdateResult
    /** Nothing differs from what is stored; nothing was written. */
    data object NoChange : UpdateResult
    /** The text of a stored sub-question was blanked. That would be a delete (a later package), so nothing was written. */
    data class BlankedQuestion(val label: CqLabel) : UpdateResult
    /** The stimulus of a group that has one was blanked. Nothing was written. */
    data object BlankedStimulus : UpdateResult
    /** A short answer was typed for a label that has no question text. */
    data class MissingQuestionText(val label: CqLabel) : UpdateResult
    data class TooLong(val field: String) : UpdateResult
    /** The group (or its topic) no longer exists. */
    data object GroupMissing : UpdateResult
    /** The database refused the write, or the read-back did not match. Nothing was changed. */
    data class Failed(val reason: String) : UpdateResult
}
