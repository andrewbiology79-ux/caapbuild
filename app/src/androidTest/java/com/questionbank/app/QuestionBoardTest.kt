package com.questionbank.app

import android.content.Context
import androidx.room.useReaderConnection
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.questionbank.app.data.local.QuestionBankDatabase
import com.questionbank.app.data.local.typeCqFtsMatch
import com.questionbank.app.data.repository.TypeCqHierarchyRepositoryImpl
import com.questionbank.app.data.repository.TypeCqQuestionRepositoryImpl
import com.questionbank.app.domain.hierarchy.AddResult
import com.questionbank.app.domain.question.AddBoardResult
import com.questionbank.app.domain.question.BoardTag
import com.questionbank.app.domain.question.BoardsInput
import com.questionbank.app.domain.question.CqLabel
import com.questionbank.app.domain.question.GroupEditInput
import com.questionbank.app.domain.question.QuestionGroupInput
import com.questionbank.app.domain.question.QuestionGroupKey
import com.questionbank.app.domain.question.SaveResult
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.domain.question.SearchOutcome
import com.questionbank.app.domain.question.SubQuestionInput
import com.questionbank.app.domain.question.UpdateResult
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** Boards and years (catalog, save, edit, read-back) on the REAL Room database (v0.2.30c, step 1: data layer). */
@RunWith(AndroidJUnit4::class)
class QuestionBoardTest {
    private val dbName = "question_board_test.db"
    private lateinit var context: Context
    private lateinit var db: QuestionBankDatabase
    private lateinit var repo: TypeCqQuestionRepositoryImpl
    private lateinit var topicId: String
    private var now = 1_000L

