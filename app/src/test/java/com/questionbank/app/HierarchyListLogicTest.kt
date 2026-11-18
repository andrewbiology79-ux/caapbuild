package com.questionbank.app

import com.questionbank.app.domain.hierarchy.HierarchyRow
import com.questionbank.app.ui.hierarchy.blockedDeleteText
import com.questionbank.app.ui.hierarchy.countLine
import com.questionbank.app.ui.hierarchy.moved
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/** Pure helpers of the hierarchy list screens (v0.2.26): reorder arrows, count line, text of the refused delete. */
class HierarchyListLogicTest {
    private fun row(name: String, children: Int, questions: Int) = HierarchyRow("id-$name", name, children, questions)

    @Test
    fun movingUpSwapsWithThePreviousItem() {
        assertEquals(listOf("b", "a", "c"), listOf("a", "b", "c").moved(1, -1))
    }

    @Test
    fun movingDownSwapsWithTheNextItem() {
        assertEquals(listOf("a", "c", "b"), listOf("a", "b", "c").moved(1, +1))
    }

    @Test
    fun movingTheFirstItemUpOrTheLastItemDownChangesNothing() {
        val list = listOf("a", "b", "c")
        assertSame(list, list.moved(0, -1))
        assertSame(list, list.moved(2, +1))
    }

    @Test
    fun anIndexOutsideTheListChangesNothing() {
        val list = listOf("a", "b")
        assertSame(list, list.moved(5, -1))
        assertSame(list, list.moved(-1, +1))
    }

    @Test
    fun movingDoesNotChangeTheOriginalList() {
        val list = listOf("a", "b", "c")
        list.moved(0, +1)
        assertEquals(listOf("a", "b", "c"), list)
    }

    @Test
    fun countLineShowsChildrenAndQuestionsInBengaliDigits() {
        assertEquals("২ টি অধ্যায় · ১৪ টি প্রশ্ন", countLine(row("পদার্থ", 2, 14), "অধ্যায়"))
    }

    @Test
    fun countLineOfATopicShowsOnlyQuestions() {
        assertEquals("৩ টি প্রশ্ন", countLine(row("গতি", 0, 3), null))
    }

    @Test
    fun blockedTextForInnerItemsOnlyTellsToDeleteThemFirst() {
        assertEquals(
            "‘পদার্থ’ খালি নয়: এতে ২ টি অধ্যায় আছে, তাই মুছে ফেলা যাবে না। আগে ভেতরের অধ্যায় মুছে ফেলুন।",
            blockedDeleteText(row("পদার্থ", 2, 0), "অধ্যায়"),
        )
    }

    @Test
    fun blockedTextForQuestionsPointsToALaterVersion() {
        assertEquals(
            "‘গতি’ খালি নয়: এতে ৫ টি প্রশ্ন আছে, তাই মুছে ফেলা যাবে না। প্রশ্ন মুছে ফেলার সুবিধা পরের সংস্করণে আসছে।",
            blockedDeleteText(row("গতি", 0, 5), null),
        )
    }

    @Test
    fun blockedTextNamesBothCountsWhenBothExist() {
        val text = blockedDeleteText(row("পদার্থ", 2, 7), "অধ্যায়")
        assertTrue(text, text.contains("এতে ২ টি অধ্যায় ও ৭ টি প্রশ্ন আছে"))
    }

    @Test
    fun aRowIsEmptyOnlyWithoutChildrenAndQuestions() {
        assertTrue(row("a", 0, 0).isEmpty)
        assertFalse(row("a", 1, 0).isEmpty)
        assertFalse(row("a", 0, 1).isEmpty)
    }
}
