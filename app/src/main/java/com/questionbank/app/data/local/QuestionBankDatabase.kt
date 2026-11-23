package com.questionbank.app.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import androidx.sqlite.SQLiteConnection
import androidx.sqlite.execSQL
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import com.questionbank.app.data.local.dao.TypeCqChapterDao
import com.questionbank.app.data.local.dao.TypeCqQuestionDao
import com.questionbank.app.data.local.dao.TypeCqSubjectDao
import com.questionbank.app.data.local.dao.TypeCqTopicDao
import com.questionbank.app.data.local.entity.AppMetadataEntity
import com.questionbank.app.data.local.entity.BoardCatalogEntity
import com.questionbank.app.data.local.entity.ChapterCqChaptersEntity
import com.questionbank.app.data.local.entity.ChapterCqImagesEntity
import com.questionbank.app.data.local.entity.ChapterCqQuestionBoardsEntity
import com.questionbank.app.data.local.entity.ChapterCqQuestionCategoriesEntity
import com.questionbank.app.data.local.entity.ChapterCqQuestionCategoryLinksEntity
import com.questionbank.app.data.local.entity.ChapterCqQuestionsEntity
import com.questionbank.app.data.local.entity.ChapterCqSolutionPartsEntity
import com.questionbank.app.data.local.entity.ChapterCqStimuliEntity
import com.questionbank.app.data.local.entity.ChapterCqStimulusBoardsEntity
import com.questionbank.app.data.local.entity.ChapterCqStimulusImagesEntity
import com.questionbank.app.data.local.entity.ChapterCqSubjectsEntity
import com.questionbank.app.data.local.entity.OperationJournalEntity
import com.questionbank.app.data.local.entity.PaperCategoriesEntity
import com.questionbank.app.data.local.entity.PaperImagesEntity
import com.questionbank.app.data.local.entity.PaperItemImagesEntity
import com.questionbank.app.data.local.entity.PaperItemOverridesEntity
import com.questionbank.app.data.local.entity.PaperQuestionItemsEntity
import com.questionbank.app.data.local.entity.PaperSectionsEntity
import com.questionbank.app.data.local.entity.PapersEntity
import com.questionbank.app.data.local.entity.SchemaMigrationsEntity
import com.questionbank.app.data.local.entity.TypeCqChaptersEntity
import com.questionbank.app.data.local.entity.TypeCqConceptsEntity
import com.questionbank.app.data.local.entity.TypeCqConceptPartsEntity
import com.questionbank.app.data.local.entity.TypeCqImagesEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionBoardsEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionCategoriesEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionCategoryLinksEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionTypesEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionsEntity
import com.questionbank.app.data.local.entity.TypeCqSolutionPartsEntity
import com.questionbank.app.data.local.entity.TypeCqStimuliEntity
import com.questionbank.app.data.local.entity.TypeCqStimulusBoardsEntity
import com.questionbank.app.data.local.entity.TypeCqStimulusImagesEntity
import com.questionbank.app.data.local.entity.TypeCqSubjectsEntity
import com.questionbank.app.data.local.entity.TypeCqTopicsEntity

