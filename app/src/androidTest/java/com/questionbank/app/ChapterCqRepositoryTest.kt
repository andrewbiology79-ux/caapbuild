package com.questionbank.app

import android.content.Context
import androidx.room.useReaderConnection
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.questionbank.app.data.local.QuestionBankDatabase
import com.questionbank.app.data.local.entity.ChapterCqChaptersEntity
import com.questionbank.app.data.local.entity.ChapterCqQuestionsEntity
import com.questionbank.app.data.local.entity.ChapterCqSubjectsEntity
import com.questionbank.app.data.repository.ChapterCqRepositoryImpl
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ChapterCqRepositoryTest {
    private val dbName = "chapter_cq_repository_test.db"
    private lateinit var context: Context
    private lateinit var db: QuestionBankDatabase
    private lateinit var repository: ChapterCqRepositoryImpl

    @Before fun setUp() = runBlocking {
        context = ApplicationProvider.getApplicationContext()
        db = TestDb.open(context, dbName)
        repository = ChapterCqRepositoryImpl(db.chapterCqDataDao())
        db.chapterCqDataDao().insertSubject(ChapterCqSubjectsEntity("cs1", "Chapter Subject", 0, 1, 1))
        db.chapterCqDataDao().insertChapter(ChapterCqChaptersEntity("cc1", "cs1", "Chapter One", 0, 1, 1))
    }

    @After fun tearDown() {
        db.close()
        context.deleteDatabase(dbName)
    }

    @Test fun chapterSaveAllocatesItsOwnFtsIdAndDoesNotWriteTypeCq() = runBlocking {
        val saved = repository.saveQuestion(
            ChapterCqQuestionsEntity("chq1", 0, null, "cc1", "ক", 1.0, "Chapter-only question", "answer", null, 0, 2, 2)
        )
        assertTrue(saved)
        val ftsId = db.useReaderConnection { it.scalarLong("SELECT fts_id FROM chapter_cq_questions WHERE question_id = 'chq1'") }
        val typeCount = db.useReaderConnection { it.scalarLong("SELECT COUNT(*) FROM type_cq_questions") }
        val ftsCount = db.useReaderConnection { it.scalarLong("SELECT COUNT(*) FROM chapter_cq_question_fts WHERE chapter_cq_question_fts MATCH 'Chapter'") }
        assertEquals(1L, ftsId)
        assertEquals(0L, typeCount)
        assertEquals(1L, ftsCount)
    }

    @Test fun invalidChapterReferenceIsRejectedWithoutWriting() = runBlocking {
        val saved = repository.saveQuestion(
            ChapterCqQuestionsEntity("chq2", 0, null, "missing-chapter", "ক", 1.0, "Invalid", "", null, 0, 2, 2)
        )
        val count = db.useReaderConnection { it.scalarLong("SELECT COUNT(*) FROM chapter_cq_questions WHERE question_id = 'chq2'") }
        assertFalse(saved)
        assertEquals(0L, count)
    }

    @Test fun nonPositiveMarksAreRejectedWithoutWriting() = runBlocking {
        val saved = repository.saveQuestion(
            ChapterCqQuestionsEntity("chq3", 0, null, "cc1", "ক", 0.0, "Invalid marks", "", null, 0, 2, 2)
        )
        assertFalse(saved)
    }
}
