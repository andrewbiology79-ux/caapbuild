package com.questionbank.app

import android.database.Cursor
import androidx.room.testing.MigrationTestHelper
import androidx.sqlite.db.SupportSQLiteDatabase
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.questionbank.app.data.local.QuestionBankDatabase
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Review fix (Finding 7): the REAL Room 1 -> 2 migration. A version-1 Room database is created from the exported 1.json,
 * filled with representative rows, migrated with QuestionBankDatabase.MIGRATION_1_2 and validated by Room against 2.json
 * (table shape, foreign keys and index NAMES). Needs schemas/1.json and 2.json as androidTest assets (see app/build.gradle.kts).
 */
@RunWith(AndroidJUnit4::class)
class RoomMigration1To2Test {
    private val dbName = "migration_1_2_test.db"

    @get:Rule
    val helper = MigrationTestHelper(InstrumentationRegistry.getInstrumentation(), QuestionBankDatabase::class.java)

    private fun SupportSQLiteDatabase.scalar(sql: String): Long =
        query(sql).use { c: Cursor -> if (c.moveToFirst()) c.getLong(0) else -1L }

    @Test
    fun migrationKeepsOldRowsCreatesTheStimulusLinkTableAndPassesRoomValidation() {
        helper.createDatabase(dbName, 1).use { v1 ->
            v1.execSQL("INSERT INTO type_cq_subjects(subject_id, name, sort_order, created_at, updated_at) VALUES('s1', 'বিষয়', 0, 1, 1)")
            v1.execSQL("INSERT INTO type_cq_chapters(chapter_id, subject_id, name, sort_order, created_at, updated_at) VALUES('c1', 's1', 'অধ্যায়', 0, 1, 1)")
            v1.execSQL("INSERT INTO type_cq_topics(topic_id, chapter_id, name, sort_order, created_at, updated_at) VALUES('t1', 'c1', 'টপিক', 0, 1, 1)")
            v1.execSQL("INSERT INTO type_cq_question_types(question_type_id, code, label, sort_order, is_active) VALUES('qt1', 'GENERAL', 'সাধারণ', 0, 1)")
            v1.execSQL("INSERT INTO type_cq_stimuli(stimulus_id, topic_id, stimulus_text, rating, reference_text, created_at, updated_at) VALUES('st1', 't1', 'উদ্দীপক', NULL, '', 1, 1)")
            v1.execSQL(
                "INSERT INTO type_cq_questions(question_id, fts_id, stimulus_id, topic_id, question_type_id, subquestion_label, marks, " +
                    "question_text, short_answer, rating, sort_order, created_at, updated_at) VALUES('q1', 1, 'st1', 't1', 'qt1', 'ক', 1.0, 'প্রশ্ন', '', NULL, 1, 1, 1)",
            )
            v1.execSQL("INSERT INTO type_cq_question_categories(category_id, name, description, color, icon, sort_order, is_archived, created_at, updated_at) VALUES('cat1', 'ক্যাটাগরি', '', '', '', 0, 0, 1, 1)")
            v1.execSQL("INSERT INTO type_cq_question_category_links(question_id, category_id, assigned_at) VALUES('q1', 'cat1', 5)")
        }

        // Runs the real MIGRATION_1_2 and lets Room validate the result against schemas/2.json.
        helper.runMigrationsAndValidate(dbName, 2, true, QuestionBankDatabase.MIGRATION_1_2).use { v2 ->
            // old data is intact
            assertEquals(1L, v2.scalar("SELECT COUNT(*) FROM type_cq_questions"))
            assertEquals(1L, v2.scalar("SELECT COUNT(*) FROM type_cq_question_category_links WHERE question_id = 'q1' AND category_id = 'cat1' AND assigned_at = 5"))

            // the new relation table exists, is empty, and has the Room-named index
            assertEquals(0L, v2.scalar("SELECT COUNT(*) FROM type_cq_stimulus_category_links"))
            assertEquals(1L, v2.scalar("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'index_type_cq_stimulus_category_links_category_id_stimulus_id'"))

            // it works: insert, FK behaviour, cascade
            v2.execSQL("PRAGMA foreign_keys = ON")
            v2.execSQL("INSERT INTO type_cq_stimulus_category_links(stimulus_id, category_id, assigned_at) VALUES('st1', 'cat1', 9)")
            assertEquals(1L, v2.scalar("SELECT COUNT(*) FROM type_cq_stimulus_category_links"))
            assertEquals(0, v2.query("PRAGMA foreign_key_check").use { it.count })
            v2.execSQL("DELETE FROM type_cq_questions WHERE question_id = 'q1'")
            v2.execSQL("DELETE FROM type_cq_stimuli WHERE stimulus_id = 'st1'")
            assertEquals(0L, v2.scalar("SELECT COUNT(*) FROM type_cq_stimulus_category_links"))
        }
    }
}