@Database(
    entities = [
        AppMetadataEntity::class,
        BoardCatalogEntity::class,
        ChapterCqChaptersEntity::class,
        ChapterCqImagesEntity::class,
        ChapterCqQuestionBoardsEntity::class,
        ChapterCqQuestionCategoriesEntity::class,
        ChapterCqQuestionCategoryLinksEntity::class,
        ChapterCqQuestionsEntity::class,
        ChapterCqSolutionPartsEntity::class,
        ChapterCqStimuliEntity::class,
        ChapterCqStimulusBoardsEntity::class,
        ChapterCqStimulusImagesEntity::class,
        ChapterCqSubjectsEntity::class,
        OperationJournalEntity::class,
        PaperCategoriesEntity::class,
        PaperImagesEntity::class,
        PaperItemImagesEntity::class,
        PaperItemOverridesEntity::class,
        PaperQuestionItemsEntity::class,
        PaperSectionsEntity::class,
        PapersEntity::class,
        SchemaMigrationsEntity::class,
        TypeCqChaptersEntity::class,
        TypeCqConceptsEntity::class,
        TypeCqConceptPartsEntity::class,
        TypeCqImagesEntity::class,
        TypeCqQuestionBoardsEntity::class,
        TypeCqQuestionCategoriesEntity::class,
        TypeCqQuestionCategoryLinksEntity::class,
        TypeCqQuestionTypesEntity::class,
        TypeCqQuestionsEntity::class,
        TypeCqSolutionPartsEntity::class,
        TypeCqStimuliEntity::class,
        TypeCqStimulusBoardsEntity::class,
        TypeCqStimulusImagesEntity::class,
        TypeCqSubjectsEntity::class,
        TypeCqTopicsEntity::class
    ],
    version = 4,
    exportSchema = true
)
abstract class QuestionBankDatabase : RoomDatabase() {
    abstract fun smokeDao(): RoomSmokeDao
    abstract fun typeCqSubjectDao(): TypeCqSubjectDao
    abstract fun typeCqChapterDao(): TypeCqChapterDao
    abstract fun typeCqTopicDao(): TypeCqTopicDao
    abstract fun typeCqQuestionDao(): TypeCqQuestionDao
    abstract fun typeCqReferenceDao(): com.questionbank.app.data.local.dao.TypeCqReferenceDao
    abstract fun chapterCqDataDao(): com.questionbank.app.data.local.dao.ChapterCqDataDao
    abstract fun sharedDataDao(): com.questionbank.app.data.local.dao.SharedDataDao
    abstract fun categoryDataDao(): com.questionbank.app.data.local.dao.CategoryDataDao
    abstract fun mediaDataDao(): com.questionbank.app.data.local.dao.MediaDataDao

