package com.questionbank.app.domain.question

/**
 * Pure rules for saving an EXISTING group (v0.2.28; no database, no Android classes).
 *
 * Same cleaning and limits as a new save ([QuestionRules]). What an edit may NOT do: blank the text of a stored sub-question or
 * the stimulus of a group that has one (that is a delete, a later package). What it may do: change texts and short answers, and
 * add a sub-question for a label that was empty (only in a group with a stimulus). Marks and types never change here.
 * Nothing that equals the stored value is written again, so a save without a real change is [Checked.NoChange].
 */
object QuestionEditRules {
    sealed interface Checked {
        /** [stimulusText] is null when the stimulus stays as it is. */
        data class Ok(val stimulusText: String?, val updates: List<QuestionUpdate>, val adds: List<SubQuestionInput>) : Checked
        data object NoChange : Checked
        data class BlankedQuestion(val label: CqLabel) : Checked
        data object BlankedStimulus : Checked
        data class MissingText(val label: CqLabel) : Checked
        data class TooLong(val field: String) : Checked
    }

    fun check(original: SavedGroup, input: GroupEditInput): Checked {
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
        for (sub in input.subQuestions) {
            val text = QuestionRules.clean(sub.text)
            val answer = QuestionRules.clean(sub.shortAnswer)
            val stored = original.subQuestions.firstOrNull { it.label == sub.label }
            if (stored != null) {
                if (text.isEmpty()) return Checked.BlankedQuestion(sub.label)
                if (text.length > QuestionRules.MAX_TEXT_LENGTH) return Checked.TooLong("${sub.label.letter}) প্রশ্ন")
                if (answer.length > QuestionRules.MAX_TEXT_LENGTH) return Checked.TooLong("${sub.label.letter}) উত্তর")
                if (text != stored.text || answer != stored.shortAnswer) updates.add(QuestionUpdate(stored.id, sub.label, text, answer))
            } else {
                if (text.isEmpty()) {
                    if (answer.isNotEmpty()) return Checked.MissingText(sub.label)
                    continue
                }
                if (!hasStimulus) continue // a single question never gains new sub-questions
                if (text.length > QuestionRules.MAX_TEXT_LENGTH) return Checked.TooLong("${sub.label.letter}) প্রশ্ন")
                if (answer.length > QuestionRules.MAX_TEXT_LENGTH) return Checked.TooLong("${sub.label.letter}) উত্তর")
                adds.add(SubQuestionInput(sub.label, text, answer))
            }
        }
        if (newStimulus == null && updates.isEmpty() && adds.isEmpty()) return Checked.NoChange
        return Checked.Ok(newStimulus, updates, adds)
    }
}
