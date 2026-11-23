package com.questionbank.app

import com.questionbank.app.domain.question.BoardItem
import com.questionbank.app.domain.question.BoardRules
import com.questionbank.app.domain.question.BoardTag
import com.questionbank.app.domain.question.CqLabel
import com.questionbank.app.domain.question.DraftText
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.domain.question.SavedSubQuestion
import com.questionbank.app.ui.question.cardHasNoTags
import com.questionbank.app.ui.question.cardTopTags
import com.questionbank.app.ui.question.tagText
import com.questionbank.app.ui.question.yearInputError
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The pure rules behind the board + year picker and the chips (v0.2.30c-2, UI-08). No Compose, no database. */
class BoardPickerLogicTest {
    private val dha = BoardTag("DHA", 2019)
    private val raj = BoardTag("RAJ", 2020)
    private val catalog = listOf(
        BoardItem("DHA", "ঢাকা", isCustom = false, isArchived = false),
        BoardItem("RAJ", "রাজশাহী", isCustom = false, isArchived = false),
    )

    private fun sub(id: String, boards: List<BoardTag> = emptyList()) =
        SavedSubQuestion(id, CqLabel.KA, 1.0, "প্রশ্ন", "", null, boards)

    @Test
    fun yearWindowIsNewestFirstAndHasTwelveYears() {
        val w = BoardRules.yearWindow(2026)
        assertEquals(BoardRules.YEAR_WINDOW_SIZE, w.size)
        assertEquals(2026, w.first())
        assertEquals(2015, w.last())
        assertEquals(w.sortedDescending(), w)
    }

    @Test
    fun yearWindowNeverLeavesTheAllowedRange() {
        assertTrue(BoardRules.yearWindow(1905).all { it >= BoardRules.MIN_YEAR })
        assertEquals(BoardRules.MAX_YEAR, BoardRules.yearWindow(9999).first())
        assertTrue(BoardRules.yearWindow(1800).all { BoardRules.isValidYear(it) })
    }

    @Test
    fun addTagKeepsOrderAndIgnoresDuplicates() {
        assertEquals(listOf(dha, raj), BoardRules.addTag(listOf(dha), raj))
        assertEquals(listOf(dha), BoardRules.addTag(listOf(dha), dha))
    }

    @Test
    fun addTagStopsAtTheLimit() {
        val full = (0 until BoardRules.MAX_TAGS_PER_BLOCK).map { BoardTag("DHA", 1990 + it) }
        assertTrue(BoardRules.isFull(full))
        assertEquals(full, BoardRules.addTag(full, BoardTag("RAJ", 2020)))
        assertTrue(!BoardRules.isFull(full.drop(1)))
    }

    @Test
    fun removeTagRemovesOnlyThatTag() {
        assertEquals(listOf(raj), BoardRules.removeTag(listOf(dha, raj), dha))
        assertEquals(listOf(dha, raj), BoardRules.removeTag(listOf(dha, raj), BoardTag("CTG", 2020)))
    }

    @Test
    fun tagTextShowsOnlyBoardCodeAndBengaliYear() {
        assertEquals("DHA · ২০১৯", tagText(dha, catalog))
        assertEquals("CTG · ২০২১", tagText(BoardTag("CTG", 2021), catalog))
    }

    @Test
    fun cardTopRowShowsStimulusTagsOrTheSingleQuestionTags() {
        val withStimulus = SavedGroup("s1", "উদ্দীপক", listOf(sub("q1", listOf(raj))), null, listOf(dha))
        assertEquals(listOf(dha), cardTopTags(withStimulus))
        val single = SavedGroup(null, "", listOf(sub("q2", listOf(raj))), null, emptyList())
        assertEquals(listOf(raj), cardTopTags(single))
    }

    @Test
    fun noTagsMessageOnlyWhenNothingOnTheCardIsTagged() {
        assertTrue(cardHasNoTags(SavedGroup("s1", "উ", listOf(sub("q1")), null, emptyList())))
        assertTrue(!cardHasNoTags(SavedGroup("s1", "উ", listOf(sub("q1", listOf(raj))), null, emptyList())))
        assertTrue(!cardHasNoTags(SavedGroup("s1", "উ", listOf(sub("q1")), null, listOf(dha))))
        // Only question tags on a group with a stimulus: the top row is empty (the tags show with the question).
        val onlyQuestion = SavedGroup("s1", "উ", listOf(sub("q1", listOf(raj))), null, emptyList())
        assertTrue(cardTopTags(onlyQuestion).isEmpty())
    }

    @Test
    fun typedYearErrorOnlyForANonEmptyBadYear() {
        assertNull(yearInputError("", BoardRules::parseYear))
        assertNull(yearInputError("২০১৫", BoardRules::parseYear))
        assertNull(yearInputError("2015", BoardRules::parseYear))
        assertTrue(yearInputError("20", BoardRules::parseYear) != null)
        assertTrue(yearInputError("3000", BoardRules::parseYear) != null)
    }

    @Test
    fun tagsAloneAreNotDraftContent() {
        assertTrue(DraftText(stimulusBoards = listOf(dha), boards = List(4) { listOf(raj) }).isBlank)
    }
}
