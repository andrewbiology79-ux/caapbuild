package com.questionbank.app

import com.questionbank.app.data.local.SeedData
import com.questionbank.app.domain.question.BoardChange
import com.questionbank.app.domain.question.BoardRules
import com.questionbank.app.domain.question.BoardTag
import com.questionbank.app.domain.question.BoardsInput
import com.questionbank.app.domain.question.CqLabel
import com.questionbank.app.domain.question.GroupEditInput
import com.questionbank.app.domain.question.QuestionEditRules
import com.questionbank.app.domain.question.QuestionGroupInput
import com.questionbank.app.domain.question.QuestionRules
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.domain.question.SavedSubQuestion
import com.questionbank.app.domain.question.SubQuestionInput
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Boards and years in the editor rules (v0.2.30c, UI-08): what is stored on save and what counts as a change on edit. No database. */
class BoardRulesTest {
    private val dhaka2019 = BoardTag("DHA", 2019)
    private val raj2020 = BoardTag("RAJ", 2020)
    private val ctg2021 = BoardTag("CTG", 2021)

    private fun newInput(stimulus: String, boards: BoardsInput?, vararg subs: Pair<CqLabel, String>) =
        QuestionGroupInput("t1", stimulus, subs.map { SubQuestionInput(it.first, it.second, "") }, null, boards)

    private fun sub(id: String, label: CqLabel, text: String, boards: List<BoardTag> = emptyList()) =
        SavedSubQuestion(id, label, label.marks, text, "", null, boards)

    private val stored = SavedGroup(
        stimulusId = "s1",
        stimulusText = "উদ্দীপক",
        subQuestions = listOf(sub("q1", CqLabel.KA, "ক-প্রশ্ন", listOf(dhaka2019, raj2020)), sub("q2", CqLabel.KHA, "খ-প্রশ্ন")),
        stimulusRating = null,
        stimulusBoards = listOf(ctg2021),
    )

    private fun editInput(boards: BoardsInput?) = GroupEditInput(
        "t1", "s-s1", "উদ্দীপক",
        listOf(
            SubQuestionInput(CqLabel.KA, "ক-প্রশ্ন", ""), SubQuestionInput(CqLabel.KHA, "খ-প্রশ্ন", ""),
            SubQuestionInput(CqLabel.GA, "", ""), SubQuestionInput(CqLabel.GHA, "", ""),
        ),
        null,
        boards,
    )

    @Test
    fun parseYearAcceptsBengaliAndLatinDigits() {
        assertEquals(2024, BoardRules.parseYear("২০২৪"))
        assertEquals(2019, BoardRules.parseYear("2019"))
        assertEquals(2020, BoardRules.parseYear(" 2020 "))
        assertEquals(1900, BoardRules.parseYear("১৯০০"))
        assertEquals(2200, BoardRules.parseYear("2200"))
    }

    @Test
    fun parseYearRejectsBadInput() {
        assertNull(BoardRules.parseYear(""))
        assertNull(BoardRules.parseYear("24"))
        assertNull(BoardRules.parseYear("20x4"))
        assertNull(BoardRules.parseYear("1899"))
        assertNull(BoardRules.parseYear("2201"))
        assertNull(BoardRules.parseYear("20245"))
    }

    @Test
    fun cleanCodeAcceptsUpperCaseAsciiOnly() {
        assertEquals("DHA", BoardRules.cleanCode(" dha "))
        assertEquals("MY_BOARD_2", BoardRules.cleanCode("my_board_2"))
        assertNull(BoardRules.cleanCode(""))
        assertNull(BoardRules.cleanCode("ঢাকা"))
        assertNull(BoardRules.cleanCode("A B"))
        assertNull(BoardRules.cleanCode("A".repeat(BoardRules.MAX_CODE_LENGTH + 1)))
        assertEquals("A".repeat(BoardRules.MAX_CODE_LENGTH), BoardRules.cleanCode("a".repeat(BoardRules.MAX_CODE_LENGTH)))
    }

    @Test
    fun cleanNameTrimsAndCollapsesSpaces() {
        assertEquals("আমার বোর্ড", BoardRules.cleanName("  আমার    বোর্ড "))
        assertNull(BoardRules.cleanName("   "))
        assertNull(BoardRules.cleanName("ক".repeat(BoardRules.MAX_NAME_LENGTH + 1)))
    }

    @Test
    fun theSameTagTwiceIsKeptOnceInTheChosenOrder() {
        val tags = listOf(raj2020, dhaka2019, raj2020)
        assertEquals(listOf(raj2020, dhaka2019), BoardRules.normalizeTags(tags))
        val ok = QuestionRules.check(newInput("উদ্দীপক", BoardsInput(stimulus = tags), CqLabel.KA to "প্রথম")) as QuestionRules.Checked.Ok
        assertEquals(listOf(raj2020, dhaka2019), ok.stimulusBoards)
    }

    @Test
    fun aNewGroupKeepsBoardsOnlyForStoredBlocks() {
        val boards = BoardsInput(byLabel = mapOf(CqLabel.KA to listOf(dhaka2019), CqLabel.GA to listOf(raj2020)))
        val ok = QuestionRules.check(newInput("উদ্দীপক", boards, CqLabel.KA to "প্রথম")) as QuestionRules.Checked.Ok
        assertEquals(mapOf(CqLabel.KA to listOf(dhaka2019)), ok.boards) // গ has no text: its tags are not stored
    }

