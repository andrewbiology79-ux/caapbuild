package com.questionbank.app.domain.question

import kotlin.math.roundToInt

/** Pure rules of the question card (v0.2.27). */
object QuestionCardRules {
    const val DEFAULT_RATING = 3

    /**
     * Rating shown on a card (rule U-1, plan 39.5): the stimulus rating if one is saved; otherwise the question's own rating (a card
     * with several rated questions shows their average, ties rounded up); otherwise 3.
     */
    fun rating(group: SavedGroup): Int {
        group.stimulusRating?.let { return it }
        val own = group.subQuestions.mapNotNull { it.rating }
        if (own.isEmpty()) return DEFAULT_RATING
        return (own.sum().toDouble() / own.size).roundToInt()
    }
}
