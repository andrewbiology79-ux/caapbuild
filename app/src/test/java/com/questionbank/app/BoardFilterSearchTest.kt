package com.questionbank.app

import com.questionbank.app.domain.question.BoardFilter
import com.questionbank.app.domain.question.BoardItem
import com.questionbank.app.domain.question.BoardTag
import com.questionbank.app.domain.question.CqLabel
import com.questionbank.app.domain.question.QuestionSearchRules
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.domain.question.SavedSubQuestion
import com.questionbank.app.ui.question.boardFilterLabel
import com.questionbank.app.ui.question.yearFilterLabel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The board / year filter of the search (v0.2.30c-3). Pure rules, no database. */
class BoardFilterSearchTest {
    private val dha2019 = BoardTag("DHA", 2019)
    private val dha2020 = BoardTag("DHA", 2020)
    private val raj2019 = BoardTag("RAJ", 2019)
    private val raj2020 = BoardTag("RAJ", 2020)

    private fun sub(id: String, label: CqLabel, boards: List<BoardTag> = emptyList()) =
        SavedSubQuestion(id, label, label.marks, "text $id", "", null, boards)

    private fun group(stimulusId: String?, stimulusBoards: List<BoardTag>, vararg subs: SavedSubQuestion) =
        SavedGroup(stimulusId, if (stimulusId == null) "" else "উদ্দীপক", subs.toList(), null, stimulusBoards)

    private fun ids(groups: List<SavedGroup>) = groups.map { g -> g.subQuestions.map { it.id } }

    @Test
    fun aFilterWithNeitherBoardNorYearIsEmpty() {
        assertTrue(BoardFilter().isEmpty)
        assertFalse(BoardFilter(boardCode = "DHA").isEmpty)
        assertFalse(BoardFilter(year = 2019).isEmpty)
    }

    @Test
    fun boardOnlyAndYearOnlyFiltersMatchAnyTagOfThatBoardOrYear() {
        val tags = listOf(dha2019, raj2020)
        assertTrue(BoardFilter(boardCode = "RAJ").matches(tags))
        assertFalse(BoardFilter(boardCode = "CTG").matches(tags))
        assertTrue(BoardFilter(year = 2019).matches(tags))
        assertFalse(BoardFilter(year = 2021).matches(tags))
        assertFalse(BoardFilter(boardCode = "DHA").matches(emptyList()))
    }

    @Test
    fun boardAndYearTogetherMustBeOnTheSameTag() {
        val tags = listOf(dha2019, raj2020)
        assertTrue(BoardFilter("DHA", 2019).matches(tags))
        assertFalse(BoardFilter("DHA", 2020).matches(tags)) // DHA is there, 2020 is there, but on different tags
        assertTrue(BoardFilter("RAJ", 2020).matches(tags))
    }

    @Test
    fun withoutTextAQuestionIsKeptByItsOwnTags() {
        val g = group("s1", emptyList(), sub("a", CqLabel.KA, listOf(dha2019)), sub("b", CqLabel.KHA, listOf(raj2020)))
        assertEquals(listOf(listOf("a")), ids(QuestionSearchRules.filterByBoards(listOf(g), null, emptySet(), BoardFilter("DHA"))))
        assertEquals(listOf(listOf("b")), ids(QuestionSearchRules.filterByBoards(listOf(g), null, emptySet(), BoardFilter(year = 2020))))
    }

    @Test
    fun aTagOnTheStimulusKeepsEverySubQuestionOfTheGroup() {
        val g = group("s1", listOf(dha2019), sub("a", CqLabel.KA), sub("b", CqLabel.KHA))
        assertEquals(listOf(listOf("a", "b")), ids(QuestionSearchRules.filterByBoards(listOf(g), null, emptySet(), BoardFilter("DHA", 2019))))
    }

    @Test
    fun aGroupWithoutAnyFittingTagDisappears() {
        val g = group("s1", listOf(raj2019), sub("a", CqLabel.KA, listOf(raj2020)))
        assertTrue(QuestionSearchRules.filterByBoards(listOf(g), null, emptySet(), BoardFilter("DHA")).isEmpty())
    }

