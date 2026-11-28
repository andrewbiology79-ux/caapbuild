package com.questionbank.app

import com.questionbank.app.domain.question.CqLabel
import com.questionbank.app.domain.question.GroupEditInput
import com.questionbank.app.domain.question.QuestionEditRules
import com.questionbank.app.domain.question.QuestionEditRules.Checked
import com.questionbank.app.domain.question.QuestionGroupKey
import com.questionbank.app.domain.question.QuestionRules
import com.questionbank.app.domain.question.QuestionUpdate
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.domain.question.SavedSubQuestion
import com.questionbank.app.domain.question.SubQuestionInput
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Pure rules of saving an existing group (v0.2.28): what changed, what is refused. No database. */
class QuestionEditRulesTest {
    private fun sub(id: String, label: CqLabel, text: String, answer: String = "") = SavedSubQuestion(id, label, label.marks, text, answer)

    /** A card with a stimulus and two stored sub-questions (ক, খ). */
    private val stored = SavedGroup(
        stimulusId = "s1",
        stimulusText = "উদ্দীপক",
        subQuestions = listOf(sub("q1", CqLabel.KA, "ক-প্রশ্ন", "ক-উত্তর"), sub("q2", CqLabel.KHA, "খ-প্রশ্ন")),
    )

    private fun input(stimulus: String, vararg subs: Triple<CqLabel, String, String>) =
        GroupEditInput("t1", "s-s1", stimulus, subs.map { SubQuestionInput(it.first, it.second, it.third) })

    private fun same() = arrayOf(
        Triple(CqLabel.KA, "ক-প্রশ্ন", "ক-উত্তর"), Triple(CqLabel.KHA, "খ-প্রশ্ন", ""),
        Triple(CqLabel.GA, "", ""), Triple(CqLabel.GHA, "", ""),
    )

    @Test
    fun theSameTextIsNoChange() {
        assertEquals(Checked.NoChange, QuestionEditRules.check(stored, input("উদ্দীপক", *same())))
    }

    @Test
    fun spacesAtTheEndsAndTheTwoSpellingsOfANuktaLetterAreNotAChange() {
        val group = stored.copy(subQuestions = listOf(sub("q1", CqLabel.KA, "সম\u09AF\u09BC কত?"))) // stored in NFC
        val typed = GroupEditInput("t1", "s-s1", "  উদ্দীপক \n", listOf(SubQuestionInput(CqLabel.KA, " সম\u09DF কত? ", "")))
        assertEquals(Checked.NoChange, QuestionEditRules.check(group, typed))
    }

    @Test
    fun aChangedQuestionTextIsAnUpdateOfThatQuestionOnly() {
        val subs = same().also { it[0] = Triple(CqLabel.KA, " নতুন ক-প্রশ্ন ", "ক-উত্তর") }
        val ok = QuestionEditRules.check(stored, input("উদ্দীপক", *subs)) as Checked.Ok
        assertNull(ok.stimulusText)
        assertEquals(listOf(QuestionUpdate("q1", CqLabel.KA, "নতুন ক-প্রশ্ন", "ক-উত্তর")), ok.updates)
        assertTrue(ok.adds.isEmpty())
    }

    @Test
    fun aChangedShortAnswerAloneIsAnUpdate() {
        val subs = same().also { it[1] = Triple(CqLabel.KHA, "খ-প্রশ্ন", "নতুন উত্তর") }
        val ok = QuestionEditRules.check(stored, input("উদ্দীপক", *subs)) as Checked.Ok
        assertEquals(listOf(QuestionUpdate("q2", CqLabel.KHA, "খ-প্রশ্ন", "নতুন উত্তর")), ok.updates)
    }

    @Test
    fun aChangedStimulusIsReportedAndTheQuestionsStayUntouched() {
        val ok = QuestionEditRules.check(stored, input(" নতুন উদ্দীপক ", *same())) as Checked.Ok
        assertEquals("নতুন উদ্দীপক", ok.stimulusText)
        assertTrue(ok.updates.isEmpty())
        assertTrue(ok.adds.isEmpty())
    }

    @Test
    fun blankingAStoredQuestionIsRefusedBecauseThatWouldBeADelete() {
        val subs = same().also { it[1] = Triple(CqLabel.KHA, "  ", "") }
        assertEquals(Checked.BlankedQuestion(CqLabel.KHA), QuestionEditRules.check(stored, input("উদ্দীপক", *subs)))
    }

