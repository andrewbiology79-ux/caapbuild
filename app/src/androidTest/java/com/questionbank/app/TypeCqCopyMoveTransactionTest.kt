package com.questionbank.app

import android.content.Context
import androidx.room.RoomDatabase
import androidx.room.useReaderConnection
import androidx.room.useWriterConnection
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.questionbank.app.data.local.QuestionBankDatabase
import com.questionbank.app.data.local.entity.TypeCqConceptPartsEntity
import com.questionbank.app.data.local.forceFullSync
import com.questionbank.app.data.repository.TypeCqHierarchyRepositoryImpl
import com.questionbank.app.data.repository.TypeCqQuestionRepositoryImpl
import com.questionbank.app.domain.hierarchy.AddResult
import com.questionbank.app.domain.question.CqLabel
import com.questionbank.app.domain.question.QuestionGroupInput
import com.questionbank.app.domain.question.SaveResult
import com.questionbank.app.domain.question.SubQuestionInput
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** Room integration checks for atomic card + concept + order copy/move operations. */
@RunWith(AndroidJUnit4::class)
class TypeCqCopyMoveTransactionTest {
    private val dbName = "type_cq_copy_move_tx_test.db"
    private lateinit var context: Context
    private lateinit var db: QuestionBankDatabase
    private lateinit var repo: TypeCqQuestionRepositoryImpl
    private lateinit var sourceTopic: String
    private lateinit var targetTopic: String

    @Before
    fun setUp() = runBlocking {
        context = ApplicationProvider.getApplicationContext()
        db = TestDb.open(context, dbName)
        val hierarchy = TypeCqHierarchyRepositoryImpl(db.typeCqSubjectDao(), db.typeCqChapterDao(), db.typeCqTopicDao())
        val subject = (hierarchy.addSubject("বিজ্ঞান") as AddResult.Added).id
        val chapter = (hierarchy.addChapter(subject, "অধ্যায়") as AddResult.Added).id
        sourceTopic = (hierarchy.addTopic(chapter, "উৎস টপিক") as AddResult.Added).id
        targetTopic = (hierarchy.addTopic(chapter, "লক্ষ্য টপিক") as AddResult.Added).id
        repo = TypeCqQuestionRepositoryImpl(
            dao = db.typeCqQuestionDao(),
            beforeWrite = { db.forceFullSync() },
            ftsMatch = { topic, match -> db.typeCqFtsMatch(topic, match) },
            conceptDao = db.typeCqConceptDao(),
            database = db,
        )
    }

    @After
    fun tearDown() {
        db.close()
        context.deleteDatabase(dbName)
    }

    private suspend fun addSingle(topic: String, text: String): String {
        val result = repo.saveGroup(QuestionGroupInput(topic, "", listOf(SubQuestionInput(CqLabel.KA, text, "উত্তর"))))
        assertTrue("Question save failed: $result", result is SaveResult.Saved)
        return (result as SaveResult.Saved).questionIds.single()
    }

    private suspend fun addConcept(topic: String, questionId: String) {
        val ok = db.typeCqConceptDao().saveForCard(
            topicId = topic,
            stimulusId = null,
            questionId = questionId,
            rows = listOf(TypeCqConceptPartsEntity("part-$questionId", "", 0, "TEXT", "ধারণার ব্যাখ্যা", null, 1)),
            now = 1,
        )
        assertTrue("Concept save failed", ok)
    }

    @Test
    fun copyDuplicatesConceptAndKeepsTargetOrderAtomic() = runBlocking {
        val sourceId = addSingle(sourceTopic, "মূল প্রশ্ন")
        val anchorId = addSingle(targetTopic, "লক্ষ্য টপিকের প্রথম প্রশ্ন")
        addConcept(sourceTopic, sourceId)
        val targetDraftKey = TypeCqQuestionRepositoryImpl.draftKey(targetTopic)
        db.typeCqQuestionDao().putMeta(targetDraftKey, "unfinished-target-draft", 10)

        val copied = repo.copyGroupToTopic(sourceTopic, "q-$sourceId", targetTopic, "q-$anchorId", beforeAnchor = false)
        assertTrue("Copy failed: $copied", copied is SaveResult.Saved)
        val copiedId = (copied as SaveResult.Saved).questionIds.single()
        assertTrue(sourceId != copiedId)

        val sourceConcept = db.typeCqConceptDao().findForCard(null, sourceId)
        val copiedConcept = db.typeCqConceptDao().findForCard(null, copiedId)
        assertNotNull(sourceConcept)
        assertNotNull(copiedConcept)
        assertEquals(sourceTopic, sourceConcept!!.topicId)
        assertEquals(targetTopic, copiedConcept!!.topicId)
        val copiedParts = db.typeCqConceptDao().parts(copiedConcept.conceptId)
        assertEquals(1, copiedParts.size)
        assertEquals("ধারণার ব্যাখ্যা", copiedParts.single().textContent)
        assertTrue(copiedParts.single().partId != "part-$sourceId")
        assertEquals(2L, db.useReaderConnection { it.scalarLong("SELECT COUNT(*) FROM type_cq_questions WHERE topic_id = ?", targetTopic) })
        assertEquals("unfinished-target-draft", db.typeCqQuestionDao().getMeta(targetDraftKey))
        assertEquals(
            "$anchorId,$copiedId",
            db.useReaderConnection { it.scalarText("SELECT group_concat(question_id, ',') FROM (SELECT question_id FROM type_cq_questions WHERE topic_id = ? ORDER BY sort_order)", targetTopic) },
        )
    }