    private val dhaka2019 = BoardTag("DHA", 2019)
    private val dhaka2020 = BoardTag("DHA", 2020)
    private val raj2020 = BoardTag("RAJ", 2020)
    private val ctg2021 = BoardTag("CTG", 2021)

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext<Context>()
        db = TestDb.open(context, dbName)
        repo = TypeCqQuestionRepositoryImpl(
            db.typeCqQuestionDao(),
            clock = { now },
            ftsMatch = { topic, match -> db.typeCqFtsMatch(topic, match) },
        )
        runBlocking {
            val h = TypeCqHierarchyRepositoryImpl(db.typeCqSubjectDao(), db.typeCqChapterDao(), db.typeCqTopicDao())
            val s = (h.addSubject("পদার্থবিজ্ঞান") as AddResult.Added).id
            val c = (h.addChapter(s, "আলো") as AddResult.Added).id
            topicId = (h.addTopic(c, "প্রতিফলন") as AddResult.Added).id
        }
    }

    @After
    fun tearDown() {
        db.close()
        context.deleteDatabase(dbName)
    }

    private suspend fun save(stimulus: String, boards: BoardsInput?, vararg subs: Pair<CqLabel, String>): SaveResult =
        repo.saveGroup(QuestionGroupInput(topicId, stimulus, subs.map { SubQuestionInput(it.first, it.second, "") }, null, boards))

    private suspend fun saveOk(stimulus: String, boards: BoardsInput?, vararg subs: Pair<CqLabel, String>) {
        val result = save(stimulus, boards, *subs)
        assertTrue("expected Saved but was $result", result is SaveResult.Saved)
    }

    private suspend fun newest(): SavedGroup = repo.observeGroups(topicId).first()[0]

    private fun editInput(key: String, boards: BoardsInput?, vararg subs: Pair<CqLabel, String>) =
        GroupEditInput(topicId, key, "উদ্দীপক", subs.map { SubQuestionInput(it.first, it.second, "") }, null, boards)

    private suspend fun count(sql: String): Long = db.useReaderConnection { it.scalarLong(sql) }

    private suspend fun updatedAtOfQuestion(id: String): Long =
        db.useReaderConnection { it.scalarLong("SELECT updated_at FROM type_cq_questions WHERE question_id = ?", id) }

    @Test
    fun theBuiltinBoardsAreSeededOnceOnOpen() = runBlocking {
        val boards = repo.observeBoards().first()
        assertEquals(11, boards.size)
        assertEquals("DHA", boards[0].code)
        assertTrue(boards.none { it.isCustom || it.isArchived })
        // The seed runs on create AND on open; INSERT OR IGNORE keeps it at 11 rows.
        assertEquals(11L, count("SELECT COUNT(*) FROM board_catalog"))
    }

    @Test
    fun savedBoardsAreReadBackInTheChosenOrder() = runBlocking {
        val boards = BoardsInput(
            stimulus = listOf(raj2020, dhaka2019, dhaka2020),
            byLabel = mapOf(CqLabel.KA to listOf(ctg2021), CqLabel.KHA to listOf(dhaka2020, dhaka2019)),
        )
        saveOk("উদ্দীপক", boards, CqLabel.KA to "প্রথম", CqLabel.KHA to "দ্বিতীয়")
        val g = newest()
        assertEquals(listOf(raj2020, dhaka2019, dhaka2020), g.stimulusBoards)
        assertEquals(listOf(listOf(ctg2021), listOf(dhaka2020, dhaka2019)), g.subQuestions.map { it.boards })
    }

    @Test
    fun boardsForABlockWithoutTextOrAMissingStimulusAreNotStored() = runBlocking {
        val boards = BoardsInput(
            stimulus = listOf(dhaka2019),
            byLabel = mapOf(CqLabel.KA to listOf(raj2020), CqLabel.GA to listOf(ctg2021)),
        )
        saveOk("", boards, CqLabel.KA to "শুধু ক")
        assertEquals(0L, count("SELECT COUNT(*) FROM type_cq_stimulus_boards"))
        assertEquals(1L, count("SELECT COUNT(*) FROM type_cq_question_boards"))
        assertEquals(listOf(raj2020), newest().subQuestions[0].boards)
    }

    @Test
    fun aBoardOnlyEditIsSavedWithoutTouchingTextOrFtsRows() = runBlocking {
        saveOk("উদ্দীপক", BoardsInput(stimulus = listOf(ctg2021), byLabel = mapOf(CqLabel.KA to listOf(dhaka2019))), CqLabel.KA to "আলোর প্রতিফলন কী?")
        val g = newest()
        val key = QuestionGroupKey.of(g)!!
        val questionId = g.subQuestions[0].id
        val ftsBefore = count("SELECT COUNT(*) FROM type_cq_question_fts")
        now = 2_000L

        val changed = repo.updateGroup(
            editInput(key, BoardsInput(stimulus = listOf(ctg2021, raj2020), byLabel = mapOf(CqLabel.KA to listOf(raj2020, dhaka2019))), CqLabel.KA to "আলোর প্রতিফলন কী?"),
        )
        assertEquals(UpdateResult.Updated, changed)
        val after = newest()
        assertEquals("আলোর প্রতিফলন কী?", after.subQuestions[0].text)
        assertEquals(listOf(ctg2021, raj2020), after.stimulusBoards)
        assertEquals(listOf(raj2020, dhaka2019), after.subQuestions[0].boards)
        assertEquals(ftsBefore, count("SELECT COUNT(*) FROM type_cq_question_fts"))
        assertEquals(2_000L, updatedAtOfQuestion(questionId))

        // null keeps every stored tag; the same tags again are "no change"; an empty list clears.
        assertEquals(UpdateResult.NoChange, repo.updateGroup(editInput(key, null, CqLabel.KA to "আলোর প্রতিফলন কী?")))
        assertEquals(
            UpdateResult.NoChange,
            repo.updateGroup(editInput(key, BoardsInput(stimulus = listOf(ctg2021, raj2020), byLabel = mapOf(CqLabel.KA to listOf(raj2020, dhaka2019))), CqLabel.KA to "আলোর প্রতিফলন কী?")),
        )
        val cleared = repo.updateGroup(editInput(key, BoardsInput(stimulus = emptyList(), byLabel = mapOf(CqLabel.KA to emptyList())), CqLabel.KA to "আলোর প্রতিফলন কী?"))
        assertEquals(UpdateResult.Updated, cleared)
        val end = newest()
        assertTrue(end.stimulusBoards.isEmpty())
        assertTrue(end.subQuestions[0].boards.isEmpty())
        assertEquals(0L, count("SELECT COUNT(*) FROM type_cq_stimulus_boards"))
        assertEquals(0L, count("SELECT COUNT(*) FROM type_cq_question_boards"))
    }

    @Test
    fun anUnknownBoardCodeIsRefusedAndNothingIsWritten() = runBlocking {
        val result = save("উদ্দীপক", BoardsInput(stimulus = listOf(BoardTag("ZZZ", 2020))), CqLabel.KA to "প্রথম")
        assertTrue("expected Failed but was $result", result is SaveResult.Failed)
        assertEquals(0L, count("SELECT COUNT(*) FROM type_cq_stimuli"))
        assertEquals(0L, count("SELECT COUNT(*) FROM type_cq_questions"))

        saveOk("উদ্দীপক", BoardsInput(byLabel = mapOf(CqLabel.KA to listOf(dhaka2019))), CqLabel.KA to "প্রথম")
        val key = QuestionGroupKey.of(newest())!!
        val edit = repo.updateGroup(editInput(key, BoardsInput(byLabel = mapOf(CqLabel.KA to listOf(BoardTag("ZZZ", 2020)))), CqLabel.KA to "প্রথম"))
        assertTrue("expected Failed but was $edit", edit is UpdateResult.Failed)
        assertEquals(listOf(dhaka2019), newest().subQuestions[0].boards) // unchanged
    }

    @Test
    fun aYearOutsideTheRangeIsRefusedAndNothingIsWritten() = runBlocking {
        val result = save("", BoardsInput(byLabel = mapOf(CqLabel.KA to listOf(BoardTag("DHA", 1899)))), CqLabel.KA to "প্রথম")
        assertTrue("expected Failed but was $result", result is SaveResult.Failed)
        assertEquals(0L, count("SELECT COUNT(*) FROM type_cq_questions"))
        assertEquals(0L, count("SELECT COUNT(*) FROM type_cq_question_boards"))
    }

    @Test
    fun customBoardsAreAddedCheckedAndUsable() = runBlocking {
        val added = repo.addCustomBoard("my_board", "  আমার   বোর্ড ")
        assertTrue("expected Added but was $added", added is AddBoardResult.Added)
        val item = (added as AddBoardResult.Added).board
        assertEquals("MY_BOARD", item.code)
        assertEquals("আমার বোর্ড", item.displayName)
        assertTrue(item.isCustom && !item.isArchived)
        val list = repo.observeBoards().first()
        assertEquals(12, list.size)
        assertEquals("MY_BOARD", list.last().code)

        assertEquals(AddBoardResult.CodeExists, repo.addCustomBoard("MY_BOARD", "অন্য নাম"))
        assertEquals(AddBoardResult.CodeExists, repo.addCustomBoard("dha", "অন্য নাম"))
        assertEquals(AddBoardResult.NameExists, repo.addCustomBoard("X1", " আমার বোর্ড "))
        assertEquals(AddBoardResult.BadCode, repo.addCustomBoard("", "নাম"))
        assertEquals(AddBoardResult.BadCode, repo.addCustomBoard("ঢাকা২", "নাম"))
        assertEquals(AddBoardResult.BadName, repo.addCustomBoard("X2", "   "))
        assertEquals(12L, count("SELECT COUNT(*) FROM board_catalog"))

        val myBoard2022 = BoardTag("MY_BOARD", 2022)
        saveOk("", BoardsInput(byLabel = mapOf(CqLabel.KA to listOf(myBoard2022))), CqLabel.KA to "নিজের বোর্ডের প্রশ্ন")
        assertEquals(listOf(myBoard2022), newest().subQuestions[0].boards)
    }

    @Test
    fun loadGroupAndSearchCarryTheBoards() = runBlocking {
        saveOk("উদ্দীপক", BoardsInput(stimulus = listOf(raj2020), byLabel = mapOf(CqLabel.KA to listOf(dhaka2019))), CqLabel.KA to "আলোর প্রতিফলন")
        val key = QuestionGroupKey.of(newest())!!

        val loaded = repo.loadGroup(topicId, key)!!
        assertEquals(listOf(raj2020), loaded.stimulusBoards)
        assertEquals(listOf(dhaka2019), loaded.subQuestions[0].boards)

        val found = repo.search(topicId, "আলোর")
        assertTrue("expected Found but was $found", found is SearchOutcome.Found)
        val groups = (found as SearchOutcome.Found).groups
        assertEquals(1, groups.size)
        assertEquals(listOf(raj2020), groups[0].stimulusBoards)
        assertEquals(listOf(dhaka2019), groups[0].subQuestions[0].boards)
    }
}
