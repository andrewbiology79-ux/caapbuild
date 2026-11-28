package com.questionbank.app

import com.questionbank.app.domain.question.CqLabel
import com.questionbank.app.domain.question.GroupEditInput
import com.questionbank.app.domain.question.QuestionEditRules
import com.questionbank.app.domain.question.QuestionGroupInput
import com.questionbank.app.domain.question.QuestionRatingUpdate
import com.questionbank.app.domain.question.QuestionRules
import com.questionbank.app.domain.question.RatingChange
import com.questionbank.app.domain.question.RatingRules
import com.questionbank.app.domain.question.RatingsInput
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.domain.question.SavedSubQuestion
import com.questionbank.app.domain.question.SubQuestionInput
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Ratings in the editor rules (v0.2.30, UI-07): what is stored on save and what counts as a change on edit. No database. */
class QuestionRatingRulesTest {
    private fun newInput(stimulus: String, ratings: RatingsInput?, vararg subs: Pair<CqLabel, String>) =
        QuestionGroupInput("t1", stimulus, subs.map { SubQuestionInput(it.first, it.second, "") }, ratings)

    private fun sub(id: String, label: CqLabel, text: String, rating: Int? = null) =
        SavedSubQuestion(id, label, label.marks, text, "", rating)

    private val stored = SavedGroup(
        stimulusId = "s1",
        stimulusText = "উদ্দীপক",
        subQuestions = listOf(sub("q1", CqLabel.KA, "ক-প্রশ্ন", 2), sub("q2", CqLabel.KHA, "খ-প্রশ্ন")),
        stimulusRating = 4,
    )

    private fun editInput(ratings: RatingsInput?) = GroupEditInput(
        "t1", "s-s1", "উদ্দীপক",
        listOf(
            SubQuestionInput(CqLabel.KA, "ক-প্রশ্ন", ""), SubQuestionInput(CqLabel.KHA, "খ-প্রশ্ন", ""),
            SubQuestionInput(CqLabel.GA, "", ""), SubQuestionInput(CqLabel.GHA, "", ""),
        ),
        ratings,
    )

    @Test
    fun ratingNamesAndRange() {
        assertEquals(listOf("সহজ", "মোটামুটি", "মাঝারি", "ভালো", "চ্যালেঞ্জিং"), (1..5).map { RatingRules.name(it) })
        assertTrue(RatingRules.isValid(null) && RatingRules.isValid(1) && RatingRules.isValid(5))
        assertTrue(!RatingRules.isValid(0) && !RatingRules.isValid(6))
    }

    @Test
    fun aNewGroupKeepsOnlyRatingsThatBelongToStoredBlocks() {
        val ratings = RatingsInput(stimulus = 5, byLabel = mapOf(CqLabel.KA to 1, CqLabel.GA to 4))
        val ok = QuestionRules.check(newInput("উদ্দীপক", ratings, CqLabel.KA to "প্রথম")) as QuestionRules.Checked.Ok
        assertEquals(5, ok.stimulusRating)
        assertEquals(mapOf<CqLabel, Int?>(CqLabel.KA to 1), ok.ratings) // গ has no text: its rating is not stored
    }

    @Test
    fun aStimulusRatingWithoutStimulusTextIsNotStored() {
        val ok = QuestionRules.check(newInput("  ", RatingsInput(stimulus = 3), CqLabel.KA to "প্রথম")) as QuestionRules.Checked.Ok
        assertNull(ok.stimulusRating)
    }

    @Test
    fun noRatingsGivesNoRatings() {
        val ok = QuestionRules.check(newInput("উদ্দীপক", null, CqLabel.KA to "প্রথম")) as QuestionRules.Checked.Ok
        assertNull(ok.stimulusRating)
        assertTrue(ok.ratings.isEmpty())
    }

    @Test
    fun aRatingOutsideOneToFiveIsRefusedOnSaveAndOnEdit() {
        val bad = RatingsInput(stimulus = 6)
        assertEquals(QuestionRules.Checked.BadRating, QuestionRules.check(newInput("উদ্দীপক", bad, CqLabel.KA to "প্রথম")))
        val bad2 = RatingsInput(byLabel = mapOf(CqLabel.KA to 0))
        assertEquals(QuestionEditRules.Checked.BadRating, QuestionEditRules.check(stored, editInput(bad2)))
    }

    @Test
    fun editWithoutRatingsLeavesStoredRatingsAlone() {
        assertEquals(QuestionEditRules.Checked.NoChange, QuestionEditRules.check(stored, editInput(null)))
    }

    @Test
    fun theSameRatingsAreNoChange() {
        val same = RatingsInput(stimulus = 4, byLabel = mapOf(CqLabel.KA to 2, CqLabel.KHA to null))
        assertEquals(QuestionEditRules.Checked.NoChange, QuestionEditRules.check(stored, editInput(same)))
    }

    @Test
    fun aRatingOnlyChangeIsARealChangeWithNoTextUpdate() {
        val wanted = RatingsInput(stimulus = 1, byLabel = mapOf(CqLabel.KA to null, CqLabel.KHA to 5))
        val ok = QuestionEditRules.check(stored, editInput(wanted)) as QuestionEditRules.Checked.Ok
        assertNull(ok.stimulusText)
        assertTrue(ok.updates.isEmpty())
        assertEquals(RatingChange(1), ok.stimulusRating)
        assertEquals(
            listOf(QuestionRatingUpdate("q1", CqLabel.KA, RatingChange(null)), QuestionRatingUpdate("q2", CqLabel.KHA, RatingChange(5))),
            ok.ratingUpdates,
        )
    }

    @Test
    fun aLabelAbsentFromTheMapKeepsItsRatingAndClearingTheStimulusRatingIsAChange() {
        val ok = QuestionEditRules.check(stored, editInput(RatingsInput(stimulus = null, byLabel = emptyMap()))) as QuestionEditRules.Checked.Ok
        assertEquals(RatingChange(null), ok.stimulusRating)
        assertTrue(ok.ratingUpdates.isEmpty())
    }

    @Test
    fun aNewSubQuestionAddedByEditCarriesItsRating() {
        val input = GroupEditInput(
            "t1", "s-s1", "উদ্দীপক",
            listOf(
                SubQuestionInput(CqLabel.KA, "ক-প্রশ্ন", ""), SubQuestionInput(CqLabel.KHA, "খ-প্রশ্ন", ""),
                SubQuestionInput(CqLabel.GA, "নতুন গ", ""), SubQuestionInput(CqLabel.GHA, "", ""),
            ),
            RatingsInput(stimulus = 4, byLabel = mapOf(CqLabel.GA to 3)),
        )
        val ok = QuestionEditRules.check(stored, input) as QuestionEditRules.Checked.Ok
        assertEquals(listOf(SubQuestionInput(CqLabel.GA, "নতুন গ", "")), ok.adds)
        assertEquals(mapOf<CqLabel, Int?>(CqLabel.GA to 3), ok.addRatings)
        assertNull(ok.stimulusRating)
    }

    @Test
    fun aSingleQuestionHasNoStimulusRatingToChange() {
        val single = SavedGroup(null, "", listOf(sub("q9", CqLabel.GA, "একক", 2)))
        val input = GroupEditInput(
            "t1", "q-q9", "",
            listOf(SubQuestionInput(CqLabel.GA, "একক", "")),
            RatingsInput(stimulus = 5, byLabel = mapOf(CqLabel.GA to 2)),
        )
        assertEquals(QuestionEditRules.Checked.NoChange, QuestionEditRules.check(single, input))
    }
}
