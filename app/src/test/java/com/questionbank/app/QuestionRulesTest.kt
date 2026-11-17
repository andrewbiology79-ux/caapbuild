package com.questionbank.app

import com.questionbank.app.data.local.SeedData
import com.questionbank.app.domain.question.CqLabel
import com.questionbank.app.domain.question.DraftText
import com.questionbank.app.domain.question.QuestionGroupInput
import com.questionbank.app.domain.question.QuestionRules
import com.questionbank.app.domain.question.SubQuestionInput
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class QuestionRulesTest {
    private fun input(stimulus: String = "", vararg subs: Triple<CqLabel, String, String>) =
        QuestionGroupInput("t1", stimulus, subs.map { SubQuestionInput(it.first, it.second, it.third) })

    @Test
    fun allBlankIsEmpty() {
        val checked = QuestionRules.check(input("  ", Triple(CqLabel.KA, " ", ""), Triple(CqLabel.KHA, "\n", "")))
        assertEquals(QuestionRules.Checked.Empty, checked)
    }

    @Test
    fun stimulusWithoutAnyQuestionIsEmpty() {
        assertEquals(QuestionRules.Checked.Empty, QuestionRules.check(input("উদ্দীপক", Triple(CqLabel.KA, "", ""))))
    }

    @Test
    fun answerWithoutQuestionTextIsReportedNotDropped() {
        val checked = QuestionRules.check(input("", Triple(CqLabel.KA, "প্রশ্ন", ""), Triple(CqLabel.GA, "", "উত্তর")))
        assertEquals(QuestionRules.Checked.MissingText(CqLabel.GA), checked)
    }

    @Test
    fun onlyNonBlankSubQuestionsAreKeptInLabelOrder() {
        val checked = QuestionRules.check(
            input(" উদ্দীপক ", Triple(CqLabel.KA, " ক-প্রশ্ন ", ""), Triple(CqLabel.KHA, "", ""), Triple(CqLabel.GHA, "ঘ-প্রশ্ন", " উত্তর "))
        ) as QuestionRules.Checked.Ok
        assertEquals("উদ্দীপক", checked.stimulusText)
        assertEquals(listOf(CqLabel.KA, CqLabel.GHA), checked.items.map { it.label })
        assertEquals("ক-প্রশ্ন", checked.items[0].text)
        assertEquals("উত্তর", checked.items[1].shortAnswer)
    }

    @Test
    fun blankStimulusBecomesEmptyString() {
        val checked = QuestionRules.check(input("   ", Triple(CqLabel.KA, "প্রশ্ন", ""))) as QuestionRules.Checked.Ok
        assertEquals("", checked.stimulusText)
    }

    @Test
    fun nuktaSpellingsAreStoredTheSameWay() {
        assertEquals(QuestionRules.clean("সম\u09AF\u09BC"), QuestionRules.clean("সম\u09DF"))
    }

    @Test
    fun lineBreaksInsideTheTextAreKept() {
        assertEquals("প্রথম\nদ্বিতীয়", QuestionRules.clean("\n প্রথম\nদ্বিতীয় \n"))
    }

    @Test
    fun tooLongTextIsRejected() {
        val long = "ক".repeat(QuestionRules.MAX_TEXT_LENGTH + 1)
        assertTrue(QuestionRules.check(input("", Triple(CqLabel.KA, long, ""))) is QuestionRules.Checked.TooLong)
        assertTrue(QuestionRules.check(input(long, Triple(CqLabel.KA, "প্রশ্ন", ""))) is QuestionRules.Checked.TooLong)
        val max = "ক".repeat(QuestionRules.MAX_TEXT_LENGTH)
        assertTrue(QuestionRules.check(input("", Triple(CqLabel.KA, max, ""))) is QuestionRules.Checked.Ok)
    }

    @Test
    fun labelsHaveFixedMarksAndDistinctTypes() {
        assertEquals(listOf(1.0, 2.0, 3.0, 4.0), CqLabel.entries.map { it.marks })
        assertEquals(4, CqLabel.entries.map { it.typeId }.toSet().size)
        assertEquals(4, CqLabel.entries.map { it.typeCode }.toSet().size)
        assertEquals(CqLabel.GA, CqLabel.fromLetter("গ"))
    }

    @Test
    fun seedHasOneIdempotentStatementPerLabel() {
        assertEquals(4, SeedData.statements.size)
        assertTrue(SeedData.statements.all { it.startsWith("INSERT OR IGNORE INTO type_cq_question_types") })
        CqLabel.entries.forEach { l -> assertTrue(SeedData.statements.any { it.contains("'${l.typeId}'") }) }
    }

    @Test
    fun draftBlankDetection() {
        assertTrue(DraftText().isBlank)
        assertTrue(DraftText(stimulus = "  ", texts = listOf("", " ", "", "")).isBlank)
        assertTrue(!DraftText(answers = listOf("", "", "x", "")).isBlank)
    }
}
