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
import com.questionbank.app.domain.question.QuestionGroupInput
import com.questionbank.app.domain.question.SaveResult
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.domain.question.SearchOutcome
import com.questionbank.app.domain.question.SubQuestionInput
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** In-topic search and card ratings on the REAL Room database (v0.2.27): FTS5 join, prefix, stimulus match, topic scope, safe input. */
@RunWith(AndroidJUnit4::class)
class QuestionSearchTest {
    private val dbName = "question_search_test.db"
    private lateinit var context: Context
    private lateinit var db: QuestionBankDatabase
    private lateinit var repo: TypeCqQuestionRepositoryImpl
    private lateinit var topicId: String
    private lateinit var otherTopicId: String

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext<Context>()
        db = TestDb.open(context, dbName)
        repo = TypeCqQuestionRepositoryImpl(db.typeCqQuestionDao(), ftsMatch = { topic, match -> db.typeCqFtsMatch(topic, match) })
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

    private fun input(topic: String, stimulus: String, vararg subs: Triple<CqLabel, String, String>) =
        QuestionGroupInput(topic, stimulus, subs.map { SubQuestionInput(it.first, it.second, it.third) })

    private suspend fun save(topic: String, stimulus: String, vararg subs: Triple<CqLabel, String, String>) {
        val result = repo.saveGroup(input(topic, stimulus, *subs))
        assertTrue("expected Saved but was $result", result is SaveResult.Saved)
    }

    private suspend fun found(query: String, topic: String = topicId): List<SavedGroup> {
        val outcome = repo.search(topic, query)
        assertTrue("expected Found for \"$query\" but was $outcome", outcome is SearchOutcome.Found)
        return (outcome as SearchOutcome.Found).groups
    }

    private fun texts(groups: List<SavedGroup>): List<String> = groups.flatMap { g -> g.subQuestions.map { it.text } }

    @Test
    fun findsABengaliWordInTheQuestionTextAndInTheShortAnswer() = runBlocking {
        save(topicId, "", Triple(CqLabel.KA, "আলোর প্রতিফলন কী?", ""))
        save(topicId, "", Triple(CqLabel.KA, "অন্য একটি প্রশ্ন", "আলোর বেগ"))
        save(topicId, "", Triple(CqLabel.KA, "ধ্বনির প্রতিধ্বনি", ""))

        val hits = found("আলোর")
        assertEquals(2, hits.size)
        assertEquals(setOf("আলোর প্রতিফলন কী?", "অন্য একটি প্রশ্ন"), texts(hits).toSet())
        assertEquals(1, found("প্রতিধ্বনি").size)
        assertTrue(found("কিছুইনেই").isEmpty())
    }

    @Test
    fun theLastWordIsAPrefixAndEarlierWordsMustBeWholeWords() = runBlocking {
        save(topicId, "", Triple(CqLabel.KA, "আলোর প্রতিফলন কী?", ""))

        assertEquals(1, found("আলোর প্রতিফ").size) // typing in progress: the last word may be unfinished
        assertEquals(1, found("প্রতিফলন আলোর").size) // order of words does not matter
        assertTrue(found("আলো প্রতিফলন").isEmpty()) // "আলো" is not the whole word "আলোর"
        assertTrue(found("আলোর বেগ").isEmpty()) // every word must match
    }

    @Test
    fun aStimulusMatchShowsAllSubQuestionsAndAQuestionMatchShowsOnlyThatOne() = runBlocking {
        save(
            topicId, "উদ্দীপকে আলোর কথা বলা হয়েছে",
            Triple(CqLabel.KA, "প্রথম প্রশ্ন", ""), Triple(CqLabel.KHA, "দ্বিতীয় বাতাস", ""), Triple(CqLabel.GA, "তৃতীয় প্রশ্ন", ""),
        )

        val byStimulus = found("আলোর")
        assertEquals(1, byStimulus.size)
        assertEquals(listOf(CqLabel.KA, CqLabel.KHA, CqLabel.GA), byStimulus[0].subQuestions.map { it.label })

        val byQuestion = found("বাতাস")
        assertEquals(1, byQuestion.size)
        assertEquals(listOf(CqLabel.KHA), byQuestion[0].subQuestions.map { it.label })
        assertEquals("উদ্দীপকে আলোর কথা বলা হয়েছে", byQuestion[0].stimulusText)
    }

