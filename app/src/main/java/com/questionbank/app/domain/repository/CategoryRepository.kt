package com.questionbank.app.domain.repository

interface CategoryRepository {
    suspend fun reassignAndArchiveTypeCategory(sourceId: String, targetId: String, now: Long): Boolean
    suspend fun reassignAndArchiveChapterCategory(sourceId: String, targetId: String, now: Long): Boolean
}
