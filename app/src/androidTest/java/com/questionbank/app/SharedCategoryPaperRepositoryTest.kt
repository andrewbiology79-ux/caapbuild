package com.questionbank.app

import android.content.Context
import androidx.room.useReaderConnection
import androidx.room.useWriterConnection
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.questionbank.app.data.local.QuestionBankDatabase
import com.questionbank.app.data.local.entity.PaperQuestionItemsEntity
import com.questionbank.app.data.repository.CategoryRepositoryImpl
import com.questionbank.app.data.repository.EditorDraftRepositoryImpl
import com.questionbank.app.data.repository.PaperRepositoryImpl
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** Phase 4: category reassignment, paper snapshots and editor-draft storage on the real Room database. */
@RunWith(AndroidJUnit4::class)
class SharedCategoryPaperRepositoryTest {
    private val dbName = "shared_category_paper_repository_test.db"
    private lateinit var context: Context
    private lateinit var db: QuestionBankDatabase

    @Before fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        db = TestDb.open(context, dbName)
    }

    @After fun tearDown() {
        db.close()
        context.deleteDatabase(dbName)
    }

    private fun <T> write(block: suspend (androidx.room.Transactor) -> T): T = runBlocking { db.useWriterConnection { block(it) } }
    private fun count(sql: String): Long = runBlocking { db.useReaderConnection { it.scalarLong(sql) } }

    private fun seedTypeCategories() = write {
        it.exec("INSERT INTO type_cq_question_categories(category_id, name, created_at, updated_at) VALUES('tc1','A',1,1)")
        it.exec("INSERT INTO type_cq_question_categories(category_id, name, created_at, updated_at) VALUES('tc2','B',1,1)")
    }

    @Test fun editorDraftRoundTripKeepsScopesSeparate() = runBlocking {
        val repo = EditorDraftRepositoryImpl(db.sharedDataDao())
        repo.save("type_cq", "owner1", "{\"text\":\"a\"}")
        assertEquals("{\"text\":\"a\"}", repo.load("type_cq", "owner1"))
        assertNull(repo.load("chapter_cq", "owner1"))
        repo.discard("type_cq", "owner1")
        assertNull(repo.load("type_cq", "owner1"))
    }

    @Test fun typeCategoryReassignMovesLinksArchivesSourceAndLeavesChapterScopeAlone() = runBlocking {
        seedTypeCategories()
        write {
            it.exec("INSERT INTO chapter_cq_question_categories(category_id, name, created_at, updated_at) VALUES('cc1','Chapter',1,1)")
            it.seedHierarchy()
            it.exec(TestDb.INSERT_QUESTION, "q1", "t1", "ক", 1.0, "প্রশ্ন", "উত্তর", 0)
            it.exec("INSERT INTO type_cq_question_category_links(question_id, category_id, assigned_at) VALUES('q1','tc1',1)")
        }
        val repo = CategoryRepositoryImpl(db.categoryDataDao())
        assertTrue(repo.reassignAndArchiveTypeCategory("tc1", "tc2", 5))
        assertEquals(0L, count("SELECT COUNT(*) FROM type_cq_question_category_links WHERE category_id = 'tc1'"))
        assertEquals(1L, count("SELECT COUNT(*) FROM type_cq_question_category_links WHERE category_id = 'tc2' AND question_id = 'q1'"))
        assertEquals(1L, count("SELECT is_archived FROM type_cq_question_categories WHERE category_id = 'tc1'"))
        assertEquals(0L, count("SELECT is_archived FROM chapter_cq_question_categories WHERE category_id = 'cc1'"))
    }

    @Test fun categoryReassignRejectsSameOrUnknownTarget() = runBlocking {
        seedTypeCategories()
        val repo = CategoryRepositoryImpl(db.categoryDataDao())
        assertFalse(repo.reassignAndArchiveTypeCategory("tc1", "tc1", 5))
        assertFalse(repo.reassignAndArchiveTypeCategory("tc1", "missing", 5))
        assertEquals(0L, count("SELECT is_archived FROM type_cq_question_categories WHERE category_id = 'tc1'"))
    }

    private fun seedPaperAndTypeQuestion() = write {
        it.seedHierarchy()
        it.exec(TestDb.INSERT_QUESTION, "q1", "t1", "ক", 1.0, "প্রশ্ন", "উত্তর", 0)
        it.exec("INSERT INTO paper_categories(paper_category_id, name, created_at, updated_at) VALUES('pc1','Cat',1,1)")
        it.exec("INSERT INTO papers(paper_id, paper_category_id, title, created_at, updated_at) VALUES('p1','pc1','Paper',1,1)")
    }

    private fun item(id: String, paper: String, typeQ: String?, chapterQ: String?) =
        PaperQuestionItemsEntity(id, paper, null, typeQ, chapterQ, "{\"snapshot\":true}", 0, null, 1)

    @Test fun paperSnapshotIsStoredForExistingSourceAndRejectedForInvalidReferences() = runBlocking {
        seedPaperAndTypeQuestion()
        val repo = PaperRepositoryImpl(db.sharedDataDao())
        assertTrue(repo.addSnapshotItem(item("i1", "p1", "q1", null)))
        assertFalse(repo.addSnapshotItem(item("i2", "p1", "missing", null)))
        assertFalse(repo.addSnapshotItem(item("i3", "missing-paper", "q1", null)))
        assertFalse(repo.addSnapshotItem(item("i4", "p1", "q1", "chq-x")))
        assertFalse(repo.addSnapshotItem(item("i5", "p1", null, null)))
        assertEquals(1L, count("SELECT COUNT(*) FROM paper_question_items"))
    }
}
