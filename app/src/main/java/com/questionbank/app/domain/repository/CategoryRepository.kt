package com.questionbank.app.domain.repository

interface CategoryRepository {
    suspend fun reassignAndArchiveTypeCategory(sourceId: String, targetId: String, now: Long): Boolean
    suspend fun reassignAndArchiveChapterCategory(sourceId: String, targetId: String, now: Long): Boolean
    suspend fun addTypeCategory(name: String): Boolean
    suspend fun renameTypeCategory(id: String, name: String, now: Long): Boolean
    suspend fun setTypeCategoryArchived(id: String, archived: Boolean, now: Long): Boolean
    suspend fun addChapterCategory(name: String): Boolean
    suspend fun renameChapterCategory(id: String, name: String, now: Long): Boolean
    suspend fun setChapterCategoryArchived(id: String, archived: Boolean, now: Long): Boolean
}
