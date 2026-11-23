package com.questionbank.app.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction

import com.questionbank.app.data.local.entity.TypeCqQuestionCategoriesEntity
import com.questionbank.app.data.local.entity.ChapterCqQuestionCategoriesEntity

/** Category operations keep Type_CQ and Chapter_CQ links isolated even though the workflows are parallel. */
@Dao
abstract class CategoryDataDao {
    @Insert(onConflict = OnConflictStrategy.ABORT)
    abstract suspend fun insertTypeCategory(row: TypeCqQuestionCategoriesEntity)
    @Insert(onConflict = OnConflictStrategy.ABORT)
    abstract suspend fun insertChapterCategory(row: ChapterCqQuestionCategoriesEntity)
    @Query("UPDATE type_cq_question_categories SET name = :name, updated_at = :now WHERE category_id = :id AND is_archived = 0")
    abstract suspend fun renameTypeCategory(id: String, name: String, now: Long): Int
    @Query("UPDATE chapter_cq_question_categories SET name = :name, updated_at = :now WHERE category_id = :id AND is_archived = 0")
    abstract suspend fun renameChapterCategory(id: String, name: String, now: Long): Int
    @Query("UPDATE type_cq_question_categories SET is_archived = :archived, updated_at = :now WHERE category_id = :id")
    abstract suspend fun setTypeCategoryArchived(id: String, archived: Long, now: Long): Int
    @Query("UPDATE chapter_cq_question_categories SET is_archived = :archived, updated_at = :now WHERE category_id = :id")
    abstract suspend fun setChapterCategoryArchived(id: String, archived: Long, now: Long): Int
    @Query("SELECT (SELECT COUNT(*) FROM type_cq_question_category_links WHERE category_id = :id) + (SELECT COUNT(*) FROM type_cq_stimulus_category_links WHERE category_id = :id)")
    abstract suspend fun typeCategoryLinkCount(id: String): Int
    @Query("SELECT COUNT(*) FROM chapter_cq_question_category_links WHERE category_id = :id")
    abstract suspend fun chapterCategoryLinkCount(id: String): Int
    @Transaction
    open suspend fun archiveTypeIfUnused(id: String, now: Long): Boolean {
        if (typeCategoryLinkCount(id) != 0) return false
        return setTypeCategoryArchived(id, 1, now) > 0
    }
    @Transaction
    open suspend fun archiveChapterIfUnused(id: String, now: Long): Boolean {
        if (chapterCategoryLinkCount(id) != 0) return false
        return setChapterCategoryArchived(id, 1, now) > 0
    }
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

    @Query("INSERT OR IGNORE INTO type_cq_stimulus_category_links(stimulus_id, category_id, assigned_at) SELECT stimulus_id, :targetId, assigned_at FROM type_cq_stimulus_category_links WHERE category_id = :sourceId")
    abstract suspend fun copyTypeStimulusLinks(sourceId: String, targetId: String)

    @Query("DELETE FROM type_cq_stimulus_category_links WHERE category_id = :sourceId")
    abstract suspend fun deleteTypeStimulusLinks(sourceId: String)

    @Query("INSERT OR IGNORE INTO chapter_cq_question_category_links(question_id, category_id, assigned_at) SELECT question_id, :targetId, assigned_at FROM chapter_cq_question_category_links WHERE category_id = :sourceId")
    abstract suspend fun copyChapterLinks(sourceId: String, targetId: String)

    @Query("DELETE FROM chapter_cq_question_category_links WHERE category_id = :sourceId")
    abstract suspend fun deleteChapterLinks(sourceId: String)

    @Transaction
    open suspend fun reassignAndArchiveType(sourceId: String, targetId: String, now: Long): Boolean {
        if (sourceId == targetId || activeTypeCategory(sourceId) == 0 || activeTypeCategory(targetId) == 0) return false
        copyTypeLinks(sourceId, targetId)
        copyTypeStimulusLinks(sourceId, targetId)
        deleteTypeLinks(sourceId)
        deleteTypeStimulusLinks(sourceId)
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
