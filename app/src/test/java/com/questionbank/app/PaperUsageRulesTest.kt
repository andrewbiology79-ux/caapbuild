package com.questionbank.app

import com.questionbank.app.domain.question.PaperUsage
import com.questionbank.app.domain.question.latestPaperCategoryUsages
import org.junit.Assert.assertEquals
import org.junit.Test

class PaperUsageRulesTest {
    @Test
    fun returnsOneChipPerCategoryOrderedByLatestQuestionPaperLink() {
        val usages = listOf(
            PaperUsage("paper-old", "Old", "Old paper", "cat-a", "প্রথম ক্যাটাগরি", 100L),
            PaperUsage("paper-new", "New", "New paper", "cat-b", "দ্বিতীয় ক্যাটাগরি", 300L),
            PaperUsage("paper-a-latest", "A latest", "A latest paper", "cat-a", "প্রথম ক্যাটাগরি", 500L),
            PaperUsage("paper-c", "C", "C paper", "cat-c", "তৃতীয় ক্যাটাগরি", 200L),
        )

        val result = latestPaperCategoryUsages(usages)

        assertEquals(listOf("cat-a", "cat-b", "cat-c"), result.map { it.categoryId })
        assertEquals(listOf("paper-a-latest", "paper-new", "paper-c"), result.map { it.paperId })
    }

    @Test
    fun skipsRowsWithoutAUsablePaperCategory() {
        val usages = listOf(
            PaperUsage("paper-empty", "", "", "", "", 500L),
            PaperUsage("paper-valid", "Valid", "Valid paper", "cat-a", "ক্যাটাগরি", 100L),
        )

        assertEquals(listOf("cat-a"), latestPaperCategoryUsages(usages).map { it.categoryId })
    }
}
