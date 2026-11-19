package com.questionbank.app.data.local.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction

/** Category operations keep Type_CQ and Chapter_CQ links isolated even though the workflows are parallel. */
@Dao
abstract class CategoryDataDao {
    @Query("SELECT COUNT(*) FROM type_cq_question_categories WHERE category_id = :id AND is_archived = 0")
    abstract suspend fun activeTypeCategory(id: String): Int

    @Query("SELECT COUNT(*) FROM chapter_cq_question_categories WHERE category_id = :id AND is_archived = 0")
    abstract suspend fun activeChapterCategory(id: String): Int

    @Query("UPDATE type_cq_question_categories SET is_archived = 1, updated_at = :now WHERE category_id = :id")
    abstract suspend fun archiveTypeCategory(id: String, now: Long): Int

    @Query("UPDATE chapter_cq_question_categories SET is_archived = 1, updated_at = :now WHERE category_id = :id")
    abstract suspend fun archiveChapterCategory(id: String, now: Long): Int

    @Query("INSERT OR IGNORE INTO type_cq_question_category_links(question_id, category_id, assigned_at) SELECT question_id, :targetId, assigned_at FROM type_cq_question_category_links WHERE category_id = :sourceId")
    abstract suspend fun copyTypeLinks(sourceId: String, targetId: String)

    @Query("DELETE FROM type_cq_question_category_links WHERE category_id = :sourceId")
    abstract suspend fun deleteTypeLinks(sourceId: String)

    @Query("INSERT OR IGNORE INTO chapter_cq_question_category_links(question_id, category_id, assigned_at) SELECT question_id, :targetId, assigned_at FROM chapter_cq_question_category_links WHERE category_id = :sourceId")
    abstract suspend fun copyChapterLinks(sourceId: String, targetId: String)

    @Query("DELETE FROM chapter_cq_question_category_links WHERE category_id = :sourceId")
    abstract suspend fun deleteChapterLinks(sourceId: String)

    @Transaction
    open suspend fun reassignAndArchiveType(sourceId: String, targetId: String, now: Long): Boolean {
        if (sourceId == targetId || activeTypeCategory(sourceId) == 0 || activeTypeCategory(targetId) == 0) return false
        copyTypeLinks(sourceId, targetId)
        deleteTypeLinks(sourceId)
        archiveTypeCategory(sourceId, now)
        return true
    }

    @Transaction
    open suspend fun reassignAndArchiveChapter(sourceId: String, targetId: String, now: Long): Boolean {
        if (sourceId == targetId || activeChapterCategory(sourceId) == 0 || activeChapterCategory(targetId) == 0) return false
        copyChapterLinks(sourceId, targetId)
        deleteChapterLinks(sourceId)
        archiveChapterCategory(sourceId, now)
        return true
    }
}
