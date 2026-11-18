package com.questionbank.app

import com.questionbank.app.domain.question.CqLabel
import com.questionbank.app.domain.question.QuestionCardRules
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.domain.question.SavedSubQuestion
import org.junit.Assert.assertEquals
import org.junit.Test

/** Rating shown on a card, rule U-1 (plan 39.5). */
class QuestionCardRulesTest {
    private fun sub(id: String, rating: Int?) = SavedSubQuestion(id, CqLabel.KA, 1.0, "t", "", rating)
    private fun group(stimulusRating: Int?, vararg subs: SavedSubQuestion, stimulusId: String? = "s") =
        SavedGroup(stimulusId, "u", subs.toList(), stimulusRating)

    @Test
    fun stimulusRatingWinsWhenSaved() {
        assertEquals(5, QuestionCardRules.rating(group(5, sub("a", 1), sub("b", 2))))
    }

    @Test
    fun withoutStimulusRatingTheQuestionRatingsAreAveraged() {
        assertEquals(2, QuestionCardRules.rating(group(null, sub("a", 1), sub("b", 3))))
        assertEquals(4, QuestionCardRules.rating(group(null, sub("a", 4), sub("b", null))))
    }

    @Test
    fun anAverageTieRoundsUp() {
        assertEquals(3, QuestionCardRules.rating(group(null, sub("a", 2), sub("b", 3))))
    }

    @Test
    fun noRatingAnywhereGivesThree() {
        assertEquals(3, QuestionCardRules.rating(group(null, sub("a", null))))
        assertEquals(3, QuestionCardRules.rating(group(null, sub("a", null), stimulusId = null)))
    }
}
