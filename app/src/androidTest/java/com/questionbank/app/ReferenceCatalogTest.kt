package com.questionbank.app

import android.content.Context
import androidx.room.useReaderConnection
import androidx.room.useWriterConnection
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.questionbank.app.data.local.QuestionBankDatabase
import com.questionbank.app.data.repository.CategoryRepositoryImpl
import com.questionbank.app.data.repository.TypeCqRepositoryImpl
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Phase 5 reference-data management on the REAL Room database (v0.2.31-phase5-wip2).
 * Written, NOT run in the authoring environment (no Gradle distribution there): UNCONFIRMED until CI / emulator.
 */
@RunWith(AndroidJUnit4::class)
class ReferenceCatalogTest {
    private val dbName = "reference_catalog_test.db"
    private lateinit var context: Context
    private lateinit var db: QuestionBankDatabase
    private lateinit var typeRepo: TypeCqRepositoryImpl
    private lateinit var categories: CategoryRepositoryImpl

    @Before fun setUp() = runBlocking {
        context = ApplicationProvider.getApplicationContext()
        db = TestDb.open(context, dbName)
        typeRepo = TypeCqRepositoryImpl(db.typeCqReferenceDao(), db.categoryDataDao(), db.sharedDataDao())
        categories = CategoryRepositoryImpl(db.categoryDataDao())
        db.useWriterConnection { it.seedHierarchy(1) }
    }

    @After fun tearDown() {
        db.close()
        context.deleteDatabase(dbName)
    }

    private fun typeCategoryId(name: String): String = runBlocking {
        typeRepo.observeCategories().first().first { it.name == name }.categoryId
    }

    private suspend fun addQuestion(id: String) = db.useWriterConnection {
        it.exec(TestDb.INSERT_QUESTION, id, "t1", "ক", 1.0, "প্রশ্ন $id", "উত্তর", 0)
    }

    private suspend fun link(questionId: String, categoryId: String, at: Long) = db.useWriterConnection {
        it.exec("INSERT INTO type_cq_question_category_links(question_id, category_id, assigned_at) VALUES(?,?,?)", questionId, categoryId, at)
    }

    private suspend fun linkCount(categoryId: String): Long = db.useReaderConnection {
        it.scalarLong("SELECT COUNT(*) FROM type_cq_question_category_links WHERE category_id = ?", categoryId)
    }

    @Test fun duplicateCategoryNameOnRenameIsRefusedNotThrown() = runBlocking {
        assertTrue(typeRepo.addCategory("A"))
        assertTrue(typeRepo.addCategory("B"))
        assertFalse(typeRepo.addCategory("A")) // duplicate on add
        assertFalse(typeRepo.renameCategory(typeCategoryId("A"), "B")) // duplicate on rename: false, no exception
        assertTrue(typeRepo.renameCategory(typeCategoryId("A"), "A2"))
    }

    @Test fun linkedCategoryCannotBeArchivedDirectly() = runBlocking {
        typeRepo.addCategory("Used"); typeRepo.addCategory("Card Used"); typeRepo.addCategory("Free")
        addQuestion("q1"); link("q1", typeCategoryId("Used"), 5)
        addQuestion("q2")
        db.useWriterConnection { it.exec("UPDATE type_cq_questions SET card_category_id = ? WHERE question_id = 'q2'", typeCategoryId("Card Used")) }
        assertFalse(typeRepo.setCategoryArchived(typeCategoryId("Used"), true)) // legacy link protects it
        assertFalse(typeRepo.setCategoryArchived(typeCategoryId("Card Used"), true)) // new card reference alone protects it
        assertTrue(typeRepo.setCategoryArchived(typeCategoryId("Free"), true))
    }

    @Test fun reassignMovesLinksKeepsExistingTargetLinkAndArchivesSource() = runBlocking {
        typeRepo.addCategory("Src"); typeRepo.addCategory("Dst")
        val src = typeCategoryId("Src"); val dst = typeCategoryId("Dst")
        addQuestion("q1"); addQuestion("q2")
        link("q1", src, 5); link("q2", src, 6); link("q1", dst, 7) // q1 already has the target: duplicate must not fail
        assertTrue(categories.reassignAndArchiveTypeCategory(src, dst, 100))
        assertEquals(0L, linkCount(src))
        assertEquals(2L, linkCount(dst))
        assertTrue(typeRepo.observeCategories().first().first { it.categoryId == src }.isArchived == 1L)
    }

