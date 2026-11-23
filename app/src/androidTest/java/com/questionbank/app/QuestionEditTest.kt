package com.questionbank.app

import android.content.Context
import androidx.room.useReaderConnection
import androidx.room.useWriterConnection
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.questionbank.app.data.local.QuestionBankDatabase
import com.questionbank.app.data.local.typeCqFtsMatch
import com.questionbank.app.data.repository.TypeCqHierarchyRepositoryImpl
import com.questionbank.app.data.repository.TypeCqQuestionRepositoryImpl
import com.questionbank.app.domain.hierarchy.AddResult
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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** Editing an existing question on the REAL Room database (v0.2.28): FTS update, one transaction, refusals, rollback, card place. */
@RunWith(AndroidJUnit4::class)
class QuestionEditTest {
    private val dbName = "question_edit_test.db"
    private lateinit var context: Context
    private lateinit var db: QuestionBankDatabase
    private lateinit var repo: TypeCqQuestionRepositoryImpl
    private lateinit var topicId: String
    private lateinit var otherTopicId: String
    private var now = 1_000L

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
            otherTopicId = (h.addTopic(c, "প্রতিসরণ") as AddResult.Added).id
        }
    }

    @After
    fun tearDown() {
        db.close()
        context.deleteDatabase(dbName)
    }

    private suspend fun save(topic: String, stimulus: String, vararg subs: Triple<CqLabel, String, String>) {
        val result = repo.saveGroup(QuestionGroupInput(topic, stimulus, subs.map { SubQuestionInput(it.first, it.second, it.third) }))
        assertTrue("expected Saved but was $result", result is SaveResult.Saved)
    }

    private suspend fun groups(topic: String = topicId): List<SavedGroup> = repo.observeGroups(topic).first()

    private suspend fun keyOfNewest(): String = QuestionGroupKey.of(groups()[0])!!

    private fun edit(key: String, stimulus: String, vararg subs: Triple<CqLabel, String, String>) =
        GroupEditInput(topicId, key, stimulus, subs.map { SubQuestionInput(it.first, it.second, it.third) })

    private suspend fun found(query: String): List<SavedGroup> {
        val outcome = repo.search(topicId, query)
        assertTrue("expected Found for \"$query\" but was $outcome", outcome is SearchOutcome.Found)
        return (outcome as SearchOutcome.Found).groups
    }

    private suspend fun ftsRows(): Long = db.useReaderConnection { it.scalarLong("SELECT COUNT(*) FROM type_cq_question_fts") }

    private suspend fun questionRows(): Long = db.useReaderConnection { it.scalarLong("SELECT COUNT(*) FROM type_cq_questions") }

    private suspend fun updatedAtOfQuestion(id: String): Long =
        db.useReaderConnection { it.scalarLong("SELECT updated_at FROM type_cq_questions WHERE question_id = ?", id) }

    @Test
    fun anEditedTextReplacesItsFtsRowSoTheOldWordIsGoneAndTheNewWordIsFound() = runBlocking {
        save(topicId, "", Triple(CqLabel.KA, "আলোর প্রতিফলন কী?", ""))
        val key = keyOfNewest()
        now = 2_000L

        val result = repo.updateGroup(edit(key, "", Triple(CqLabel.KA, "ধ্বনির প্রতিধ্বনি কী?", "উত্তর")))

        assertEquals(UpdateResult.Updated, result)
        assertTrue(found("প্রতিফলন").isEmpty())
        assertEquals(1, found("প্রতিধ্বনি").size)
        assertEquals(1, found("উত্তর").size) // the short answer is searchable too
        assertEquals(1L, ftsRows()) // replaced, not added
        val shown = groups()
        assertEquals(1, shown.size)
        assertEquals("ধ্বনির প্রতিধ্বনি কী?", shown[0].subQuestions[0].text) // the live list shows the new text at once
        assertEquals(2_000L, updatedAtOfQuestion(shown[0].subQuestions[0].id))
    }

    @Test
    fun aStimulusGroupChangesItsStimulusAndItsQuestionsInOneSave() = runBlocking {
        save(topicId, "উদ্দীপকে আলোর কথা", Triple(CqLabel.KA, "প্রথম", ""), Triple(CqLabel.KHA, "দ্বিতীয়", ""))
        val key = keyOfNewest()

        val result = repo.updateGroup(
            edit(key, "উদ্দীপকে বাতাসের কথা", Triple(CqLabel.KA, "প্রথম", ""), Triple(CqLabel.KHA, "দ্বিতীয় বদলানো", ""), Triple(CqLabel.GA, "", ""), Triple(CqLabel.GHA, "", ""))
        )

        assertEquals(UpdateResult.Updated, result)
        val group = repo.loadGroup(topicId, key)!!
        assertEquals("উদ্দীপকে বাতাসের কথা", group.stimulusText)
        assertEquals(listOf("প্রথম", "দ্বিতীয় বদলানো"), group.subQuestions.map { it.text })
        assertTrue(found("আলোর").isEmpty()) // the old stimulus word no longer matches
        assertEquals(1, found("বাতাসের").size)
        assertEquals(1, found("বদলানো").size)
    }

    @Test
    fun blankingAStoredQuestionIsRefusedAndNothingIsWritten() = runBlocking {
        save(topicId, "উদ্দীপক", Triple(CqLabel.KA, "প্রথম", "উত্তর"), Triple(CqLabel.KHA, "দ্বিতীয়", ""))
        val key = keyOfNewest()
        val before = groups()
        now = 2_000L

        val result = repo.updateGroup(
            edit(key, "উদ্দীপক", Triple(CqLabel.KA, "বদলানো", ""), Triple(CqLabel.KHA, "   ", ""), Triple(CqLabel.GA, "", ""), Triple(CqLabel.GHA, "", ""))
        )

        assertEquals(UpdateResult.BlankedQuestion(CqLabel.KHA), result)
        assertEquals(before, groups()) // even the valid change of ক was not applied
        assertEquals(1_000L, updatedAtOfQuestion(before[0].subQuestions[0].id))
        assertEquals(2L, ftsRows())
    }

    @Test
    fun blankingTheStimulusIsRefused() = runBlocking {
        save(topicId, "উদ্দীপক", Triple(CqLabel.KA, "প্রথম", ""))
        val key = keyOfNewest()

        val result = repo.updateGroup(edit(key, "  ", Triple(CqLabel.KA, "প্রথম", ""), Triple(CqLabel.KHA, "", ""), Triple(CqLabel.GA, "", ""), Triple(CqLabel.GHA, "", "")))

        assertEquals(UpdateResult.BlankedStimulus, result)
        assertEquals("উদ্দীপক", repo.loadGroup(topicId, key)!!.stimulusText)
    }

    @Test
    fun aMissingLabelIsAddedWithItsOwnFtsRowAndTheCardKeepsItsPlaceInTheList() = runBlocking {
        save(topicId, "প্রথম উদ্দীপক", Triple(CqLabel.KA, "ক-এক", ""), Triple(CqLabel.KHA, "খ-এক", ""))
        save(topicId, "", Triple(CqLabel.KA, "একক প্রশ্ন", ""))
        save(topicId, "", Triple(CqLabel.KA, "আরেক একক", ""))
        val oldest = groups().last()
        val key = QuestionGroupKey.of(oldest)!!
        val orderBefore = groups().map { QuestionGroupKey.of(it) }
        now = 2_000L

        val result = repo.updateGroup(
            edit(key, "প্রথম উদ্দীপক", Triple(CqLabel.KA, "ক-এক", ""), Triple(CqLabel.KHA, "খ-এক", ""), Triple(CqLabel.GA, "গ-নতুন", "গ-উত্তর"), Triple(CqLabel.GHA, "", ""))
        )

        assertEquals(UpdateResult.Updated, result)
        val after = groups()
        assertEquals(orderBefore, after.map { QuestionGroupKey.of(it) }) // the card did not jump to the top
        assertEquals(listOf(CqLabel.KA, CqLabel.KHA, CqLabel.GA), after.last().subQuestions.map { it.label })
        assertEquals(3.0, after.last().subQuestions[2].marks, 0.0) // marks and type come from the label
        assertEquals(1, found("গ-নতুন").size)
        assertEquals(questionRows(), ftsRows()) // every question row has exactly one FTS row
        assertEquals(5L, questionRows())
    }

    @Test
    fun aSaveWithoutARealChangeWritesNothing() = runBlocking {
        save(topicId, "উদ্দীপক", Triple(CqLabel.KA, "প্রথম", "উত্তর"))
        val key = keyOfNewest()
        val id = groups()[0].subQuestions[0].id
        now = 2_000L

        val result = repo.updateGroup(
            edit(key, " উদ্দীপক ", Triple(CqLabel.KA, " প্রথম ", "উত্তর"), Triple(CqLabel.KHA, "", ""), Triple(CqLabel.GA, "", ""), Triple(CqLabel.GHA, "", ""))
        )

        assertEquals(UpdateResult.NoChange, result)
        assertEquals(1_000L, updatedAtOfQuestion(id))
    }

    @Test
    fun aFailureInTheMiddleRollsEveryWriteBack() = runBlocking {
        save(topicId, "পুরনো উদ্দীপক", Triple(CqLabel.KA, "পুরনো প্রশ্ন", ""))
        val key = keyOfNewest()
        db.useWriterConnection {
            it.exec("CREATE TRIGGER trg_test_boom BEFORE UPDATE ON type_cq_questions WHEN NEW.question_text = 'BOOM' BEGIN SELECT RAISE(ABORT, 'boom'); END")
        }
        now = 2_000L

        // The stimulus is written first, then the question update hits the trigger: the stimulus change must disappear too.
        val result = repo.updateGroup(
            edit(key, "নতুন উদ্দীপক", Triple(CqLabel.KA, "BOOM", ""), Triple(CqLabel.KHA, "", ""), Triple(CqLabel.GA, "", ""), Triple(CqLabel.GHA, "", ""))
        )

        assertTrue("expected Failed but was $result", result is UpdateResult.Failed)
        val group = repo.loadGroup(topicId, key)!!
        assertEquals("পুরনো উদ্দীপক", group.stimulusText)
        assertEquals("পুরনো প্রশ্ন", group.subQuestions[0].text)
        assertEquals(1, found("পুরনো").size)
        assertEquals(1L, ftsRows())
    }

    @Test
    fun aGroupThatDisappearedIsReportedAndNothingIsCreated() = runBlocking {
        save(topicId, "", Triple(CqLabel.KA, "প্রশ্ন", ""))
        val key = keyOfNewest()
        db.useWriterConnection { it.exec("DELETE FROM type_cq_questions WHERE topic_id = ?", topicId) }

        assertNull(repo.loadGroup(topicId, key))
        val result = repo.updateGroup(edit(key, "", Triple(CqLabel.KA, "নতুন", "")))

        assertEquals(UpdateResult.GroupMissing, result)
        assertEquals(0L, questionRows())
        assertNull(repo.loadGroup(topicId, "garbage"))
    }

    @Test
    fun otherCardsAndOtherTopicsStayExactlyAsTheyWere() = runBlocking {
        save(topicId, "", Triple(CqLabel.KA, "প্রথম একক", ""))
        save(topicId, "", Triple(CqLabel.KA, "দ্বিতীয় একক", ""))
        save(otherTopicId, "অন্য উদ্দীপক", Triple(CqLabel.KA, "অন্য প্রশ্ন", ""))
        val untouchedSameTopic = groups()[1]
        val untouchedOtherTopic = groups(otherTopicId)
        val key = keyOfNewest()
        now = 2_000L

        val result = repo.updateGroup(edit(key, "", Triple(CqLabel.KA, "বদলানো একক", "")))

        assertEquals(UpdateResult.Updated, result)
        assertEquals(untouchedSameTopic, groups()[1])
        assertEquals(untouchedOtherTopic, groups(otherTopicId))
        assertEquals(1_000L, updatedAtOfQuestion(untouchedSameTopic.subQuestions[0].id))
        assertEquals(3L, ftsRows())
    }
}