    @Test
    fun textAndTagMustBothFitForTheSameQuestion() {
        val g = group("s1", emptyList(), sub("a", CqLabel.KA, listOf(dha2019)), sub("b", CqLabel.KHA, listOf(dha2019)), sub("c", CqLabel.GA, listOf(raj2019)))
        // The text matched a and c: b has the tag but not the text, c has the text but not the tag.
        val kept = QuestionSearchRules.filterByBoards(listOf(g), setOf("a", "c"), emptySet(), BoardFilter("DHA"))
        assertEquals(listOf(listOf("a")), ids(kept))
    }

    @Test
    fun aTextMatchInTheStimulusIsNarrowedByTheQuestionTags() {
        val g = group("s1", emptyList(), sub("a", CqLabel.KA, listOf(dha2019)), sub("b", CqLabel.KHA))
        val kept = QuestionSearchRules.filterByBoards(listOf(g), emptySet(), setOf("s1"), BoardFilter("DHA"))
        assertEquals(listOf(listOf("a")), ids(kept))
    }

    @Test
    fun aSingleQuestionIsKeptByItsOwnTagsAndTheOrderOfGroupsIsKept() {
        val one = group(null, emptyList(), sub("x", CqLabel.KA, listOf(dha2020)))
        val two = group("s2", listOf(dha2020), sub("y", CqLabel.KHA))
        val three = group(null, emptyList(), sub("z", CqLabel.KA, listOf(raj2020)))
        val kept = QuestionSearchRules.filterByBoards(listOf(one, two, three), null, emptySet(), BoardFilter("DHA", 2020))
        assertEquals(listOf(listOf("x"), listOf("y")), ids(kept))
    }

    @Test
    fun filterChipTextsShowNameOrCodeAndBengaliYear() {
        val boards = listOf(BoardItem("DHA", "ঢাকা", isCustom = false, isArchived = false))
        assertEquals("বোর্ড: সব", boardFilterLabel(BoardFilter(), boards))
        assertEquals("বোর্ড: ঢাকা", boardFilterLabel(BoardFilter(boardCode = "DHA"), boards))
        assertEquals("বোর্ড: CTG", boardFilterLabel(BoardFilter(boardCode = "CTG"), boards))
        assertEquals("সাল: সব", yearFilterLabel(BoardFilter()))
        assertEquals("সাল: ২০১৯", yearFilterLabel(BoardFilter(year = 2019)))
    }
    @Test
    fun stimulusAndQuestionCategoriesAreIndependentFilters() {
        val group = SavedGroup(
            stimulusId = "s-cat",
            stimulusText = "উদ্দীপক",
            subQuestions = listOf(
                sub("cat-a", CqLabel.KA),
                sub("cat-b", CqLabel.KHA),
            ),
            stimulusCategoryIds = listOf("stim-cat"),
        )
        val stimulusFiltered = QuestionSearchRules.filterByBoards(
            listOf(group), null, emptySet(), BoardFilter(stimulusCategoryId = "stim-cat"),
        )
        assertEquals(listOf(listOf("cat-a", "cat-b")), ids(stimulusFiltered))

        val questionCategoryGroup = group.copy(
            stimulusCategoryIds = listOf("stim-cat"),
            subQuestions = listOf(
                sub("cat-a", CqLabel.KA).copy(categoryIds = listOf("question-cat")),
                sub("cat-b", CqLabel.KHA).copy(categoryIds = listOf("other-cat")),
            ),
        )
        val questionFiltered = QuestionSearchRules.filterByBoards(
            listOf(questionCategoryGroup), null, emptySet(), BoardFilter(categoryId = "question-cat"),
        )
        assertEquals(listOf(listOf("cat-a")), ids(questionFiltered))
        val separateStimulusFiltered = QuestionSearchRules.filterByBoards(
            listOf(questionCategoryGroup), null, emptySet(), BoardFilter(stimulusCategoryId = "other-cat"),
        )
        assertTrue(separateStimulusFiltered.isEmpty())
    }

    @Test
    fun stimuluslessCardUsesItsQuestionCategoryAsTheRibbonCategoryFilter() {
        val one = group(null, emptyList(), sub("single", CqLabel.KA).copy(categoryIds = listOf("one-cat")))
        assertEquals(
            listOf(listOf("single")),
            ids(QuestionSearchRules.filterByBoards(listOf(one), null, emptySet(), BoardFilter(stimulusCategoryId = "one-cat"))),
        )
        assertTrue(QuestionSearchRules.filterByBoards(listOf(one), null, emptySet(), BoardFilter(stimulusCategoryId = "other-cat")).isEmpty())
    }

}
