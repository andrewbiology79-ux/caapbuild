package com.questionbank.app.domain.hierarchy

import kotlinx.coroutines.flow.Flow

/**
 * Type_CQ subject -> chapter -> topic hierarchy. The UI talks to this interface only (never to a DAO).
 * Chapter_CQ has its own repository; nothing here touches chapter_cq_* tables.
 * Names are cleaned with [HierarchyName.clean]. Subject names are unique (database index); chapter names are unique
 * inside one subject and topic names inside one chapter (checked here).
 *
 * Delete (ADR-010): only an EMPTY item can be deleted (no chapters/topics and no questions below it). A non-empty item
 * returns [EditResult.NotEmpty] and nothing changes. Deleting questions arrives in v0.2.29 (delete-safety design).
 * Reorder: the caller sends the complete list of ids in the new order; if the list no longer matches the database
 * (an item was added or deleted meanwhile) nothing is written.
 */
interface TypeCqHierarchyRepository {
    fun observeSubjects(): Flow<List<HierarchyItem>>
    fun observeSubject(subjectId: String): Flow<HierarchyItem?>
    fun observeChapters(subjectId: String): Flow<List<HierarchyItem>>
    fun observeChapter(chapterId: String): Flow<HierarchyItem?>
    fun observeTopics(chapterId: String): Flow<List<HierarchyItem>>

    /** The same lists with counts, for the list screens. */
    fun observeSubjectRows(): Flow<List<HierarchyRow>>
    fun observeChapterRows(subjectId: String): Flow<List<HierarchyRow>>
    fun observeTopicRows(chapterId: String): Flow<List<HierarchyRow>>
    /** Null when the chapter does not exist (any more). */
    fun observeChapterPath(chapterId: String): Flow<ChapterPath?>
    /** Null when the topic or one of its ancestors does not exist (any more). */
    fun observeTopicPath(topicId: String): Flow<TopicPath?>

    suspend fun addSubject(rawName: String): AddResult
    suspend fun addChapter(subjectId: String, rawName: String): AddResult
    suspend fun addTopic(chapterId: String, rawName: String): AddResult

    suspend fun renameSubject(subjectId: String, rawName: String): EditResult
    suspend fun renameChapter(chapterId: String, rawName: String): EditResult
    suspend fun renameTopic(topicId: String, rawName: String): EditResult

    suspend fun deleteSubject(subjectId: String): EditResult
    suspend fun deleteChapter(chapterId: String): EditResult
    suspend fun deleteTopic(topicId: String): EditResult

    suspend fun reorderSubjects(orderedIds: List<String>): EditResult
    suspend fun reorderChapters(subjectId: String, orderedIds: List<String>): EditResult
    suspend fun reorderTopics(chapterId: String, orderedIds: List<String>): EditResult
}
