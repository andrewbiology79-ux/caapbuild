package com.questionbank.app.data.repository

import com.questionbank.app.data.local.dao.CategoryDataDao
import com.questionbank.app.domain.repository.CategoryRepository

class CategoryRepositoryImpl(
    private val dao: CategoryDataDao,
    private val beforeWrite: suspend () -> Unit = {},
) : CategoryRepository {
    override suspend fun reassignAndArchiveTypeCategory(sourceId: String, targetId: String, now: Long): Boolean {
        beforeWrite()
        return dao.reassignAndArchiveType(sourceId, targetId, now)
    }
    override suspend fun reassignAndArchiveChapterCategory(sourceId: String, targetId: String, now: Long): Boolean {
        beforeWrite()
        return dao.reassignAndArchiveChapter(sourceId, targetId, now)
    }
}
