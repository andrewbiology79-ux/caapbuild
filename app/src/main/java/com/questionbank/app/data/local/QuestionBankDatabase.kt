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
        /**
         * Room owns the 35 ordinary application tables. FTS virtual tables and
         * canonical triggers are installed separately because FTS shadow tables
         * are SQLite-managed objects and must not be Room @Entity declarations.
         */
        val CANONICAL_OBJECTS_CALLBACK = object : RoomDatabase.Callback() {
            override fun onCreate(connection: SQLiteConnection) = installCanonicalObjects(connection)
            override fun onOpen(connection: SQLiteConnection) = installCanonicalObjects(connection)
        }

        private fun installCanonicalObjects(connection: SQLiteConnection) {
            CanonicalDatabaseObjects.statements.forEach { statement -> connection.execSQL(statement) }
        }

        fun create(context: Context): QuestionBankDatabase =
            Room.databaseBuilder(context, QuestionBankDatabase::class.java, "QuestionBank.db")
                .setDriver(BundledSQLiteDriver())
                .addCallback(CANONICAL_OBJECTS_CALLBACK)
                .build()
    }
}
