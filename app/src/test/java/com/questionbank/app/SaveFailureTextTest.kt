package com.questionbank.app

import com.questionbank.app.domain.question.SaveFailureText
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The save screens must name the real cause instead of one fixed "could not save" sentence. */
class SaveFailureTextTest {
    @Test
    fun aReasonWrittenForPeopleIsShownUnchanged() {
        assertEquals("অজানা বোর্ড: XYZ", SaveFailureText.explain("অজানা বোর্ড: XYZ"))
    }

    @Test
    fun foreignKeyFailureIsExplainedAndTheOriginalTextIsKept() {
        val text = SaveFailureText.message("SQLiteException: FOREIGN KEY constraint failed (code 787)", "আপনার লেখা ড্রাফটে আছে")
        assertTrue(text.contains("কারণ:"))
        assertTrue(text.contains("সংযোগ"))
        assertTrue(text.contains("FOREIGN KEY constraint failed"))
        assertTrue(text.contains("আপনার লেখা ড্রাফটে আছে"))
    }

    @Test
    fun readBackMismatchAndStorageFullAreRecognised() {
        assertTrue(SaveFailureText.explain("Type_CQ insert read-back mismatch; transaction rolled back").contains("বাতিল"))
        assertTrue(SaveFailureText.explain("database or disk is full (code 13)").contains("স্টোরেজ"))
    }

    @Test
    fun anUnknownTechnicalReasonIsStillShownSoACauseCanBeFound() {
        val text = SaveFailureText.message("something odd happened", "আগের লেখা অক্ষত আছে")
        assertTrue(text.contains("অপ্রত্যাশিত সমস্যা"))
        assertTrue(text.contains("something odd happened"))
    }

    @Test
    fun aBengaliReasonGetsNoTechnicalSuffix() {
        val text = SaveFailureText.message("প্রশ্নের ধরন ডাটাবেজে সক্রিয় নেই", "আপনার লেখা ড্রাফটে আছে")
        assertFalse(text.contains("বিস্তারিত"))
    }

    @Test
    fun anEmptyReasonStillProducesAMessage() {
        assertEquals("কারণ জানা যায়নি", SaveFailureText.explain(null))
        assertEquals("কারণ জানা যায়নি", SaveFailureText.explain("  "))
    }

    @Test
    fun aVeryLongTechnicalReasonIsShortened() {
        val text = SaveFailureText.message("x".repeat(1000), "নোট")
        assertTrue(text.length < 600)
    }
}
