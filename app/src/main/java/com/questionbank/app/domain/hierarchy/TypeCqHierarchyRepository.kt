package com.questionbank.app.domain.hierarchy

import kotlinx.coroutines.flow.Flow

/**
 * Type_CQ subject -> chapter -> topic hierarchy. The UI talks to this interface only (never to a DAO).
 * Chapter_CQ has its own repository; nothing here touches chapter_cq_* tables.
 * Names are cleaned with [HierarchyName.clean]. Subject names are unique (database index); chapter names are unique
 * inside one subject and topic names inside one chapter (checked here).
 */
interface TypeCqHierarchyRepository {
    fun observeSubjects(): Flow<List<HierarchyItem>>
    fun observeSubject(subjectId: String): Flow<HierarchyItem?>
    fun observeChapters(subjectId: String): Flow<List<HierarchyItem>>
    fun observeChapter(chapterId: String): Flow<HierarchyItem?>
    fun observeTopics(chapterId: String): Flow<List<HierarchyItem>>

    suspend fun addSubject(rawName: String): AddResult
    suspend fun addChapter(subjectId: String, rawName: String): AddResult
    suspend fun addTopic(chapterId: String, rawName: String): AddResult
}
