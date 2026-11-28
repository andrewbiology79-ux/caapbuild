package com.questionbank.app

import android.content.Context
import androidx.room.useWriterConnection
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.questionbank.app.data.local.QuestionBankDatabase
import com.questionbank.app.data.repository.TypeCqHierarchyRepositoryImpl
import com.questionbank.app.data.repository.TypeCqQuestionRepositoryImpl
import com.questionbank.app.domain.hierarchy.AddResult
import com.questionbank.app.domain.hierarchy.EditResult
import com.questionbank.app.domain.hierarchy.HierarchyName
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** v0.2.26 on the REAL Room database: counts, rename, delete-if-empty, reorder, breadcrumb path. */
@RunWith(AndroidJUnit4::class)
class HierarchyManageTest {
    private val dbName = "hierarchy_manage_test.db"
    private lateinit var db: QuestionBankDatabase
    private lateinit var repo: TypeCqHierarchyRepositoryImpl

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = TestDb.open(context, dbName)
        repo = TypeCqHierarchyRepositoryImpl(db.typeCqSubjectDao(), db.typeCqChapterDao(), db.typeCqTopicDao())
        write { it.exec("INSERT INTO type_cq_question_types(question_type_id, code, label, sort_order) VALUES('qt1','Q1','Label',0)") }
    }

    @After
    fun tearDown() {
        db.close()
        ApplicationProvider.getApplicationContext<Context>().deleteDatabase(dbName)
    }

    private fun <T> write(block: suspend (androidx.room.Transactor) -> T): T = runBlocking { db.useWriterConnection { block(it) } }

    private fun id(result: AddResult): String {
        assertTrue("expected Added but was $result", result is AddResult.Added)
        return (result as AddResult.Added).id
    }

    private fun addQuestion(questionId: String, topicId: String) =
        write { it.exec(TestDb.INSERT_QUESTION, questionId, topicId, "ক", 1.0, "প্রশ্ন", "উত্তর", 0) }

    private fun deleteQuestion(questionId: String) =
        write { it.exec("DELETE FROM type_cq_questions WHERE question_id = ?", questionId) }

    @Test
    fun rowsCarryChildAndQuestionCounts() = runBlocking {
        val s = id(repo.addSubject("পদার্থ"))
        val c1 = id(repo.addChapter(s, "গতি"))
        val c2 = id(repo.addChapter(s, "বল"))
        val t1 = id(repo.addTopic(c1, "ত্বরণ"))
        val t2 = id(repo.addTopic(c1, "বেগ"))
        val t3 = id(repo.addTopic(c2, "নিউটন"))
        addQuestion("q1", t1); addQuestion("q2", t1); addQuestion("q3", t1)
        addQuestion("q4", t2)
        addQuestion("q5", t3); addQuestion("q6", t3)

        val subject = repo.observeSubjectRows().first().single()
        assertEquals(2, subject.childCount)
        assertEquals(6, subject.questionCount)

        val chapters = repo.observeChapterRows(s).first()
        assertEquals(listOf("গতি", "বল"), chapters.map { it.name })
        assertEquals(listOf(2, 1), chapters.map { it.childCount })
        assertEquals(listOf(4, 2), chapters.map { it.questionCount })

        val topics = repo.observeTopicRows(c1).first()
        assertEquals(listOf("ত্বরণ", "বেগ"), topics.map { it.name })
        assertEquals(listOf(0, 0), topics.map { it.childCount })
        assertEquals(listOf(3, 1), topics.map { it.questionCount })
    }

    @Test
    fun renameKeepsTheIdAndPositionAndRejectsDuplicates() = runBlocking {
        val a = id(repo.addSubject("রসায়ন"))
        val b = id(repo.addSubject("গণিত"))
        assertEquals(EditResult.Done, repo.renameSubject(a, "  জৈব রসায়ন "))
        assertEquals(listOf(a, b), repo.observeSubjects().first().map { it.id })
        assertEquals(listOf("জৈব রসায়ন", "গণিত"), repo.observeSubjects().first().map { it.name })
        assertEquals(EditResult.Duplicate, repo.renameSubject(a, "গণিত"))
        assertEquals(EditResult.Done, repo.renameSubject(a, "জৈব রসায়ন")) // the same name is not a duplicate of itself
        assertEquals(EditResult.Blank, repo.renameSubject(a, "   "))
        assertEquals(EditResult.TooLong, repo.renameSubject(a, "ক".repeat(HierarchyName.MAX_LENGTH + 1)))
        assertEquals(EditResult.NotFound, repo.renameSubject("no-such", "নাম"))
        assertEquals("জৈব রসায়ন", repo.observeSubject(a).first()?.name)
    }

    @Test
    fun renameUsesTheSameCleaningAsAdd() = runBlocking {
        val a = id(repo.addSubject("সম\u09DF"))
        val b = id(repo.addSubject("অন্য"))
        assertEquals(EditResult.Duplicate, repo.renameSubject(b, "সম\u09AF\u09BC"))
        assertEquals("অন্য", repo.observeSubject(b).first()?.name)
        // Names are stored in NFC: the single letter য় (U+09DF) is stored as য + nukta (U+09AF U+09BC).
        assertEquals("সম\u09AF\u09BC", repo.observeSubject(a).first()?.name)
    }

    @Test
    fun chapterAndTopicNamesAreUniqueOnlyInsideTheirParent() = runBlocking {
        val s1 = id(repo.addSubject("পদার্থ"))
        val s2 = id(repo.addSubject("রসায়ন"))
        val c1 = id(repo.addChapter(s1, "গতি"))
        val c1b = id(repo.addChapter(s1, "বল"))
        val c2 = id(repo.addChapter(s2, "ভৌত জগৎ"))
        assertEquals(EditResult.Done, repo.renameChapter(c2, "গতি")) // same name under another subject
        assertEquals(EditResult.Duplicate, repo.renameChapter(c1b, "গতি"))
        assertEquals(EditResult.NotFound, repo.renameChapter("no-such", "x"))

        val t1 = id(repo.addTopic(c1, "বেগ"))
        val t1b = id(repo.addTopic(c1, "ত্বরণ"))
        val t2 = id(repo.addTopic(c1b, "চাপ"))
        assertEquals(EditResult.Done, repo.renameTopic(t2, "বেগ")) // other chapter
        assertEquals(EditResult.Duplicate, repo.renameTopic(t1b, "বেগ"))
        assertEquals(EditResult.NotFound, repo.renameTopic("no-such", "x"))
        assertEquals(listOf("বেগ", "ত্বরণ"), repo.observeTopics(c1).first().map { it.name })
        assertEquals(t1, repo.observeTopics(c1).first().first().id)
    }

    @Test
    fun onlyEmptyItemsAreDeletedAndNothingChangesOtherwise() = runBlocking {
        val s = id(repo.addSubject("পদার্থ"))
        val c = id(repo.addChapter(s, "গতি"))
        val t = id(repo.addTopic(c, "বেগ"))
        addQuestion("q1", t)

        assertEquals(EditResult.NotEmpty(1, 1), repo.deleteSubject(s))
        assertEquals(EditResult.NotEmpty(1, 1), repo.deleteChapter(c))
        assertEquals(EditResult.NotEmpty(0, 1), repo.deleteTopic(t))
        assertEquals(1, repo.observeSubjectRows().first().size)
        assertEquals(1, repo.observeTopicRows(c).first().size)

        deleteQuestion("q1")
        assertEquals(EditResult.Done, repo.deleteTopic(t))
        assertEquals(EditResult.NotEmpty(1, 0), repo.deleteSubject(s)) // the empty chapter is still inside
        assertEquals(EditResult.Done, repo.deleteChapter(c))
        assertEquals(EditResult.Done, repo.deleteSubject(s))
        assertTrue(repo.observeSubjectRows().first().isEmpty())
    }

    @Test
    fun deletingSomethingThatIsGoneIsNotFound() = runBlocking {
        assertEquals(EditResult.NotFound, repo.deleteSubject("no-such"))
        assertEquals(EditResult.NotFound, repo.deleteChapter("no-such"))
        assertEquals(EditResult.NotFound, repo.deleteTopic("no-such"))
    }

    @Test
    fun deletingATopicAlsoRemovesItsUnsavedDraftButNotOthers() = runBlocking {
        val s = id(repo.addSubject("পদার্থ"))
        val c = id(repo.addChapter(s, "গতি"))
        val t1 = id(repo.addTopic(c, "বেগ"))
        val t2 = id(repo.addTopic(c, "ত্বরণ"))
        val insertDraft = "INSERT INTO app_metadata(\"key\", value_json, updated_at) VALUES(?, '{}', 1)"
        write { it.exec(insertDraft, TypeCqQuestionRepositoryImpl.draftKey(t1)) }
        write { it.exec(insertDraft, TypeCqQuestionRepositoryImpl.draftKey(t2)) }

        assertEquals(EditResult.Done, repo.deleteTopic(t1))
        val left = write { it.scalarText("SELECT group_concat(\"key\") FROM app_metadata WHERE \"key\" LIKE 'draft:type_cq:%'") }
        assertEquals(TypeCqQuestionRepositoryImpl.draftKey(t2), left)
    }

    @Test
    fun reorderWritesTheNewOrderAndNewItemsGoLast() = runBlocking {
        val a = id(repo.addSubject("ক-বিষয়"))
        val b = id(repo.addSubject("খ-বিষয়"))
        val c = id(repo.addSubject("গ-বিষয়"))
        assertEquals(EditResult.Done, repo.reorderSubjects(listOf(c, a, b)))
        assertEquals(listOf(c, a, b), repo.observeSubjects().first().map { it.id })
        val d = id(repo.addSubject("ঘ-বিষয়"))
        assertEquals(listOf(c, a, b, d), repo.observeSubjectRows().first().map { it.id })
    }

    @Test
    fun reorderWithAStaleOrBrokenListWritesNothing() = runBlocking {
        val a = id(repo.addSubject("ক-বিষয়"))
        val b = id(repo.addSubject("খ-বিষয়"))
        val c = id(repo.addSubject("গ-বিষয়"))
        assertEquals(EditResult.NotFound, repo.reorderSubjects(listOf(b, a)))            // one missing
        assertEquals(EditResult.NotFound, repo.reorderSubjects(listOf(c, b, a, "x")))     // one unknown
        assertEquals(EditResult.NotFound, repo.reorderSubjects(listOf(a, a, b)))          // duplicate
        assertEquals(listOf(a, b, c), repo.observeSubjects().first().map { it.id })
    }

    @Test
    fun reorderingChaptersAndTopicsStaysInsideTheirParent() = runBlocking {
        val s1 = id(repo.addSubject("পদার্থ"))
        val s2 = id(repo.addSubject("রসায়ন"))
        val a = id(repo.addChapter(s1, "ক"))
        val b = id(repo.addChapter(s1, "খ"))
        val x = id(repo.addChapter(s2, "এক্স"))
        val y = id(repo.addChapter(s2, "ওয়াই"))
        assertEquals(EditResult.Done, repo.reorderChapters(s1, listOf(b, a)))
        assertEquals(listOf(b, a), repo.observeChapters(s1).first().map { it.id })
        assertEquals(listOf(x, y), repo.observeChapters(s2).first().map { it.id })
        assertEquals(EditResult.NotFound, repo.reorderChapters(s1, listOf(x, y)))        // another subject's chapters

        val t1 = id(repo.addTopic(a, "প"))
        val t2 = id(repo.addTopic(a, "ফ"))
        assertEquals(EditResult.Done, repo.reorderTopics(a, listOf(t2, t1)))
        assertEquals(listOf(t2, t1), repo.observeTopicRows(a).first().map { it.id })
    }

    @Test
    fun theBreadcrumbPathFollowsRenamesAndIsNullForUnknownChapters() = runBlocking {
        val s = id(repo.addSubject("পদার্থ"))
        val c = id(repo.addChapter(s, "গতি"))
        val path = repo.observeChapterPath(c).first()
        assertEquals("পদার্থ", path?.subject?.name)
        assertEquals(s, path?.subject?.id)
        assertEquals("গতি", path?.chapter?.name)
        repo.renameSubject(s, "পদার্থবিজ্ঞান")
        assertEquals("পদার্থবিজ্ঞান", repo.observeChapterPath(c).first()?.subject?.name)
        assertNull(repo.observeChapterPath("no-such").first())
    }
}