    @Test
    fun blankingTheStimulusOfAGroupThatHasOneIsRefused() {
        assertEquals(Checked.BlankedStimulus, QuestionEditRules.check(stored, input("   ", *same())))
    }

    @Test
    fun aLabelThatWasEmptyGetsANewSubQuestion() {
        val subs = same().also { it[2] = Triple(CqLabel.GA, " গ-প্রশ্ন ", " গ-উত্তর ") }
        val ok = QuestionEditRules.check(stored, input("উদ্দীপক", *subs)) as Checked.Ok
        assertEquals(listOf(SubQuestionInput(CqLabel.GA, "গ-প্রশ্ন", "গ-উত্তর")), ok.adds)
        assertTrue(ok.updates.isEmpty())
    }

    @Test
    fun aShortAnswerForAnEmptyLabelIsReportedNotDropped() {
        val subs = same().also { it[3] = Triple(CqLabel.GHA, "", "উত্তর") }
        assertEquals(Checked.MissingText(CqLabel.GHA), QuestionEditRules.check(stored, input("উদ্দীপক", *subs)))
    }

    @Test
    fun aSingleQuestionEditsOnlyItsOwnBlockAndNeverGainsNewOnes() {
        val single = SavedGroup(null, "", listOf(sub("q9", CqLabel.GA, "গ-প্রশ্ন")))
        val typed = GroupEditInput(
            "t1", "q-q9", "ignored stimulus text",
            listOf(SubQuestionInput(CqLabel.GA, "নতুন গ-প্রশ্ন", ""), SubQuestionInput(CqLabel.GHA, "অতিরিক্ত", "")),
        )
        val ok = QuestionEditRules.check(single, typed) as Checked.Ok
        assertNull(ok.stimulusText)
        assertEquals(listOf(QuestionUpdate("q9", CqLabel.GA, "নতুন গ-প্রশ্ন", "")), ok.updates)
        assertTrue(ok.adds.isEmpty())
    }

    @Test
    fun theLimitsOfANewSaveApplyToAnEdit() {
        val long = "ক".repeat(QuestionRules.MAX_TEXT_LENGTH + 1)
        assertEquals(Checked.TooLong("উদ্দীপক"), QuestionEditRules.check(stored, input(long, *same())))
        val q = same().also { it[0] = Triple(CqLabel.KA, long, "") }
        assertEquals(Checked.TooLong("ক) প্রশ্ন"), QuestionEditRules.check(stored, input("উদ্দীপক", *q)))
        val a = same().also { it[1] = Triple(CqLabel.KHA, "খ-প্রশ্ন", long) }
        assertEquals(Checked.TooLong("খ) উত্তর"), QuestionEditRules.check(stored, input("উদ্দীপক", *a)))
        val n = same().also { it[2] = Triple(CqLabel.GA, long, "") }
        assertEquals(Checked.TooLong("গ) প্রশ্ন"), QuestionEditRules.check(stored, input("উদ্দীপক", *n)))
    }

    @Test
    fun unusedEmptyLabelsAreIgnored() {
        val ok = QuestionEditRules.check(stored, input(" নতুন ", *same())) as Checked.Ok
        assertTrue(ok.adds.isEmpty())
    }

    @Test
    fun groupKeyRoundTripsForAStimulusGroupAndForASingleQuestion() {
        assertEquals("s-s1", QuestionGroupKey.of(stored))
        assertEquals(QuestionGroupKey.Parsed.Stimulus("s1"), QuestionGroupKey.parse("s-s1"))
        val single = SavedGroup(null, "", listOf(sub("q9", CqLabel.KA, "প্রশ্ন")))
        assertEquals("q-q9", QuestionGroupKey.of(single))
        assertEquals(QuestionGroupKey.Parsed.Single("q9"), QuestionGroupKey.parse("q-q9"))
    }

    @Test
    fun badGroupKeysAreRejected() {
        for (key in listOf("", "s-", "q-", "x-abc", "abc", "s1")) assertNull("\"$key\"", QuestionGroupKey.parse(key))
    }

    @Test
    fun anEmptyGroupHasNoKey() {
        assertNull(QuestionGroupKey.of(SavedGroup(null, "", emptyList())))
    }
}
