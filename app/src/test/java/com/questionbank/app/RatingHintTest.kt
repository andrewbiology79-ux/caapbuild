package com.questionbank.app

import com.questionbank.app.ui.question.ratingHint
import org.junit.Assert.assertEquals
import org.junit.Test

/** The sentence under the rating buttons (v0.2.30b). */
class RatingHintTest {
    @Test
    fun noRatingSaysTheCardWillShowThree() {
        assertEquals("রেটিং বাছা হয়নি (কার্ডে ৩★ দেখাবে)", ratingHint(null))
    }

    @Test
    fun aRatingShowsBengaliDigitAndName() {
        assertEquals("১★ · সহজ", ratingHint(1))
        assertEquals("৫★ · চ্যালেঞ্জিং", ratingHint(5))
    }

    @Test
    fun everyRatingHasADistinctHint() {
        assertEquals(5, (1..5).map { ratingHint(it) }.toSet().size)
    }
}
