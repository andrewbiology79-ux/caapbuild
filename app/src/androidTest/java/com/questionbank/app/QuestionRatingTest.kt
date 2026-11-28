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
import com.questionbank.app.domain.question.DraftText
import com.questionbank.app.domain.question.GroupEditInput
import com.questionbank.app.domain.question.QuestionCardRules
import com.questionbank.app.domain.question.QuestionGroupInput
import com.questionbank.app.domain.question.QuestionGroupKey
import com.questionbank.app.domain.question.RatingsInput
import com.questionbank.app.domain.question.SaveResult
import com.questionbank.app.domain.question.SavedGroup
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

/** Ratings (stimulus and question) saved and edited on the REAL Room database (v0.2.30, step 1: data layer). */
@RunWith(AndroidJUnit4::class)
class QuestionRatingTest {
    private val dbName = "question_rating_test.db"
    private lateinit var context: Context
    private lateinit var db: QuestionBankDatabase
    private lateinit var repo: TypeCqQuestionRepositoryImpl
    private lateinit var topicId: String
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
        }
    }

    @After
    fun tearDown() {
        db.close()
        context.deleteDatabase(dbName)
    }

    private suspend fun saveRated(stimulus: String, ratings: RatingsInput?, vararg subs: Pair<CqLabel, String>) {
        val result = repo.saveGroup(QuestionGroupInput(topicId, stimulus, subs.map { SubQuestionInput(it.first, it.second, "") }, ratings))
        assertTrue("expected Saved but was $result", result is SaveResult.Saved)
    }

    private suspend fun newest(): SavedGroup = repo.observeGroups(topicId).first().last()

    private fun editInput(key: String, ratings: RatingsInput?, vararg subs: Pair<CqLabel, String>) =
        GroupEditInput(topicId, key, "উদ্দীপক", subs.map { SubQuestionInput(it.first, it.second, "") }, ratings)

    private suspend fun ftsRows(): Long = db.useReaderConnection { it.scalarLong("SELECT COUNT(*) FROM type_cq_question_fts") }

    private suspend fun updatedAtOfStimulus(id: String): Long =
        db.useReaderConnection { it.scalarLong("SELECT updated_at FROM type_cq_stimuli WHERE stimulus_id = ?", id) }

    @Test
    fun savedRatingsAreReadBackAndTheCardUsesRuleU1() = runBlocking {
        saveRated("উদ্দীপক", RatingsInput(stimulus = 5, byLabel = mapOf(CqLabel.KA to 1, CqLabel.KHA to 2)), CqLabel.KA to "প্রথম", CqLabel.KHA to "দ্বিতীয়")
        val g = newest()
        assertEquals(5, g.stimulusRating)
        assertEquals(listOf<Int?>(1, 2), g.subQuestions.map { it.rating })
        assertEquals(5, QuestionCardRules.rating(g)) // the stimulus rating wins

        saveRated("", RatingsInput(byLabel = mapOf(CqLabel.GA to 4)), CqLabel.GA to "একক গ")
        val single = newest()
        assertNull(single.stimulusRating)
        assertEquals(4, QuestionCardRules.rating(single)) // no stimulus: the question's own rating
    }

    @Test
    fun aRatingForABlockWithoutTextOrForAMissingStimulusIsNotStored() = runBlocking {
        saveRated("", RatingsInput(stimulus = 5, byLabel = mapOf(CqLabel.KA to 2, CqLabel.GHA to 5)), CqLabel.KA to "শুধু ক")
        val g = newest()
        assertNull(g.stimulusId)
        assertEquals(listOf<Int?>(2), g.subQuestions.map { it.rating })
        val storedRatings = db.useReaderConnection { it.scalarLong("SELECT COUNT(*) FROM type_cq_questions WHERE rating IS NOT NULL") }
        assertEquals(1L, storedRatings)
    }

    @Test
    fun aSaveWithoutRatingsStoresNull() = runBlocking {
        saveRated("উদ্দীপক", null, CqLabel.KA to "প্রথম")
        val g = newest()
        assertNull(g.stimulusRating)
        assertNull(g.subQuestions[0].rating)
        assertEquals(3, QuestionCardRules.rating(g)) // the default of rule U-1
    }

    @Test
    fun aRatingOnlyEditIsSavedWithoutTouchingTextOrFtsRows() = runBlocking {
        saveRated("উদ্দীপক", RatingsInput(stimulus = 2, byLabel = mapOf(CqLabel.KA to 2)), CqLabel.KA to "আলোর প্রতিফলন কী?")
        val g = newest()
        val key = QuestionGroupKey.of(g)!!
        val ftsBefore = ftsRows()
        now = 2_000L

        val result = repo.updateGroup(editInput(key, RatingsInput(stimulus = 5, byLabel = mapOf(CqLabel.KA to 4)), CqLabel.KA to "আলোর প্রতিফলন কী?"))

        assertEquals(UpdateResult.Updated, result)
        val after = newest()
        assertEquals(5, after.stimulusRating)
        assertEquals(4, after.subQuestions[0].rating)
        assertEquals("আলোর প্রতিফলন কী?", after.subQuestions[0].text)
        assertEquals("উদ্দীপক", after.stimulusText)
        assertEquals(ftsBefore, ftsRows())
        assertEquals(2_000L, updatedAtOfStimulus(g.stimulusId!!))
    }

    @Test
    fun editWithoutRatingsKeepsAndEditWithNullsClears() = runBlocking {
        saveRated("উদ্দীপক", RatingsInput(stimulus = 3, byLabel = mapOf(CqLabel.KA to 5)), CqLabel.KA to "প্রথম")
        val key = QuestionGroupKey.of(newest())!!

        // ratings = null: only the text changes, the stored ratings stay.
        assertEquals(UpdateResult.Updated, repo.updateGroup(editInput(key, null, CqLabel.KA to "প্রথম (বদল)")))
        assertEquals(3, newest().stimulusRating)
        assertEquals(5, newest().subQuestions[0].rating)

        // the same ratings again: nothing to write.
        assertEquals(UpdateResult.NoChange, repo.updateGroup(editInput(key, RatingsInput(3, mapOf(CqLabel.KA to 5)), CqLabel.KA to "প্রথম (বদল)")))

        // cleared on purpose.
        assertEquals(UpdateResult.Updated, repo.updateGroup(editInput(key, RatingsInput(null, mapOf(CqLabel.KA to null)), CqLabel.KA to "প্রথম (বদল)")))
        assertNull(newest().stimulusRating)
        assertNull(newest().subQuestions[0].rating)
        assertEquals(3, QuestionCardRules.rating(newest()))
    }

    @Test
    fun aSubQuestionAddedByEditGetsItsRatingInTheSameTransaction() = runBlocking {
        saveRated("উদ্দীপক", RatingsInput(stimulus = 2), CqLabel.KA to "প্রথম")
        val key = QuestionGroupKey.of(newest())!!

        val result = repo.updateGroup(
            editInput(key, RatingsInput(stimulus = 2, byLabel = mapOf(CqLabel.GA to 5)), CqLabel.KA to "প্রথম", CqLabel.GA to "নতুন গ"),
        )

        assertEquals(UpdateResult.Updated, result)
        val g = newest()
        assertEquals(listOf("প্রথম", "নতুন গ"), g.subQuestions.map { it.text })
        assertEquals(listOf<Int?>(null, 5), g.subQuestions.map { it.rating })
    }

    @Test
    fun aRatingOutsideOneToFiveIsRefusedAndNothingIsWritten() = runBlocking {
        val refused = repo.saveGroup(
            QuestionGroupInput(topicId, "উদ্দীপক", listOf(SubQuestionInput(CqLabel.KA, "প্রথম", "")), RatingsInput(stimulus = 9)),
        )
        assertTrue("expected Failed but was $refused", refused is SaveResult.Failed)
        assertEquals(0, repo.observeGroups(topicId).first().size)
    }

    @Test
    fun draftsCarryRatingsAndOldDraftsWithoutRatingsStillLoad() = runBlocking {
        val key = "s-d1"
        val draft = DraftText(stimulus = "উদ্দীপক", texts = listOf("ক", "", "", ""), stimulusRating = 4, ratings = listOf(1, null, null, 5))
        repo.saveEditDraft(key, draft)
        assertEquals(draft, repo.loadEditDraft(key))

        // A draft written by v0.2.29 has no rating fields.
        db.useWriterConnection {
            it.exec(
                "INSERT OR REPLACE INTO app_metadata(\"key\", value_json, updated_at) VALUES(?, ?, 1)",
                TypeCqQuestionRepositoryImpl.editDraftKey("s-old"),
                "{\"v\":1,\"stimulus\":\"পুরোনো\",\"texts\":[\"ক\",\"\",\"\",\"\"],\"answers\":[\"\",\"\",\"\",\"\"]}",
            )
        }
        val old = repo.loadEditDraft("s-old")
        assertEquals(DraftText(stimulus = "পুরোনো", texts = listOf("ক", "", "", "")), old)
        assertNull(old!!.stimulusRating)
    }
}
