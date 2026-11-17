package com.questionbank.app

import android.content.Context
import com.questionbank.app.data.local.QuestionBankDatabase
import com.questionbank.app.data.local.forceFullSync
import com.questionbank.app.data.repository.TypeCqHierarchyRepositoryImpl
import com.questionbank.app.data.repository.TypeCqQuestionRepositoryImpl
import com.questionbank.app.domain.hierarchy.TypeCqHierarchyRepository
import com.questionbank.app.domain.question.TypeCqQuestionRepository
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
    val appScope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    val database: QuestionBankDatabase by lazy { QuestionBankDatabase.create(appContext) }

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
        )
    }
}