    @Test
    fun stimulusBoardsNeedAStimulusText() {
        val boards = BoardsInput(stimulus = listOf(dhaka2019), byLabel = mapOf(CqLabel.KA to listOf(raj2020)))
        val ok = QuestionRules.check(newInput("  ", boards, CqLabel.KA to "প্রথম")) as QuestionRules.Checked.Ok
        assertTrue(ok.stimulusBoards.isEmpty())
        assertEquals(listOf(raj2020), ok.boards[CqLabel.KA])
    }

    @Test
    fun noBoardsGivesEmptyLists() {
        val ok = QuestionRules.check(newInput("উদ্দীপক", null, CqLabel.KA to "প্রথম")) as QuestionRules.Checked.Ok
        assertTrue(ok.stimulusBoards.isEmpty())
        assertTrue(ok.boards.isEmpty())
    }

    @Test
    fun aBadYearCodeOrTooManyTagsIsRefusedOnSaveAndOnEdit() {
        val badYear = BoardsInput(stimulus = listOf(BoardTag("DHA", 1899)))
        val badCode = BoardsInput(byLabel = mapOf(CqLabel.KA to listOf(BoardTag(" ", 2020))))
        val tooMany = BoardsInput(stimulus = (1..BoardRules.MAX_TAGS_PER_BLOCK + 1).map { BoardTag("DHA", 1899 + it) })
        for (bad in listOf(badYear, badCode, tooMany)) {
            assertEquals(QuestionRules.Checked.BadBoard, QuestionRules.check(newInput("উদ্দীপক", bad, CqLabel.KA to "প্রথম")))
            assertEquals(QuestionEditRules.Checked.BadBoard, QuestionEditRules.check(stored, editInput(bad)))
        }
    }

    @Test
    fun anEditWithoutBoardsOrWithTheSameBoardsIsNoChange() {
        assertEquals(QuestionEditRules.Checked.NoChange, QuestionEditRules.check(stored, editInput(null)))
        val same = BoardsInput(stimulus = listOf(ctg2021), byLabel = mapOf(CqLabel.KA to listOf(dhaka2019, raj2020), CqLabel.KHA to emptyList()))
        assertEquals(QuestionEditRules.Checked.NoChange, QuestionEditRules.check(stored, editInput(same)))
    }

    @Test
    fun anEditChangesAddsAndClearsBoards() {
        val wanted = BoardsInput(
            stimulus = emptyList(), // clears the stored stimulus tag
            byLabel = mapOf(CqLabel.KA to listOf(raj2020, dhaka2019), CqLabel.KHA to listOf(ctg2021)), // reorder, and add
        )
        val ok = QuestionEditRules.check(stored, editInput(wanted)) as QuestionEditRules.Checked.Ok
        assertEquals(BoardChange(emptyList()), ok.stimulusBoards)
        assertEquals(listOf("q1", "q2"), ok.boardUpdates.map { it.questionId })
        assertEquals(listOf(raj2020, dhaka2019), ok.boardUpdates[0].change.tags)
        assertEquals(listOf(ctg2021), ok.boardUpdates[1].change.tags)
        assertTrue(ok.updates.isEmpty() && ok.adds.isEmpty() && ok.ratingUpdates.isEmpty())
    }

    @Test
    fun aLabelAbsentFromTheWantedBoardsKeepsItsStoredTags() {
        val wanted = BoardsInput(stimulus = listOf(ctg2021), byLabel = mapOf(CqLabel.KHA to listOf(raj2020)))
        val ok = QuestionEditRules.check(stored, editInput(wanted)) as QuestionEditRules.Checked.Ok
        assertNull(ok.stimulusBoards) // same as stored
        assertEquals(listOf("q2"), ok.boardUpdates.map { it.questionId }) // ক is absent: untouched
    }

    @Test
    fun aSingleQuestionNeverChangesStimulusBoardsAndBuiltinBoardsAreSeeded() {
        val single = SavedGroup(null, "", listOf(sub("q9", CqLabel.GA, "একক", listOf(dhaka2019))))
        val input = GroupEditInput(
            "t1", "q-q9", "", listOf(SubQuestionInput(CqLabel.GA, "একক", "")), null,
            BoardsInput(stimulus = listOf(raj2020), byLabel = mapOf(CqLabel.GA to listOf(dhaka2019))),
        )
        assertEquals(QuestionEditRules.Checked.NoChange, QuestionEditRules.check(single, input))

        assertEquals(11, SeedData.builtinBoards.size)
        assertEquals(11, SeedData.builtinBoards.map { it.code }.toSet().size)
        assertTrue(SeedData.builtinBoards.all { BoardRules.cleanCode(it.code) == it.code && it.name.isNotBlank() })
        assertEquals(11, SeedData.boardStatements.size)
        assertTrue(SeedData.boardStatements.all { it.startsWith("INSERT OR IGNORE INTO board_catalog") && it.contains("'BUILTIN'") })
    }
}
