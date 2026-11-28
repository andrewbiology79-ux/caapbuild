package com.questionbank.app

import android.content.Context
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.useReaderConnection
import androidx.room.useWriterConnection
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import androidx.sqlite.execSQL
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.questionbank.app.data.local.QuestionBankDatabase
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Review fix (Finding 7): the REAL Room 1 -> 2 migration, without room-testing (its serialization library clashed with the
 * app's at runtime). The version-1 database is built from the exported Room schema 1.json (tables, indices, room_master_table
 * with the v1 identity hash, user_version 1), filled with rows, then opened by Room with MIGRATION_1_2. Room itself validates
 * the migrated tables / foreign keys / index NAMES against its 2.json expectations and throws if they differ.
 */
@RunWith(AndroidJUnit4::class)
class RoomMigration1To2Test {
    private val dbName = "migration_1_2_test.db"
    private val context: Context = ApplicationProvider.getApplicationContext()
    private var room: QuestionBankDatabase? = null

    @After
    fun tearDown() {
        runCatching { room?.close() }
        context.deleteDatabase(dbName)
    }

    private fun createVersion1Database(rows: List<String>) {
        context.deleteDatabase(dbName)
        val file = context.getDatabasePath(dbName)
        file.parentFile?.mkdirs()
        val json = InstrumentationRegistry.getInstrumentation().context.assets
            .open("com.questionbank.app.data.local.QuestionBankDatabase/1.json").bufferedReader().use { it.readText() }
        val database = JSONObject(json).getJSONObject("database")
        check(database.getInt("version") == 1) { "1.json must be schema version 1" }
        val connection = BundledSQLiteDriver().open(file.absolutePath)
        try {
            val entities = database.getJSONArray("entities")
            for (i in 0 until entities.length()) {
                val entity = entities.getJSONObject(i)
                val table = entity.getString("tableName")
                connection.execSQL(entity.getString("createSql").replace("\${TABLE_NAME}", table))
                val indices = entity.optJSONArray("indices")
                if (indices != null) {
                    for (j in 0 until indices.length()) {
                        connection.execSQL(indices.getJSONObject(j).getString("createSql").replace("\${TABLE_NAME}", table))
                    }
                }
            }
            val setup = database.getJSONArray("setupQueries")
            for (i in 0 until setup.length()) connection.execSQL(setup.getString(i))
            rows.forEach { connection.execSQL(it) }
            connection.execSQL("PRAGMA user_version = 1")
        } finally {
            connection.close()
        }
    }

    private fun openWithMigration(): QuestionBankDatabase =
        Room.databaseBuilder(context, QuestionBankDatabase::class.java, dbName)
            .setDriver(BundledSQLiteDriver())
            .setJournalMode(RoomDatabase.JournalMode.WRITE_AHEAD_LOGGING)
            .addMigrations(QuestionBankDatabase.MIGRATION_1_2)
            .build()
            .also { room = it }

    @Test
    fun migrationKeepsOldRowsCreatesTheStimulusLinkTableAndPassesRoomValidation() = runBlocking {
        createVersion1Database(
            listOf(
                "INSERT INTO type_cq_subjects(subject_id, name, sort_order, created_at, updated_at) VALUES('s1', 'বিষয়', 0, 1, 1)",
                "INSERT INTO type_cq_chapters(chapter_id, subject_id, name, sort_order, created_at, updated_at) VALUES('c1', 's1', 'অধ্যায়', 0, 1, 1)",
                "INSERT INTO type_cq_topics(topic_id, chapter_id, name, sort_order, created_at, updated_at) VALUES('t1', 'c1', 'টপিক', 0, 1, 1)",
                "INSERT INTO type_cq_question_types(question_type_id, code, label, sort_order, is_active) VALUES('qt1', 'GENERAL', 'সাধারণ', 0, 1)",
                "INSERT INTO type_cq_stimuli(stimulus_id, topic_id, stimulus_text, rating, reference_text, created_at, updated_at) VALUES('st1', 't1', 'উদ্দীপক', NULL, '', 1, 1)",
                "INSERT INTO type_cq_questions(question_id, fts_id, stimulus_id, topic_id, question_type_id, subquestion_label, marks, " +
                    "question_text, short_answer, rating, sort_order, created_at, updated_at) VALUES('q1', 1, 'st1', 't1', 'qt1', 'ক', 1.0, 'প্রশ্ন', '', NULL, 1, 1, 1)",
                "INSERT INTO type_cq_question_categories(category_id, name, description, color, icon, sort_order, is_archived, created_at, updated_at) VALUES('cat1', 'ক্যাটাগরি', '', '', '', 0, 0, 1, 1)",
                "INSERT INTO type_cq_question_category_links(question_id, category_id, assigned_at) VALUES('q1', 'cat1', 5)",
            ),
        )

        // Opening runs the real MIGRATION_1_2; Room validates the result against its schema and throws on any difference.
        val db = openWithMigration()
        db.useReaderConnection { c ->
            assertEquals(1L, c.scalarLong("SELECT COUNT(*) FROM type_cq_questions"))
            assertEquals(1L, c.scalarLong("SELECT COUNT(*) FROM type_cq_question_category_links WHERE question_id = 'q1' AND category_id = 'cat1' AND assigned_at = 5"))
            assertEquals(0L, c.scalarLong("SELECT COUNT(*) FROM type_cq_stimulus_category_links"))
            assertEquals(1L, c.scalarLong("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'index_type_cq_stimulus_category_links_category_id_stimulus_id'"))
            assertEquals(2L, c.scalarLong("PRAGMA user_version"))
        }
        // the new table works and its foreign keys cascade
        db.useWriterConnection { c ->
            c.exec("PRAGMA foreign_keys = ON")
            c.exec("INSERT INTO type_cq_stimulus_category_links(stimulus_id, category_id, assigned_at) VALUES('st1', 'cat1', 9)")
            assertEquals(1L, c.scalarLong("SELECT COUNT(*) FROM type_cq_stimulus_category_links"))
            c.exec("DELETE FROM type_cq_questions WHERE question_id = 'q1'")
            c.exec("DELETE FROM type_cq_stimuli WHERE stimulus_id = 'st1'")
            assertEquals(0L, c.scalarLong("SELECT COUNT(*) FROM type_cq_stimulus_category_links"))
        }
    }
}
