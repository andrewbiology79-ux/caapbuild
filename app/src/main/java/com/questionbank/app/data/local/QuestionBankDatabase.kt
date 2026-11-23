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
import com.questionbank.app.data.local.dao.TypeCqConceptDao
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
import com.questionbank.app.data.local.entity.TypeCqImagesEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionBoardsEntity
import com.questionbank.app.data.local.entity.TypeCqConceptEntity
import com.questionbank.app.data.local.entity.TypeCqConceptPartsEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionCategoriesEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionCategoryLinksEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionTypesEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionsEntity
import com.questionbank.app.data.local.entity.TypeCqSolutionPartsEntity
import com.questionbank.app.data.local.entity.TypeCqStimuliEntity
import com.questionbank.app.data.local.entity.TypeCqStimulusBoardsEntity
import com.questionbank.app.data.local.entity.TypeCqStimulusCategoryLinksEntity
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
        TypeCqConceptEntity::class,
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
        TypeCqStimulusCategoryLinksEntity::class,
        TypeCqStimulusImagesEntity::class,
        TypeCqSubjectsEntity::class,
        TypeCqTopicsEntity::class
    ],
    version = 2,
    exportSchema = true
)
abstract class QuestionBankDatabase : RoomDatabase() {
    abstract fun smokeDao(): RoomSmokeDao
    abstract fun typeCqSubjectDao(): TypeCqSubjectDao
    abstract fun typeCqChapterDao(): TypeCqChapterDao
    abstract fun typeCqTopicDao(): TypeCqTopicDao
    abstract fun typeCqQuestionDao(): TypeCqQuestionDao
    abstract fun typeCqConceptDao(): TypeCqConceptDao
    abstract fun typeCqReferenceDao(): com.questionbank.app.data.local.dao.TypeCqReferenceDao
    abstract fun chapterCqDataDao(): com.questionbank.app.data.local.dao.ChapterCqDataDao
    abstract fun sharedDataDao(): com.questionbank.app.data.local.dao.SharedDataDao
    abstract fun categoryDataDao(): com.questionbank.app.data.local.dao.CategoryDataDao
    abstract fun mediaDataDao(): com.questionbank.app.data.local.dao.MediaDataDao

    companion object {
        /**
         * Room owns the 38 ordinary application tables. FTS virtual tables and
         * canonical triggers are installed separately because FTS shadow tables
         * are SQLite-managed objects and must not be Room @Entity declarations.
         */
        val CANONICAL_OBJECTS_CALLBACK = object : RoomDatabase.Callback() {
            override fun onCreate(connection: SQLiteConnection) = installCanonicalObjects(connection)
            override fun onOpen(connection: SQLiteConnection) = installCanonicalObjects(connection)
        }

        private fun installCanonicalObjects(connection: SQLiteConnection) {
            CanonicalDatabaseObjects.statements.forEach { statement -> connection.execSQL(statement) }
            SeedData.statements.forEach { statement -> connection.execSQL(statement) }
            SeedData.boardStatements.forEach { statement -> connection.execSQL(statement) }
        }

        /** Adds card-level concepts without deleting the user's existing QuestionBank.db. */
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("""CREATE TABLE IF NOT EXISTS type_cq_stimulus_category_links (
                    stimulus_id TEXT NOT NULL, category_id TEXT NOT NULL, assigned_at INTEGER NOT NULL,
                    PRIMARY KEY(stimulus_id, category_id),
                    FOREIGN KEY(stimulus_id) REFERENCES type_cq_stimuli(stimulus_id) ON UPDATE CASCADE ON DELETE CASCADE,
                    FOREIGN KEY(category_id) REFERENCES type_cq_question_categories(category_id) ON UPDATE CASCADE ON DELETE RESTRICT
                )""")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_type_cq_stimulus_category_links_category_id_stimulus_id ON type_cq_stimulus_category_links(category_id, stimulus_id)")
                db.execSQL("""CREATE TABLE IF NOT EXISTS type_cq_concepts (
                    concept_id TEXT NOT NULL, topic_id TEXT NOT NULL, stimulus_id TEXT, question_id TEXT,
                    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(concept_id),
                    FOREIGN KEY(topic_id) REFERENCES type_cq_topics(topic_id) ON UPDATE CASCADE ON DELETE CASCADE,
                    FOREIGN KEY(stimulus_id) REFERENCES type_cq_stimuli(stimulus_id) ON UPDATE CASCADE ON DELETE CASCADE,
                    FOREIGN KEY(question_id) REFERENCES type_cq_questions(question_id) ON UPDATE CASCADE ON DELETE CASCADE
                )""")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_type_cq_concepts_topic_id ON type_cq_concepts(topic_id)")
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS index_type_cq_concepts_stimulus_id ON type_cq_concepts(stimulus_id)")
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS index_type_cq_concepts_question_id ON type_cq_concepts(question_id)")
                db.execSQL("""CREATE TABLE IF NOT EXISTS type_cq_concept_parts (
                    part_id TEXT NOT NULL, concept_id TEXT NOT NULL, position INTEGER NOT NULL, part_type TEXT NOT NULL,
                    text_content TEXT, image_id TEXT, created_at INTEGER NOT NULL, PRIMARY KEY(part_id),
                    FOREIGN KEY(concept_id) REFERENCES type_cq_concepts(concept_id) ON UPDATE CASCADE ON DELETE CASCADE,
                    FOREIGN KEY(image_id) REFERENCES type_cq_images(image_id) ON UPDATE CASCADE ON DELETE RESTRICT
                )""")
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS index_type_cq_concept_parts_concept_id_position ON type_cq_concept_parts(concept_id, position)")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_type_cq_concept_parts_image_id ON type_cq_concept_parts(image_id)")
            }
        }

        fun create(context: Context): QuestionBankDatabase =
            Room.databaseBuilder(context, QuestionBankDatabase::class.java, "QuestionBank.db")
                .setDriver(BundledSQLiteDriver())
                .setJournalMode(RoomDatabase.JournalMode.WRITE_AHEAD_LOGGING)
                .addMigrations(MIGRATION_1_2)
                .addCallback(CANONICAL_OBJECTS_CALLBACK)
                .build()
    }
}
