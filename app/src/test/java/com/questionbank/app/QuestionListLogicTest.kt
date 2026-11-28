package com.questionbank.app

import com.questionbank.app.domain.question.CqLabel
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.domain.question.SavedSubQuestion
import com.questionbank.app.ui.question.cardCount
import com.questionbank.app.ui.question.foundLine
import com.questionbank.app.ui.question.ratingText
import com.questionbank.app.ui.question.totalLine
import com.questionbank.app.ui.question.typeCqRatingText
import org.junit.Assert.assertEquals
import org.junit.Test

/** Pure texts of the question list (v0.2.27). */
class QuestionListLogicTest {
    private fun sub(id: String) = SavedSubQuestion(id, CqLabel.KA, 1.0, "t", "")
    private val groups = listOf(
        SavedGroup("s1", "u", listOf(sub("a"), sub("b"), sub("c"), sub("d"))),
        SavedGroup(null, "", listOf(sub("e"))),
    )

    @Test
    fun countsSavedGroupsRatherThanSubQuestions() {
        assertEquals(2, cardCount(groups))
        assertEquals(0, cardCount(emptyList()))
    }

    @Test
    fun linesUseBengaliDigits() {
        assertEquals("মোট: ২", totalLine(groups))
        assertEquals("দৃশ্যমান: ২", foundLine(groups))
        assertEquals("দৃশ্যমান: ১২", foundLine(List(12) { SavedGroup(null, "", listOf(sub("x$it"))) }))
    }

    @Test
    fun typeCqRatingBadgeShowsFilledAndEmptyStarsWithTheRatingName() {
        assertEquals("৩★", ratingText(3)) // Chapter CQ shared badge remains unchanged.
        assertEquals("★★★☆☆ মাঝারি", typeCqRatingText(3))
        assertEquals("★★★★★ চ্যালেঞ্জিং", typeCqRatingText(5))
        assertEquals("★☆☆☆☆ সহজ", typeCqRatingText(0))
    }
}
