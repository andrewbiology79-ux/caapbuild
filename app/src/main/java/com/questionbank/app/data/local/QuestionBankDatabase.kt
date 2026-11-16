package com.questionbank.app.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.SQLiteConnection
import androidx.sqlite.execSQL
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
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
