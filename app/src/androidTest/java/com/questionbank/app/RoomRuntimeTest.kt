package com.questionbank.app

import android.content.Context
import android.util.Log
import androidx.room.Transactor
import androidx.room.useWriterConnection
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.questionbank.app.TestDb.INSERT_QUESTION
import com.questionbank.app.data.local.CanonicalDatabaseObjects
import com.questionbank.app.data.local.QuestionBankDatabase
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Runtime checks on the REAL Room database (bundled SQLite driver, WAL, canonical callback).
 * The JVM tests only check the SQL on JDBC SQLite; these tests check what the app really opens.
 */
@RunWith(AndroidJUnit4::class)
class RoomRuntimeTest {
    private val dbName = "runtime_test.db"
    private lateinit var db: QuestionBankDatabase

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = TestDb.open(context, dbName)
        runBlocking { db.useWriterConnection { it.seedHierarchy() } }
    }

    @After
    fun tearDown() {
        db.close()
        ApplicationProvider.getApplicationContext<Context>().deleteDatabase(dbName)
    }

    private fun <T> write(block: suspend (Transactor) -> T): T = runBlocking { db.useWriterConnection { block(it) } }

    private fun expectFailure(message: String, block: suspend (Transactor) -> Unit) {
        val failed = try {
            write(block)
            false
        } catch (e: Exception) {
            true
        }
        assertTrue(message, failed)
    }

    @Test
    fun walJournalModeIsActive() {
        val mode = write { it.scalarText("PRAGMA journal_mode") }
        assertEquals("wal", mode.lowercase())
    }

    @Test
    fun foreignKeysAreEnabledAndEnforced() {
        assertEquals(1L, write { it.scalarLong("PRAGMA foreign_keys") })
        expectFailure("chapter with unknown subject must be rejected") {
            it.exec("INSERT INTO type_cq_chapters(chapter_id, subject_id, name, sort_order, created_at, updated_at) VALUES('cx','missing','X',0,1,1)")
        }
    }

    @Test
    fun installedObjectsMatchInstaller() {
        val expectedTriggers = CanonicalDatabaseObjects.statements.count {
            it.trimStart().startsWith("CREATE TRIGGER", ignoreCase = true)
        }
        assertEquals("17 canonical + 46 CHECK-emulation", 63, expectedTriggers)
        val actualTriggers = write { it.scalarLong("SELECT COUNT(*) FROM sqlite_master WHERE type='trigger'") }
        assertEquals(expectedTriggers.toLong(), actualTriggers)
        val ftsTables = write {
            it.scalarLong("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND sql LIKE 'CREATE VIRTUAL TABLE%'")
        }
        assertEquals(2L, ftsTables)
        val ordinary = write {
            it.scalarLong(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND sql NOT LIKE 'CREATE VIRTUAL TABLE%' " +
                    "AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts_%' AND name <> 'room_master_table'"
            )
        }
        assertEquals(35L, ordinary)
    }

    @Test
    fun checkEmulationRejectsInvalidRows() {
        expectFailure("marks = 0 must be rejected") { it.exec(INSERT_QUESTION, "b1", "t1", "ক", 0.0, "x", "y", 0) }
        expectFailure("label outside ক/খ/গ/ঘ must be rejected") { it.exec(INSERT_QUESTION, "b2", "t1", "ঙ", 1.0, "x", "y", 0) }
        write { it.exec(INSERT_QUESTION, "ok", "t1", "ক", 1.0, "text", "answer", 0) }
        assertEquals(1L, write { it.scalarLong("SELECT COUNT(*) FROM type_cq_questions") })
        expectFailure("rating 6 must be rejected on update") { it.exec("UPDATE type_cq_questions SET rating = 6 WHERE question_id = 'ok'") }
    }

    @Test
    fun topicMismatchTriggerRejectsStimulusOfAnotherTopic() {
        write { it.exec("INSERT INTO type_cq_stimuli(stimulus_id, topic_id, stimulus_text, reference_text, created_at, updated_at) VALUES('st1','t1','','',1,1)") }
        expectFailure("question topic must match stimulus topic") {
            it.exec(
                "INSERT INTO type_cq_questions(question_id, stimulus_id, topic_id, question_type_id, subquestion_label, marks, created_at, updated_at) " +
                    "VALUES('m1','st1','t2','qt1','ক',1,1,1)"
            )
        }
    }

    @Test
    fun ftsStaysInSyncWithInsertUpdateDelete() {
        write { it.exec(INSERT_QUESTION, "q1", "t1", "ক", 1.0, "বিদ্যুৎ প্রবাহ কী", "উত্তর", 0) }
        assertEquals(1L, write { it.ftsCount("\"বিদ্যুৎ\"") })
        write { it.exec("UPDATE type_cq_questions SET question_text = ? WHERE question_id = 'q1'", "চুম্বক ক্ষেত্র") }
        assertEquals(0L, write { it.ftsCount("\"বিদ্যুৎ\"") })
        assertEquals(1L, write { it.ftsCount("\"চুম্বক\"") })
        write { it.exec("DELETE FROM type_cq_questions WHERE question_id = 'q1'") }
        assertEquals(0L, write { it.ftsCount("\"চুম্বক\"") })
    }

    @Test
    fun banglaWordsAndPrefixesAreSearchable() {
        val rows = listOf(
            "বিদ্যুৎ প্রবাহ", "কর্মক্ষমতা বৃদ্ধি", "প্রতিক্রিয়া ও বিক্রিয়া", "শক্তি সংরক্ষণ"
        )
        rows.forEachIndexed { i, text -> write { it.exec(INSERT_QUESTION, "b$i", "t1", "ক", 1.0, text, "", i) } }
        for (word in listOf("বিদ্যুৎ", "কর্মক্ষমতা", "প্রতিক্রিয়া", "বিক্রিয়া", "শক্তি")) {
            assertEquals("whole word: $word", 1L, write { it.ftsCount("\"$word\"") })
        }
        assertEquals("prefix বিদ্য", 1L, write { it.ftsCount("\"বিদ্য\"*") })
        assertEquals("prefix কর্ম", 1L, write { it.ftsCount("\"কর্ম\"*") })
    }

    /** Informational (no assertion): Unicode normalization of য় (U+09DF vs U+09AF U+09BC). */
    @Test
    fun banglaNormalizationReport() {
        write { it.exec(INSERT_QUESTION, "n1", "t1", "ক", 1.0, "দ\u09DFা করে", "", 0) }
        val precomposed = write { it.ftsCount("\"দ\u09DFা\"") }
        val decomposed = write { it.ftsCount("\"দ\u09AF\u09BCা\"") }
        Log.i("QB_BENCH", "normalization: indexed precomposed U+09DF; query precomposed=$precomposed decomposed=$decomposed")
    }
}
