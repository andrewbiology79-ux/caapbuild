package com.questionbank.app.domain.question

/**
 * The four CQ sub-questions. Each label has a fixed question type and fixed marks (ক 1, খ 2, গ 3, ঘ 4).
 * [typeId] must equal the id seeded by `SeedData` (the foreign key needs it).
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
data class SubQuestionInput(val label: CqLabel, val text: String, val shortAnswer: String)

/** Everything typed in the editor: an optional stimulus (উদ্দীপক) and the four sub-question blocks. */
data class QuestionGroupInput(
    val topicId: String,
    val stimulusText: String,
    val subQuestions: List<SubQuestionInput>,
)

/** Raw editor text, used for the automatic draft. Index 0..3 = ক, খ, গ, ঘ. */
data class DraftText(
    val stimulus: String = "",
    val texts: List<String> = List(4) { "" },
    val answers: List<String> = List(4) { "" },
) {
    val isBlank: Boolean
        get() = stimulus.isBlank() && texts.all { it.isBlank() } && answers.all { it.isBlank() }
}

/** One saved sub-question as the list shows it. */
data class SavedSubQuestion(
    val id: String,
    val label: CqLabel?,
    val marks: Double,
    val text: String,
    val shortAnswer: String,
    /** The question's own rating 1-5, or null when none was saved (the editor does not set ratings yet). */
    val rating: Int? = null,
)

/** One stimulus with its sub-questions, or one single question without a stimulus. */
data class SavedGroup(
    val stimulusId: String?,
    val stimulusText: String,
    val subQuestions: List<SavedSubQuestion>,
    /** The stimulus rating 1-5, or null. Together with the question ratings it gives the card rating (rule U-1). */
    val stimulusRating: Int? = null,
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
)

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
