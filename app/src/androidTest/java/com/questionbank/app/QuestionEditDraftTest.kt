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
import com.questionbank.app.domain.question.CqLabel
import com.questionbank.app.domain.question.DraftText
import com.questionbank.app.domain.question.GroupEditInput
import com.questionbank.app.domain.question.QuestionGroupInput
import com.questionbank.app.domain.question.QuestionGroupKey
import com.questionbank.app.domain.question.SaveResult
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.domain.question.SubQuestionInput
import com.questionbank.app.domain.question.UpdateResult
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

/** Edit drafts (v0.2.29, part B-2) on the REAL Room database: storage, separation from saved rows, removal inside the update transaction. */
@RunWith(AndroidJUnit4::class)
class QuestionEditDraftTest {
    private val dbName = "question_edit_draft_test.db"
    private lateinit var context: Context
    private lateinit var db: QuestionBankDatabase
    private lateinit var repo: TypeCqQuestionRepositoryImpl
    private lateinit var topicId: String

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
        }
    }

    @After
    fun tearDown() {
        db.close()
        context.deleteDatabase(dbName)
    }

    private suspend fun save(stimulus: String, vararg subs: Triple<CqLabel, String, String>) {
        val result = repo.saveGroup(QuestionGroupInput(topicId, stimulus, subs.map { SubQuestionInput(it.first, it.second, it.third) }))
        assertTrue("expected Saved but was $result", result is SaveResult.Saved)
    }

    private suspend fun groups(): List<SavedGroup> = repo.observeGroups(topicId).first()

    private suspend fun keyOfNewest(): String = QuestionGroupKey.of(groups().last())!!

    private fun edit(key: String, stimulus: String, vararg subs: Triple<CqLabel, String, String>) =
        GroupEditInput(topicId, key, stimulus, subs.map { SubQuestionInput(it.first, it.second, it.third) })

    private fun draft(stimulus: String = "", ka: String = "", kaAnswer: String = "") =
        DraftText(stimulus = stimulus, texts = listOf(ka, "", "", ""), answers = listOf(kaAnswer, "", "", ""))

    private suspend fun metaRows(): Long = db.useReaderConnection { it.scalarLong("SELECT COUNT(*) FROM app_metadata WHERE \"key\" LIKE 'draft:type_cq:%'") }

    private suspend fun ftsRows(): Long = db.useReaderConnection { it.scalarLong("SELECT COUNT(*) FROM type_cq_question_fts") }

    @Test
    fun anEditDraftIsStoredAndLoadedBackWithEveryField() = runBlocking {
        save("উদ্দীপক", Triple(CqLabel.KA, "প্রথম", "উত্তর"))
        val key = keyOfNewest()
        val typed = DraftText("নতুন উদ্দীপক", listOf("নতুন প্রথম", "", "নতুন গ", ""), listOf("নতুন উত্তর", "", "", ""))

        assertNull(repo.loadEditDraft(key))
        repo.saveEditDraft(key, typed)

        assertEquals(typed, repo.loadEditDraft(key))
        assertEquals("draft:type_cq:edit:$key", TypeCqQuestionRepositoryImpl.editDraftKey(key))
    }

    @Test
    fun aBlankEditDraftIsStoredToo() = runBlocking {
        save("", Triple(CqLabel.KA, "প্রথম", ""))
        val key = keyOfNewest()

        repo.saveEditDraft(key, DraftText()) // the person emptied every block: a real (refused-on-save) edit state

        assertNotNull(repo.loadEditDraft(key))
        assertEquals(DraftText(), repo.loadEditDraft(key))
    }

    @Test
    fun aDraftNeverChangesTheSavedQuestionOrItsFtsRow() = runBlocking {
        save("", Triple(CqLabel.KA, "আলোর প্রতিফলন কী?", "উত্তর"))
        val key = keyOfNewest()
        val ftsBefore = ftsRows()

        repo.saveEditDraft(key, draft(ka = "সম্পূর্ণ অন্য লেখা", kaAnswer = "অন্য উত্তর"))

        assertEquals("আলোর প্রতিফলন কী?", groups()[0].subQuestions[0].text)
        assertEquals("উত্তর", groups()[0].subQuestions[0].shortAnswer)
        assertEquals(ftsBefore, ftsRows())
        assertTrue((repo.search(topicId, "সম্পূর্ণ") as com.questionbank.app.domain.question.SearchOutcome.Found).groups.isEmpty())
    }

    @Test
    fun aSuccessfulUpdateRemovesTheDraftInTheSameTransaction() = runBlocking {
        save("", Triple(CqLabel.KA, "পুরনো", ""))
        val key = keyOfNewest()
        repo.saveEditDraft(key, draft(ka = "নতুন"))
        assertEquals(1L, metaRows())

        val result = repo.updateGroup(edit(key, "", Triple(CqLabel.KA, "নতুন", "")))

        assertEquals(UpdateResult.Updated, result)
        assertNull(repo.loadEditDraft(key))
        assertEquals(0L, metaRows())
        assertEquals("নতুন", groups()[0].subQuestions[0].text)
    }

    @Test
    fun aRefusedUpdateAndANoChangeKeepTheDraft() = runBlocking {
        save("", Triple(CqLabel.KA, "প্রথম", ""))
        val key = keyOfNewest()
        val typed = draft(ka = "")
        repo.saveEditDraft(key, typed)

        val blanked = repo.updateGroup(edit(key, "", Triple(CqLabel.KA, "", "")))
        assertEquals(UpdateResult.BlankedQuestion(CqLabel.KA), blanked)
        assertEquals(typed, repo.loadEditDraft(key))

        val same = repo.updateGroup(edit(key, "", Triple(CqLabel.KA, "প্রথম", "")))
        assertEquals(UpdateResult.NoChange, same)
        assertEquals(typed, repo.loadEditDraft(key))
        assertEquals("প্রথম", groups()[0].subQuestions[0].text)
    }

    @Test
    fun discardRemovesOnlyThatCardsDraft() = runBlocking {
        save("", Triple(CqLabel.KA, "এক", ""))
        val keyOne = keyOfNewest()
        save("", Triple(CqLabel.KA, "দুই", ""))
        val keyTwo = keyOfNewest()
        repo.saveEditDraft(keyOne, draft(ka = "এক-সম্পাদিত"))
        repo.saveEditDraft(keyTwo, draft(ka = "দুই-সম্পাদিত"))

        repo.discardEditDraft(keyOne)

        assertNull(repo.loadEditDraft(keyOne))
        assertEquals(draft(ka = "দুই-সম্পাদিত"), repo.loadEditDraft(keyTwo))
        repo.discardEditDraft(keyOne) // removing a draft that is not there is harmless
        assertEquals(1L, metaRows())
    }

    @Test
    fun anEditDraftAndTheNewQuestionDraftOfTheTopicAreSeparate() = runBlocking {
        save("", Triple(CqLabel.KA, "সংরক্ষিত", ""))
        val key = keyOfNewest()
        repo.saveDraft(topicId, draft(ka = "নতুন প্রশ্নের ড্রাফট"))
        repo.saveEditDraft(key, draft(ka = "সম্পাদনার ড্রাফট"))

        // Saving a NEW question removes the new-question draft of the topic only.
        save("", Triple(CqLabel.KA, "আরেকটি", ""))

        assertNull(repo.loadDraft(topicId))
        assertEquals(draft(ka = "সম্পাদনার ড্রাফট"), repo.loadEditDraft(key))
    }
}
