package com.questionbank.app

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.questionbank.app.data.local.QuestionBankDatabase
import com.questionbank.app.data.repository.TypeCqHierarchyRepositoryImpl
import com.questionbank.app.domain.hierarchy.AddResult
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

/** Repository on the REAL Room database: ordering, duplicates, parents, scope isolation. */
@RunWith(AndroidJUnit4::class)
class TypeCqHierarchyRepositoryTest {
    private val dbName = "hierarchy_test.db"
    private lateinit var db: QuestionBankDatabase
    private lateinit var repo: TypeCqHierarchyRepositoryImpl

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = TestDb.open(context, dbName)
        repo = TypeCqHierarchyRepositoryImpl(db.typeCqSubjectDao(), db.typeCqChapterDao(), db.typeCqTopicDao())
    }

    @After
    fun tearDown() {
        db.close()
        ApplicationProvider.getApplicationContext<Context>().deleteDatabase(dbName)
    }

    private fun addedId(result: AddResult): String {
        assertTrue("expected Added but was $result", result is AddResult.Added)
        return (result as AddResult.Added).id
    }

    @Test
    fun subjectsComeBackInInsertionOrderWithDistinctIds() = runBlocking {
        val a = addedId(repo.addSubject("রসায়ন"))
        val b = addedId(repo.addSubject("পদার্থবিজ্ঞান"))
        val c = addedId(repo.addSubject("গণিত"))
        val list = repo.observeSubjects().first()
        assertEquals(listOf("রসায়ন", "পদার্থবিজ্ঞান", "গণিত"), list.map { it.name })
        assertEquals(listOf(a, b, c), list.map { it.id })
        assertEquals(3, list.map { it.id }.toSet().size)
    }

    @Test
    fun blankAndTooLongNamesAreRejectedAndNothingIsStored() = runBlocking {
        assertEquals(AddResult.Blank, repo.addSubject("   "))
        assertEquals(AddResult.TooLong, repo.addSubject("ক".repeat(HierarchyName.MAX_LENGTH + 1)))
        assertTrue(repo.observeSubjects().first().isEmpty())
    }

    @Test
    fun duplicateSubjectIsRejectedAcrossSpellingsAndSpacing() = runBlocking {
        addedId(repo.addSubject("সম\u09DF"))
        assertEquals(AddResult.Duplicate, repo.addSubject("সম\u09AF\u09BC"))
        assertEquals(AddResult.Duplicate, repo.addSubject("  সম\u09DF  "))
        assertEquals(1, repo.observeSubjects().first().size)
    }

    @Test
    fun chapterNeedsAnExistingSubject() = runBlocking {
        assertEquals(AddResult.ParentMissing, repo.addChapter("no-such-subject", "অধ্যায় ১"))
        assertEquals(AddResult.ParentMissing, repo.addTopic("no-such-chapter", "টপিক ১"))
    }

    @Test
    fun chaptersAreScopedToTheirSubject() = runBlocking {
        val s1 = addedId(repo.addSubject("পদার্থ"))
        val s2 = addedId(repo.addSubject("রসায়ন"))
        addedId(repo.addChapter(s1, "ভৌত জগৎ"))
        addedId(repo.addChapter(s1, "গতি"))
        addedId(repo.addChapter(s2, "ভৌত জগৎ")) // same name under another subject is allowed
        assertEquals(AddResult.Duplicate, repo.addChapter(s1, "গতি"))
        assertEquals(listOf("ভৌত জগৎ", "গতি"), repo.observeChapters(s1).first().map { it.name })
        assertEquals(listOf("ভৌত জগৎ"), repo.observeChapters(s2).first().map { it.name })
    }

    @Test
    fun topicsAreScopedAndTheWholePathCanBeRead() = runBlocking {
        val s = addedId(repo.addSubject("পদার্থ"))
        val c1 = addedId(repo.addChapter(s, "গতি"))
        val c2 = addedId(repo.addChapter(s, "বল"))
        val t1 = addedId(repo.addTopic(c1, "ত্বরণ"))
        addedId(repo.addTopic(c1, "বেগ"))
        addedId(repo.addTopic(c2, "ত্বরণ"))
        assertEquals(AddResult.Duplicate, repo.addTopic(c1, "বেগ"))
        assertEquals(listOf("ত্বরণ", "বেগ"), repo.observeTopics(c1).first().map { it.name })
        assertEquals(listOf("ত্বরণ"), repo.observeTopics(c2).first().map { it.name })
        assertEquals("গতি", repo.observeChapter(c1).first()?.name)
        assertEquals("পদার্থ", repo.observeSubject(s).first()?.name)
        val path = repo.observeTopicPath(t1).first()!!
        assertEquals("পদার্থ", path.subject.name)
        assertEquals("গতি", path.chapter.name)
        assertEquals("ত্বরণ", path.topic.name)
        assertNull(repo.observeTopicPath("no-such-topic").first())
    }

    @Test
    fun chapterCqTablesStayUntouched() = runBlocking {
        val s = addedId(repo.addSubject("পদার্থ"))
        addedId(repo.addChapter(s, "গতি"))
        assertEquals(0L, db.smokeDao().countChapterSubjects())
        assertEquals(1L, db.smokeDao().countTypeSubjects())
    }
}
