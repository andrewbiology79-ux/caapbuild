package com.questionbank.app

import android.content.Context
import com.questionbank.app.data.local.QuestionBankDatabase
import com.questionbank.app.data.repository.TypeCqHierarchyRepositoryImpl
import com.questionbank.app.domain.hierarchy.TypeCqHierarchyRepository

/**
 * Manual dependency container (ADR-002: no DI framework for now).
 *
 * Holds the single physical database. Repositories and use cases (Phase 4) are added here as
 * constructor-injected properties; the UI receives them, and never touches DAOs directly.
 * The database is opened lazily, on first use, not at process start.
 */
class AppContainer(private val appContext: Context) {
    val database: QuestionBankDatabase by lazy { QuestionBankDatabase.create(appContext) }

    val typeCqHierarchy: TypeCqHierarchyRepository by lazy {
        TypeCqHierarchyRepositoryImpl(
            subjects = database.typeCqSubjectDao(),
            chapters = database.typeCqChapterDao(),
            topics = database.typeCqTopicDao(),
        )
    }
}
