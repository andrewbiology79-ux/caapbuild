package com.questionbank.app

import android.content.Context
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.useReaderConnection
import androidx.room.useWriterConnection
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.questionbank.app.data.local.QuestionBankDatabase
import com.questionbank.app.data.local.forceFullSync
import com.questionbank.app.data.repository.TypeCqHierarchyRepositoryImpl
import com.questionbank.app.data.repository.TypeCqQuestionRepositoryImpl
import com.questionbank.app.domain.hierarchy.AddResult
import com.questionbank.app.domain.question.CqLabel
import com.questionbank.app.domain.question.DraftText
import com.questionbank.app.domain.question.QuestionGroupInput
import com.questionbank.app.domain.question.SaveResult
import com.questionbank.app.domain.question.SubQuestionInput
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** Question repository on the REAL Room database (v0.2.23): atomic save, rollback, drafts, restart survival, durability. */
@RunWith(AndroidJUnit4::class)
class TypeCqQuestionRepositoryTest {
    private val dbName = "question_repo_test.db"
    private lateinit var context: Context
    private lateinit var db: QuestionBankDatabase
    private lateinit var repo: TypeCqQuestionRepositoryImpl
    private lateinit var topicId: String

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext<Context>()
        db = TestDb.open(context, dbName)
        repo = TypeCqQuestionRepositoryImpl(db.typeCqQuestionDao(), beforeWrite = { db.forceFullSync() })
        topicId = runBlocking { createTopic(db) }
    }

    @After
    fun tearDown() {
        db.close()
        context.deleteDatabase(dbName)
    }

    private suspend fun createTopic(database: QuestionBankDatabase): String {
        val h = TypeCqHierarchyRepositoryImpl(database.typeCqSubjectDao(), database.typeCqChapterDao(), database.typeCqTopicDao())
        val s = (h.addSubject("রসায়ন") as AddResult.Added).id
        val c = (h.addChapter(s, "অধ্যায় ২") as AddResult.Added).id
        return (h.addTopic(c, "টপিক ১") as AddResult.Added).id
    }

    private fun group(stimulus: String, vararg subs: Triple<CqLabel, String, String>, topic: String = topicId) =
        QuestionGroupInput(topic, stimulus, subs.map { SubQuestionInput(it.first, it.second, it.third) })

    private fun count(sql: String): Long = runBlocking { db.useReaderConnection { it.scalarLong(sql) } }

    @Test
    fun fourQuestionTypesAreSeededAndSeedingIsIdempotent() {
        assertEquals(4L, count("SELECT COUNT(*) FROM type_cq_question_types WHERE is_active = 1"))
        db.close()
        // reopen without deleting: the seed runs again (INSERT OR IGNORE) and must not duplicate anything
        db = openKeepingData()
        assertEquals(4L, count("SELECT COUNT(*) FROM type_cq_question_types"))
    }

    @Test
    fun savedGroupKeepsStimulusLabelsMarksAndFtsRows() = runBlocking {
        val result = repo.saveGroup(
            group("উদ্দীপক লেখা", Triple(CqLabel.GA, "গ প্রশ্ন", "গ উত্তর"), Triple(CqLabel.KA, "ক প্রশ্ন", ""))
        )
        assertTrue("expected Saved but was $result", result is SaveResult.Saved)
        result as SaveResult.Saved
        assertNotNull(result.stimulusId)
        assertEquals(2, result.questionIds.size)

        val groups = repo.observeGroups(topicId).first()
        assertEquals(1, groups.size)
        assertEquals("উদ্দীপক লেখা", groups[0].stimulusText)
        assertEquals(listOf(CqLabel.KA, CqLabel.GA), groups[0].subQuestions.map { it.label })
        assertEquals(listOf(1.0, 3.0), groups[0].subQuestions.map { it.marks })
        assertEquals("গ উত্তর", groups[0].subQuestions[1].shortAnswer)
        assertEquals(2L, count("SELECT COUNT(*) FROM type_cq_question_fts"))
        assertEquals(2L, count("SELECT COUNT(DISTINCT fts_id) FROM type_cq_questions"))
    }

    @Test
    fun questionWithoutStimulusIsItsOwnGroup() = runBlocking {
        val first = repo.saveGroup(group("", Triple(CqLabel.KHA, "একক প্রশ্ন", "")))
        assertTrue(first is SaveResult.Saved)
        assertNull((first as SaveResult.Saved).stimulusId)
        repo.saveGroup(group("", Triple(CqLabel.KA, "আরেকটি", "")))
        val groups = repo.observeGroups(topicId).first()
        assertEquals(2, groups.size)
        assertEquals("আরেকটি", groups[0].subQuestions[0].text) // newest first
        assertEquals("", groups[0].stimulusText)
        assertEquals(0L, count("SELECT COUNT(*) FROM type_cq_stimuli"))
    }

    @Test
    fun rejectedInputStoresNothing() = runBlocking {
        assertEquals(SaveResult.Empty, repo.saveGroup(group("শুধু উদ্দীপক", Triple(CqLabel.KA, "", ""))))
        assertEquals(
            SaveResult.MissingQuestionText(CqLabel.GA),
            repo.saveGroup(group("", Triple(CqLabel.KA, "প্রশ্ন", ""), Triple(CqLabel.GA, "", "উত্তর")))
        )
        assertEquals(SaveResult.TopicMissing, repo.saveGroup(group("", Triple(CqLabel.KA, "প্রশ্ন", ""), topic = "no-such-topic")))
        assertEquals(0L, count("SELECT COUNT(*) FROM type_cq_questions"))
        assertEquals(0L, count("SELECT COUNT(*) FROM type_cq_stimuli"))
        assertEquals(0L, count("SELECT COUNT(*) FROM type_cq_question_fts"))
    }

    @Test
    fun failureInTheMiddleRollsEverythingBackAndKeepsTheDraft() = runBlocking {
        // Every id is "dup": the stimulus and the first question insert fine, the second question hits the primary key.
        val broken = TypeCqQuestionRepositoryImpl(db.typeCqQuestionDao(), newId = { "dup" })
        val draft = DraftText(stimulus = "উদ্দীপক", texts = listOf("ক", "খ", "", ""))
        broken.saveDraft(topicId, draft)

        val result = broken.saveGroup(group("উদ্দীপক", Triple(CqLabel.KA, "ক", ""), Triple(CqLabel.KHA, "খ", "")))
        assertTrue("expected Failed but was $result", result is SaveResult.Failed)

        assertEquals(0L, count("SELECT COUNT(*) FROM type_cq_stimuli"))
        assertEquals(0L, count("SELECT COUNT(*) FROM type_cq_questions"))
        assertEquals(0L, count("SELECT COUNT(*) FROM type_cq_question_fts"))
        assertEquals(draft, broken.loadDraft(topicId)) // the draft removal was rolled back too
    }

    @Test
    fun draftRoundTripsAndASuccessfulSaveRemovesIt() = runBlocking {
        assertNull(repo.loadDraft(topicId))
        val draft = DraftText(stimulus = "লাইন ১\nলাইন \"২\"", texts = listOf("ক প্রশ্ন", "", "গ প্রশ্ন", ""), answers = listOf("", "", "উত্তর", ""))
        repo.saveDraft(topicId, draft)
        assertEquals(draft, repo.loadDraft(topicId))

        val result = repo.saveGroup(group("লাইন ১", Triple(CqLabel.KA, "ক প্রশ্ন", "")))
        assertTrue(result is SaveResult.Saved)
        assertNull(repo.loadDraft(topicId))

        repo.saveDraft(topicId, draft)
        repo.saveDraft(topicId, DraftText()) // a blank draft removes the stored one
        assertNull(repo.loadDraft(topicId))
    }

    @Test
    fun draftsOfDifferentTopicsAreIndependent() = runBlocking {
        val h = TypeCqHierarchyRepositoryImpl(db.typeCqSubjectDao(), db.typeCqChapterDao(), db.typeCqTopicDao())
        val chapterId = db.useReaderConnection { it.scalarText("SELECT chapter_id FROM type_cq_chapters LIMIT 1") }
        val other = (h.addTopic(chapterId, "টপিক ২") as AddResult.Added).id
        repo.saveDraft(topicId, DraftText(stimulus = "এক"))
        repo.saveDraft(other, DraftText(stimulus = "দুই"))
        assertEquals("এক", repo.loadDraft(topicId)?.stimulus)
        assertEquals("দুই", repo.loadDraft(other)?.stimulus)
    }

    @Test
    fun savedQuestionsAndDraftsSurviveCloseAndReopen() = runBlocking {
        val saved = repo.saveGroup(group("উদ্দীপক", Triple(CqLabel.KA, "সম\u09DF কী?", "উত্তর")))
        assertTrue(saved is SaveResult.Saved)
        repo.saveDraft(topicId, DraftText(stimulus = "অসমাপ্ত লেখা"))

        db.close()
        db = openKeepingData()
        val reopened = TypeCqQuestionRepositoryImpl(db.typeCqQuestionDao())

        val groups = reopened.observeGroups(topicId).first()
        assertEquals(1, groups.size)
        assertEquals("উদ্দীপক", groups[0].stimulusText)
        assertEquals("উত্তর", groups[0].subQuestions[0].shortAnswer)
        assertEquals("অসমাপ্ত লেখা", reopened.loadDraft(topicId)?.stimulus)
        assertEquals("ok", db.useReaderConnection { it.scalarText("PRAGMA integrity_check") })
        assertEquals(1L, count("SELECT COUNT(*) FROM type_cq_question_fts"))
    }

    @Test
    fun nuktaSpellingsAreStoredAsOneAndFoundBySearch() = runBlocking {
        repo.saveGroup(group("", Triple(CqLabel.KA, "সম\u09AF\u09BC", ""))) // য + nukta
        repo.saveGroup(group("", Triple(CqLabel.KA, "সম\u09DF", ""))) // precomposed য়
        val texts = repo.observeGroups(topicId).first().map { it.subQuestions[0].text }
        assertEquals(1, texts.toSet().size)
        val hits = db.useReaderConnection { it.ftsCount("\"" + com.questionbank.app.data.local.BanglaText.normalize("সম\u09DF") + "\"") }
        assertEquals(2L, hits)
    }

    @Test
    fun synchronousFullIsActiveAfterASave() = runBlocking {
        val saved = repo.saveGroup(group("", Triple(CqLabel.KA, "প্রশ্ন", "")))
        assertTrue(saved is SaveResult.Saved)
        // 2 = FULL
        assertEquals(2L, db.useWriterConnection { it.scalarLong("PRAGMA synchronous") })
    }

    private fun openKeepingData(): QuestionBankDatabase =
        Room.databaseBuilder(context, QuestionBankDatabase::class.java, dbName)
            .setDriver(BundledSQLiteDriver())
            .setJournalMode(RoomDatabase.JournalMode.WRITE_AHEAD_LOGGING)
            .addCallback(QuestionBankDatabase.CANONICAL_OBJECTS_CALLBACK)
            .build()
}
