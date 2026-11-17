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
)

/** One stimulus with its sub-questions, or one single question without a stimulus. */
data class SavedGroup(
    val stimulusId: String?,
    val stimulusText: String,
    val subQuestions: List<SavedSubQuestion>,
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
