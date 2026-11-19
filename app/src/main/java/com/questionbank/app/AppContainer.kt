package com.questionbank.app

import android.content.Context
import com.questionbank.app.data.backup.BackupPrefs
import com.questionbank.app.data.backup.BackupService
import com.questionbank.app.data.local.QuestionBankDatabase
import com.questionbank.app.data.local.forceFullSync
import com.questionbank.app.data.local.typeCqFtsMatch
import com.questionbank.app.data.repository.TypeCqHierarchyRepositoryImpl
import com.questionbank.app.data.settings.AppSettings
import com.questionbank.app.data.repository.TypeCqQuestionRepositoryImpl
import com.questionbank.app.data.repository.ChapterCqRepositoryImpl
import com.questionbank.app.data.repository.PaperRepositoryImpl
import com.questionbank.app.data.repository.CategoryRepositoryImpl
import com.questionbank.app.data.repository.MediaRepositoryImpl
import com.questionbank.app.data.repository.TypeCqRepositoryImpl
import com.questionbank.app.data.repository.EditorDraftRepositoryImpl
import com.questionbank.app.domain.repository.ChapterCqRepository
import com.questionbank.app.domain.repository.PaperRepository
import com.questionbank.app.domain.repository.CategoryRepository
import com.questionbank.app.domain.repository.MediaRepository
import com.questionbank.app.domain.repository.TypeCqRepository
import com.questionbank.app.domain.repository.EditorDraftRepository
import com.questionbank.app.domain.hierarchy.TypeCqHierarchyRepository
import com.questionbank.app.domain.question.TypeCqQuestionRepository
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/**
 * Manual dependency container (ADR-002: no DI framework for now).
 *
 * Holds the single physical database. Repositories and use cases (Phase 4) are added here as
 * constructor-injected properties; the UI receives them, and never touches DAOs directly.
 * The database is opened lazily, on first use, not at process start.
 */
class AppContainer(private val appContext: Context) {
    /** Lives as long as the process. Used for draft writes that must not be cancelled when a screen is left. */
    val appScope: CoroutineScope = CoroutineScope(
        SupervisorJob() + Dispatchers.Default + CoroutineExceptionHandler { _, error ->
            // After a restore has been staged the database is closed on purpose; a late draft write must not crash the app.
            if (!databaseClosedForRestore) throw error
        }
    )

    @Volatile
    private var databaseClosedForRestore = false

    private val databaseHolder = lazy { QuestionBankDatabase.create(appContext) }
    val database: QuestionBankDatabase get() = databaseHolder.value

    /** Closes the database for good (until the process restarts). Used only after a restore has been staged. */
    fun closeDatabaseForRestore() {
        databaseClosedForRestore = true
        if (databaseHolder.isInitialized()) databaseHolder.value.close()
    }

    val backupPrefs: BackupPrefs by lazy { BackupPrefs(appContext) }

    /** Theme and text size (preferences, not the database: they are needed at the first frame). */
    val appSettings: AppSettings by lazy { AppSettings(appContext) }

    val backup: BackupService by lazy {
        BackupService(
            context = appContext,
            database = { database },
            closeDatabase = { closeDatabaseForRestore() },
            prefs = backupPrefs,
        )
    }

    val typeCqHierarchy: TypeCqHierarchyRepository by lazy {
        TypeCqHierarchyRepositoryImpl(
            subjects = database.typeCqSubjectDao(),
            chapters = database.typeCqChapterDao(),
            topics = database.typeCqTopicDao(),
        )
    }

    /**
     * Before every question save the writer connection is set to `synchronous=FULL`: each commit is flushed to storage
     * before "saved" is shown, so a power cut or crash right after saving cannot lose the question.
     */
    val typeCqQuestions: TypeCqQuestionRepository by lazy {
        TypeCqQuestionRepositoryImpl(
            dao = database.typeCqQuestionDao(),
            beforeWrite = { database.forceFullSync() },
            ftsMatch = { topicId, match -> database.typeCqFtsMatch(topicId, match) },
        )
    }

    /** Separate repositories preserve the Type_CQ / Chapter_CQ write boundary. */
    val typeCqData: TypeCqRepository by lazy { TypeCqRepositoryImpl(database.typeCqReferenceDao(), database.categoryDataDao(), database.sharedDataDao()) { database.forceFullSync() } }
    val chapterCq: ChapterCqRepository by lazy { ChapterCqRepositoryImpl(database.chapterCqDataDao()) { database.forceFullSync() } }
    val papers: PaperRepository by lazy { PaperRepositoryImpl(database.sharedDataDao()) { database.forceFullSync() } }
    val editorDrafts: EditorDraftRepository by lazy { EditorDraftRepositoryImpl(database.sharedDataDao()) { database.forceFullSync() } }
    val categories: CategoryRepository by lazy { CategoryRepositoryImpl(database.categoryDataDao()) { database.forceFullSync() } }
    val media: MediaRepository by lazy { MediaRepositoryImpl(database.mediaDataDao()) { database.forceFullSync() } }
}