    @Test
    fun searchStaysInsideTheOpenTopic() = runBlocking {
        save(topicId, "", Triple(CqLabel.KA, "আলোর বেগ কত?", ""))
        save(otherTopicId, "উদ্দীপক আলোর", Triple(CqLabel.KA, "আলোর প্রতিসরণ", ""))

        assertEquals(listOf("আলোর বেগ কত?"), texts(found("আলোর", topicId)))
        assertEquals(listOf("আলোর প্রতিসরণ"), texts(found("আলোর", otherTopicId)))
        assertEquals(2, db.typeCqFtsMatch(topicId, "\"আলোর\"").size + db.typeCqFtsMatch(otherTopicId, "\"আলোর\"").size)
    }

    @Test
    fun bothSpellingsOfNuktaLettersFindTheSameQuestion() = runBlocking {
        save(topicId, "", Triple(CqLabel.KA, "সম\u09DF কত?", "")) // precomposed য়, stored in NFC

        assertEquals(1, found("সম\u09DF").size)
        assertEquals(1, found("সম\u09AF\u09BC").size) // য + nukta
    }

    @Test
    fun punctuationAndSearchSyntaxNeverFailTheSearch() = runBlocking {
        save(topicId, "", Triple(CqLabel.KA, "আলোর বেগ", ""))
        for (text in listOf("", "   ", "\"", "***", "...", "-", "(")) {
            assertEquals("\"$text\"", SearchOutcome.NoTerms, repo.search(topicId, text))
        }
        for (text in listOf("a AND b", "NEAR(", "আলো:*", "-আলোর", "a\"b", "OR", "বেগ*", "\"আলোর\" OR \"x\"")) {
            val outcome = repo.search(topicId, text)
            assertTrue("\"$text\" gave $outcome", outcome is SearchOutcome.Found)
        }
        assertEquals(1, found("-আলোর").size) // the dash is dropped by the FTS tokenizer inside the quoted word, so the word still matches
    }

    @Test
    fun ratingsReachTheCardsInTheListAndInSearchResults() = runBlocking {
        save(topicId, "আলোর উদ্দীপক", Triple(CqLabel.KA, "প্রথম", ""), Triple(CqLabel.KHA, "দ্বিতীয়", ""))
        db.useWriterConnection {
            it.exec("UPDATE type_cq_stimuli SET rating = 4")
            it.exec("UPDATE type_cq_questions SET rating = 2 WHERE subquestion_label = 'ক'")
        }

        val list = repo.observeGroups(topicId).first()
        assertEquals(4, list[0].stimulusRating)
        assertEquals(listOf(2, null), list[0].subQuestions.map { it.rating })

        val hit = found("আলোর")
        assertEquals(4, hit[0].stimulusRating)
        assertEquals(listOf(2, null), hit[0].subQuestions.map { it.rating })
    }

    @Test
    fun resultsAreNewestFirstAndNewQuestionsAreFoundAtOnce() = runBlocking {
        save(topicId, "", Triple(CqLabel.KA, "আলো এক", ""))
        save(topicId, "", Triple(CqLabel.KA, "আলো দুই", ""))
        assertEquals(listOf("আলো দুই", "আলো এক"), texts(found("আলো")))

        save(topicId, "", Triple(CqLabel.KA, "আলো তিন", ""))
        assertEquals(listOf("আলো তিন", "আলো দুই", "আলো এক"), texts(found("আলো")))
        assertEquals(3L, db.useReaderConnection { it.scalarLong("SELECT COUNT(*) FROM type_cq_question_fts") })
    }
}