    @Test fun reassignMovesLegacyAndNewCardCategoryReferencesTogether() = runBlocking {
        typeRepo.addCategory("Card Src"); typeRepo.addCategory("Card Dst")
        val src = typeCategoryId("Card Src"); val dst = typeCategoryId("Card Dst")
        addQuestion("standalone"); addQuestion("stimulus-question")
        link("standalone", src, 11)
        db.useWriterConnection { connection ->
            connection.exec("UPDATE type_cq_questions SET card_category_id = ? WHERE question_id = 'standalone'", src)
            connection.exec("INSERT INTO type_cq_stimuli(stimulus_id, topic_id, stimulus_text, reference_text, created_at, updated_at, card_category_id) VALUES('card-stimulus','t1','','',1,1,?)", src)
            connection.exec("UPDATE type_cq_questions SET stimulus_id = 'card-stimulus' WHERE question_id = 'stimulus-question'")
        }

        assertTrue(categories.reassignAndArchiveTypeCategory(src, dst, 200))
        db.useReaderConnection { connection ->
            assertEquals(dst, connection.scalarText("SELECT card_category_id FROM type_cq_questions WHERE question_id = 'standalone'"))
            assertEquals(dst, connection.scalarText("SELECT card_category_id FROM type_cq_stimuli WHERE stimulus_id = 'card-stimulus'"))
            assertEquals(0L, connection.scalarLong("SELECT COUNT(*) FROM type_cq_questions WHERE card_category_id = ?", src))
            assertEquals(0L, connection.scalarLong("SELECT COUNT(*) FROM type_cq_stimuli WHERE card_category_id = ?", src))
            assertEquals(0L, connection.scalarLong("SELECT COUNT(*) FROM type_cq_question_category_links WHERE category_id = ?", src))
            assertEquals(1L, connection.scalarLong("SELECT COUNT(*) FROM type_cq_question_category_links WHERE question_id = 'standalone' AND category_id = ?", dst))
        }
    }

    @Test fun reassignRefusesSameArchivedOrUnknownTarget() = runBlocking {
        typeRepo.addCategory("Src"); typeRepo.addCategory("Gone")
        val src = typeCategoryId("Src"); val gone = typeCategoryId("Gone")
        assertTrue(typeRepo.setCategoryArchived(gone, true))
        assertFalse(categories.reassignAndArchiveTypeCategory(src, src, 1))
        assertFalse(categories.reassignAndArchiveTypeCategory(src, gone, 1))
        assertFalse(categories.reassignAndArchiveTypeCategory(src, "missing", 1))
    }

    @Test fun chapterCategoriesAreIsolatedFromTypeCategories() = runBlocking {
        assertTrue(categories.addChapterCategory("Shared name"))
        assertTrue(typeRepo.addCategory("Shared name")) // separate tables: same name is allowed
        assertEquals(1, typeRepo.observeCategories().first().count { it.name == "Shared name" })
        assertFalse(categories.addChapterCategory("Shared name"))
    }

    @Test fun customBoardCreateRenameArchiveReactivate() = runBlocking {
        assertTrue(typeRepo.addBoard("tst", "Test Board"))
        assertFalse(typeRepo.addBoard("TST", "Again")) // code already used (case-insensitive)
        val id = typeRepo.observeBoards().first().first { it.code == "TST" }.boardId
        assertTrue(typeRepo.renameBoard(id, "Renamed"))
        assertTrue(typeRepo.setBoardArchived(id, true))
        assertEquals(1L, typeRepo.observeBoards().first().first { it.boardId == id }.isArchived)
        assertTrue(typeRepo.setBoardArchived(id, false))
        assertEquals(0L, typeRepo.observeBoards().first().first { it.boardId == id }.isArchived)
    }

    @Test fun questionTypeLabelRenameFlowsToActiveList() = runBlocking {
        val first = typeRepo.observeQuestionTypes().first().first()
        assertTrue(typeRepo.renameQuestionType(first.questionTypeId, "নতুন লেবেল"))
        assertEquals("নতুন লেবেল", typeRepo.observeQuestionTypes().first().first { it.questionTypeId == first.questionTypeId }.label)
        assertFalse(typeRepo.renameQuestionType(first.questionTypeId, "   "))
    }
}
