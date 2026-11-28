package com.questionbank.app.domain.question

/**
 * Names one card (group) in a navigation route: "s-<stimulusId>" for a group with a stimulus, "q-<questionId>" for a single
 * question without one. Ids are UUIDs, so the key needs no escaping.
 */
object QuestionGroupKey {
    sealed interface Parsed {
        data class Stimulus(val id: String) : Parsed
        data class Single(val id: String) : Parsed
    }

    fun of(group: SavedGroup): String? =
        group.stimulusId?.let { "s-$it" } ?: group.subQuestions.firstOrNull()?.let { "q-${it.id}" }

    fun parse(key: String): Parsed? = when {
        key.length > 2 && key.startsWith("s-") -> Parsed.Stimulus(key.substring(2))
        key.length > 2 && key.startsWith("q-") -> Parsed.Single(key.substring(2))
        else -> null
    }
}
