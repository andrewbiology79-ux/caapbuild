package com.questionbank.app

import com.questionbank.app.domain.question.CqLabel
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.domain.question.SavedSubQuestion
import com.questionbank.app.ui.question.foundLine
import com.questionbank.app.ui.question.questionCount
import com.questionbank.app.ui.question.ratingText
import com.questionbank.app.ui.question.totalLine
import org.junit.Assert.assertEquals
import org.junit.Test

/** Pure texts of the question list (v0.2.27). */
class QuestionListLogicTest {
    private fun sub(id: String) = SavedSubQuestion(id, CqLabel.KA, 1.0, "t", "")
    private val groups = listOf(
        SavedGroup("s1", "u", listOf(sub("a"), sub("b"), sub("c"))),
        SavedGroup(null, "", listOf(sub("d"))),
    )

    @Test
    fun countsSubQuestionsNotCards() {
        assertEquals(4, questionCount(groups))
        assertEquals(0, questionCount(emptyList()))
    }

    @Test
    fun linesUseBengaliDigits() {
        assertEquals("মোট ৪ টি প্রশ্ন", totalLine(groups))
        assertEquals("৪ টি প্রশ্ন পাওয়া গেছে", foundLine(groups))
        assertEquals("১২ টি প্রশ্ন পাওয়া গেছে", foundLine(List(12) { SavedGroup(null, "", listOf(sub("x$it"))) }))
    }

    @Test
    fun ratingBadgeShowsABengaliDigitAndAStar() {
        assertEquals("৩★", ratingText(3))
        assertEquals("৫★", ratingText(5))
    }
}