    @Test
    fun failedFinalReorderRollsBackTheWholeCopy() = runBlocking {
        val sourceId = addSingle(sourceTopic, "কপি হওয়ার কথা ছিল")
        val anchorId = addSingle(targetTopic, "লক্ষ্য টপিকের অক্ষত প্রশ্ন")
        addConcept(sourceTopic, sourceId)
        db.useWriterConnection {
            it.exec("""CREATE TRIGGER fail_target_card_reorder
                BEFORE UPDATE OF sort_order ON type_cq_questions
                WHEN OLD.question_id = '$anchorId' AND NEW.sort_order = 1
                BEGIN SELECT RAISE(ABORT, 'forced reorder failure'); END""")
        }

        val result = repo.copyGroupToTopic(sourceTopic, "q-$sourceId", targetTopic, "q-$anchorId", beforeAnchor = false)
        assertTrue("Expected failed copy after forced ordering failure, got $result", result is SaveResult.Failed)
        assertEquals(1L, db.useReaderConnection { it.scalarLong("SELECT COUNT(*) FROM type_cq_questions WHERE topic_id = ?", sourceTopic) })
        assertEquals(1L, db.useReaderConnection { it.scalarLong("SELECT COUNT(*) FROM type_cq_questions WHERE topic_id = ?", targetTopic) })
        assertEquals(1L, db.useReaderConnection { it.scalarLong("SELECT COUNT(*) FROM type_cq_concepts WHERE topic_id = ?", sourceTopic) })
        assertEquals(0L, db.useReaderConnection { it.scalarLong("SELECT COUNT(*) FROM type_cq_concepts WHERE topic_id = ?", targetTopic) })
    }

    @Test
    fun failedFinalReorderRollsBackTheWholeMoveIncludingConceptOwner() = runBlocking {
        val sourceId = addSingle(sourceTopic, "স্থানান্তর হওয়ার কথা ছিল")
        val anchorId = addSingle(targetTopic, "লক্ষ্য টপিকের অক্ষত প্রশ্ন")
        addConcept(sourceTopic, sourceId)
        db.useWriterConnection {
            it.exec("""CREATE TRIGGER fail_target_card_reorder
                BEFORE UPDATE OF sort_order ON type_cq_questions
                WHEN OLD.question_id = '$anchorId' AND NEW.sort_order = 1
                BEGIN SELECT RAISE(ABORT, 'forced reorder failure'); END""")
        }

        val moved = repo.moveGroupToTopic(sourceTopic, "q-$sourceId", targetTopic, "q-$anchorId", beforeAnchor = false)
        assertTrue("Move should report rollback", !moved)
        assertEquals(1L, db.useReaderConnection { it.scalarLong("SELECT COUNT(*) FROM type_cq_questions WHERE topic_id = ?", sourceTopic) })
        assertEquals(1L, db.useReaderConnection { it.scalarLong("SELECT COUNT(*) FROM type_cq_questions WHERE topic_id = ?", targetTopic) })
        assertEquals(sourceTopic, db.typeCqConceptDao().findForCard(null, sourceId)?.topicId)
    }
    @Test
    fun successfulMoveKeepsQuestionAndConceptIdsAndMovesThemTogether() = runBlocking {
        val sourceId = addSingle(sourceTopic, "স্থানান্তরিত প্রশ্ন")
        val anchorId = addSingle(targetTopic, "লক্ষ্য টপিকের প্রশ্ন")
        addConcept(sourceTopic, sourceId)

        assertTrue(repo.moveGroupToTopic(sourceTopic, "q-$sourceId", targetTopic, "q-$anchorId", beforeAnchor = false))
        assertEquals(0L, db.useReaderConnection { it.scalarLong("SELECT COUNT(*) FROM type_cq_questions WHERE topic_id = ?", sourceTopic) })
        assertEquals(2L, db.useReaderConnection { it.scalarLong("SELECT COUNT(*) FROM type_cq_questions WHERE topic_id = ?", targetTopic) })
        assertEquals(targetTopic, db.typeCqConceptDao().findForCard(null, sourceId)?.topicId)
        assertEquals(
            "$anchorId,$sourceId",
            db.useReaderConnection { it.scalarText("SELECT group_concat(question_id, ',') FROM (SELECT question_id FROM type_cq_questions WHERE topic_id = ? ORDER BY sort_order)", targetTopic) },
        )
    }

    @Test
    fun cuttingAndPastingAGroupBeforeItselfDoesNotMoveItToTheEnd() = runBlocking {
        val firstId = addSingle(sourceTopic, "প্রথম কার্ড")
        val secondId = addSingle(sourceTopic, "দ্বিতীয় কার্ড")
        assertTrue(repo.moveGroupToTopic(sourceTopic, "q-$firstId", sourceTopic, "q-$firstId", beforeAnchor = true))
        assertEquals(
            "$firstId,$secondId",
            db.useReaderConnection { it.scalarText("SELECT group_concat(question_id, ',') FROM (SELECT question_id FROM type_cq_questions WHERE topic_id = ? ORDER BY sort_order)", sourceTopic) },
        )
    }

}