    companion object {
        /**
         * Room owns the 37 ordinary application tables. FTS virtual tables and
         * canonical triggers are installed separately because FTS shadow tables
         * are SQLite-managed objects and must not be Room @Entity declarations.
         */
        private fun createConceptTables(exec: (String) -> Unit) {
            exec("""CREATE TABLE IF NOT EXISTS type_cq_concepts (concept_id TEXT NOT NULL PRIMARY KEY, question_id TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(question_id) REFERENCES type_cq_questions(question_id) ON UPDATE CASCADE ON DELETE CASCADE)""")
            exec("CREATE UNIQUE INDEX IF NOT EXISTS index_type_cq_concepts_question_id ON type_cq_concepts(question_id)")
            exec("""CREATE TABLE IF NOT EXISTS type_cq_concept_parts (part_id TEXT NOT NULL PRIMARY KEY, concept_id TEXT NOT NULL, position INTEGER NOT NULL, part_type TEXT NOT NULL, text_content TEXT, image_id TEXT, created_at INTEGER NOT NULL, FOREIGN KEY(concept_id) REFERENCES type_cq_concepts(concept_id) ON UPDATE CASCADE ON DELETE CASCADE, FOREIGN KEY(image_id) REFERENCES type_cq_images(image_id) ON UPDATE CASCADE ON DELETE RESTRICT)""")
            exec("CREATE UNIQUE INDEX IF NOT EXISTS index_type_cq_concept_parts_concept_id_position ON type_cq_concept_parts(concept_id, position)")
            exec("CREATE INDEX IF NOT EXISTS index_type_cq_concept_parts_image_id ON type_cq_concept_parts(image_id)")
        }

        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) = createConceptTables { statement -> db.execSQL(statement) }
            // A SQLiteDriver is configured below, so Room invokes this overload (not SupportSQLiteDatabase).
            override fun migrate(connection: SQLiteConnection) = createConceptTables { statement -> connection.execSQL(statement) }
        }

        /**
         * One-time conversion of the legacy newest-first list into the agreed oldest-first list.
         * Every stimulus group remains one contiguous card; only sort_order is rewritten.
         * New cards are still appended by minSortOrder() after this migration.
         */
        private val TYPE_CQ_REORDER_SQL = """
            WITH grouped AS (
                SELECT q.topic_id AS topic_id,
                       COALESCE(q.stimulus_id, 'single:' || q.question_id) AS group_key,
                       MIN(COALESCE(s.created_at, q.created_at)) AS group_created_at,
                       MAX(q.sort_order) AS legacy_order
                FROM type_cq_questions q
                LEFT JOIN type_cq_stimuli s ON s.stimulus_id = q.stimulus_id
                GROUP BY q.topic_id, COALESCE(q.stimulus_id, 'single:' || q.question_id)
            ), ranked_groups AS (
                SELECT topic_id, group_key,
                       ROW_NUMBER() OVER (
                           PARTITION BY topic_id
                           ORDER BY group_created_at ASC, legacy_order ASC, group_key ASC
                       ) AS group_rank,
                       COUNT(*) OVER (PARTITION BY topic_id) AS group_count
                FROM grouped
            ), ranked_questions AS (
                SELECT q.question_id, q.topic_id,
                       COALESCE(q.stimulus_id, 'single:' || q.question_id) AS group_key,
                       ROW_NUMBER() OVER (
                           PARTITION BY q.topic_id, COALESCE(q.stimulus_id, 'single:' || q.question_id)
                           ORDER BY CASE q.subquestion_label
                               WHEN 'ক' THEN 1 WHEN 'খ' THEN 2 WHEN 'গ' THEN 3 WHEN 'ঘ' THEN 4 ELSE 5 END,
                               q.sort_order DESC, q.question_id ASC
                       ) AS question_rank
                FROM type_cq_questions q
            )
            UPDATE type_cq_questions
            SET sort_order = (
                SELECT ((g.group_count - g.group_rank + 1) * 10) + (5 - r.question_rank)
                FROM ranked_groups g
                JOIN ranked_questions r
                  ON r.topic_id = g.topic_id AND r.group_key = g.group_key
                WHERE r.question_id = type_cq_questions.question_id
            )
            WHERE question_id IN (SELECT question_id FROM ranked_questions)
        """.trimIndent()

        private val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(connection: SQLiteConnection) = connection.execSQL(TYPE_CQ_REORDER_SQL)
            override fun migrate(db: SupportSQLiteDatabase) = db.execSQL(TYPE_CQ_REORDER_SQL)
        }

        /** Adds a separate nullable card-level category without touching legacy per-question category links. */
        private val MIGRATION_3_4 = object : Migration(3, 4) {
            private fun migrateSql(exec: (String) -> Unit) {
                exec("ALTER TABLE type_cq_questions ADD COLUMN card_category_id TEXT REFERENCES type_cq_question_categories(category_id) ON UPDATE CASCADE ON DELETE RESTRICT")
                exec("ALTER TABLE type_cq_stimuli ADD COLUMN card_category_id TEXT REFERENCES type_cq_question_categories(category_id) ON UPDATE CASCADE ON DELETE RESTRICT")
                exec("CREATE INDEX IF NOT EXISTS index_type_cq_questions_card_category_id ON type_cq_questions(card_category_id)")
                exec("CREATE INDEX IF NOT EXISTS index_type_cq_stimuli_card_category_id ON type_cq_stimuli(card_category_id)")
            }
            override fun migrate(connection: SQLiteConnection) = migrateSql { connection.execSQL(it) }
            override fun migrate(db: SupportSQLiteDatabase) = migrateSql { db.execSQL(it) }
        }

        val CANONICAL_OBJECTS_CALLBACK = object : RoomDatabase.Callback() {
            override fun onCreate(connection: SQLiteConnection) = installCanonicalObjects(connection)
            override fun onOpen(connection: SQLiteConnection) = installCanonicalObjects(connection)
        }

        private fun installCanonicalObjects(connection: SQLiteConnection) {
            CanonicalDatabaseObjects.statements.forEach { statement -> connection.execSQL(statement) }
            SeedData.statements.forEach { statement -> connection.execSQL(statement) }
            SeedData.boardStatements.forEach { statement -> connection.execSQL(statement) }
        }

        fun create(context: Context): QuestionBankDatabase = create(context, "QuestionBank.db")

        /** Open an existing named database with the exact production driver, migrations and callbacks. */
        fun create(context: Context, databaseName: String): QuestionBankDatabase =
            Room.databaseBuilder(context, QuestionBankDatabase::class.java, databaseName)
                .setDriver(BundledSQLiteDriver())
                .setJournalMode(RoomDatabase.JournalMode.WRITE_AHEAD_LOGGING)
                .addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4)
                .addCallback(CANONICAL_OBJECTS_CALLBACK)
                .build()
    }
}
