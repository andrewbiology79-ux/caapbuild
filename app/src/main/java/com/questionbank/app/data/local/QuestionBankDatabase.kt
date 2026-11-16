package com.questionbank.app.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.SQLiteConnection
import androidx.sqlite.execSQL
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import com.questionbank.app.data.local.entity.*

@Database(
    entities = [
        AppMetadataEntity,
        BoardCatalogEntity,
        ChapterCqChaptersEntity,
        ChapterCqImagesEntity,
        ChapterCqQuestionBoardsEntity,
        ChapterCqQuestionCategoriesEntity,
        ChapterCqQuestionCategoryLinksEntity,
        ChapterCqQuestionsEntity,
        ChapterCqSolutionPartsEntity,
        ChapterCqStimuliEntity,
        ChapterCqStimulusBoardsEntity,
        ChapterCqStimulusImagesEntity,
        ChapterCqSubjectsEntity,
        OperationJournalEntity,
        PaperCategoriesEntity,
        PaperImagesEntity,
        PaperItemImagesEntity,
        PaperItemOverridesEntity,
        PaperQuestionItemsEntity,
        PaperSectionsEntity,
        PapersEntity,
        SchemaMigrationsEntity,
        TypeCqChaptersEntity,
        TypeCqImagesEntity,
        TypeCqQuestionBoardsEntity,
        TypeCqQuestionCategoriesEntity,
        TypeCqQuestionCategoryLinksEntity,
        TypeCqQuestionTypesEntity,
        TypeCqQuestionsEntity,
        TypeCqSolutionPartsEntity,
        TypeCqStimuliEntity,
        TypeCqStimulusBoardsEntity,
        TypeCqStimulusImagesEntity,
        TypeCqSubjectsEntity,
        TypeCqTopicsEntity
    ],
    version = 1,
    exportSchema = true
)
abstract class QuestionBankDatabase : RoomDatabase() {
    abstract fun smokeDao(): RoomSmokeDao

    companion object {
        /** FTS5 is deliberately managed outside @Entity because FTS virtual/shadow tables are not normal Room entities. */
        val FTS_CALLBACK = object : RoomDatabase.Callback() {
            override fun onCreate(connection: SQLiteConnection) = createFtsObjects(connection)
            override fun onOpen(connection: SQLiteConnection) = createFtsObjects(connection)
        }

        private fun createFtsObjects(connection: SQLiteConnection) {
            connection.execSQL("CREATE VIRTUAL TABLE IF NOT EXISTS type_cq_question_fts USING fts5(question_id UNINDEXED, question_text, short_answer)")
            connection.execSQL("CREATE VIRTUAL TABLE IF NOT EXISTS chapter_cq_question_fts USING fts5(question_id UNINDEXED, question_text, short_answer)")
            connection.execSQL("CREATE TRIGGER IF NOT EXISTS trg_type_question_fts_insert AFTER INSERT ON type_cq_questions BEGIN INSERT INTO type_cq_question_fts(question_id, question_text, short_answer) VALUES (NEW.question_id, NEW.question_text, NEW.short_answer); END")
            connection.execSQL("CREATE TRIGGER IF NOT EXISTS trg_type_question_fts_update AFTER UPDATE OF question_text, short_answer ON type_cq_questions BEGIN DELETE FROM type_cq_question_fts WHERE question_id=OLD.question_id; INSERT INTO type_cq_question_fts(question_id, question_text, short_answer) VALUES (NEW.question_id, NEW.question_text, NEW.short_answer); END")
            connection.execSQL("CREATE TRIGGER IF NOT EXISTS trg_type_question_fts_delete AFTER DELETE ON type_cq_questions BEGIN DELETE FROM type_cq_question_fts WHERE question_id=OLD.question_id; END")
            connection.execSQL("CREATE TRIGGER IF NOT EXISTS trg_chapter_question_fts_insert AFTER INSERT ON chapter_cq_questions BEGIN INSERT INTO chapter_cq_question_fts(question_id, question_text, short_answer) VALUES (NEW.question_id, NEW.question_text, NEW.short_answer); END")
            connection.execSQL("CREATE TRIGGER IF NOT EXISTS trg_chapter_question_fts_update AFTER UPDATE OF question_text, short_answer ON chapter_cq_questions BEGIN DELETE FROM chapter_cq_question_fts WHERE question_id=OLD.question_id; INSERT INTO chapter_cq_question_fts(question_id, question_text, short_answer) VALUES (NEW.question_id, NEW.question_text, NEW.short_answer); END")
            connection.execSQL("CREATE TRIGGER IF NOT EXISTS trg_chapter_question_fts_delete AFTER DELETE ON chapter_cq_questions BEGIN DELETE FROM chapter_cq_question_fts WHERE question_id=OLD.question_id; END")
        }

        fun create(context: Context): QuestionBankDatabase =
            Room.databaseBuilder(context, QuestionBankDatabase::class.java, "QuestionBank.db")
                .setDriver(BundledSQLiteDriver())
                .addCallback(FTS_CALLBACK)
                .build()
    }
}
