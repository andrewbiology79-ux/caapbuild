package com.questionbank.app.data.local.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction
import com.questionbank.app.data.local.entity.TypeCqTopicsEntity
import kotlinx.coroutines.flow.Flow

@Dao
abstract class TypeCqTopicDao {
    @Query("SELECT * FROM type_cq_topics WHERE chapter_id = :chapterId ORDER BY sort_order, name, topic_id")
    abstract fun observeByChapter(chapterId: String): Flow<List<TypeCqTopicsEntity>>

    @Query(
        "SELECT t.topic_id AS id, t.name AS name, 0 AS child_count, " +
            "(SELECT COUNT(*) FROM type_cq_questions q WHERE q.topic_id = t.topic_id) AS question_count " +
            "FROM type_cq_topics t WHERE t.chapter_id = :chapterId ORDER BY t.sort_order, t.name, t.topic_id"
    )
    abstract fun observeRows(chapterId: String): Flow<List<HierarchyRowDb>>

    @Query("SELECT COUNT(*) FROM type_cq_topics WHERE topic_id = :topicId")
    abstract suspend fun countById(topicId: String): Int

    @Query("SELECT COUNT(*) FROM type_cq_topics WHERE chapter_id = :chapterId AND name = :name")
    abstract suspend fun countByName(chapterId: String, name: String): Int

    @Query("SELECT COUNT(*) FROM type_cq_topics WHERE chapter_id = :chapterId AND name = :name AND topic_id <> :topicId")
    abstract suspend fun countByNameExcept(chapterId: String, name: String, topicId: String): Int

    @Query("SELECT chapter_id FROM type_cq_topics WHERE topic_id = :topicId")
    abstract suspend fun chapterIdOf(topicId: String): String?

    @Query(
        "INSERT INTO type_cq_topics(topic_id, chapter_id, name, sort_order, created_at, updated_at) " +
            "SELECT :topicId, :chapterId, :name, COALESCE(MAX(sort_order), 0) + 1, :now, :now " +
            "FROM type_cq_topics WHERE chapter_id = :chapterId"
    )
    abstract suspend fun insertNext(topicId: String, chapterId: String, name: String, now: Long)

    @Query("UPDATE type_cq_topics SET name = :name, updated_at = :now WHERE topic_id = :topicId")
    abstract suspend fun rename(topicId: String, name: String, now: Long): Int

    @Query("SELECT COUNT(*) FROM type_cq_questions WHERE topic_id = :topicId")
    abstract suspend fun countQuestions(topicId: String): Int

    @Query("DELETE FROM type_cq_topics WHERE topic_id = :topicId")
    abstract suspend fun deleteById(topicId: String): Int

    /** An unsaved draft of a topic that is being deleted would otherwise stay in app_metadata for ever. */
    @Query("DELETE FROM app_metadata WHERE \"key\" = :key")
    abstract suspend fun deleteMeta(key: String)

    @Query("SELECT topic_id FROM type_cq_topics WHERE chapter_id = :chapterId")
    abstract suspend fun idsOfChapter(chapterId: String): List<String>

    @Query(
        "UPDATE type_cq_topics SET sort_order = :position, updated_at = :now " +
            "WHERE topic_id = :topicId AND chapter_id = :chapterId"
    )
    abstract suspend fun setOrder(chapterId: String, topicId: String, position: Long, now: Long)

    /** Deletes only a topic without questions (its unsaved draft goes with it). Check and delete are one transaction. */
    @Transaction
    open suspend fun deleteIfEmpty(topicId: String, draftKey: String): DeleteOutcome {
        if (countById(topicId) == 0) return DeleteOutcome.NotFound
        val questions = countQuestions(topicId)
        if (questions > 0) return DeleteOutcome.NotEmpty(0, questions)
        deleteById(topicId)
        deleteMeta(draftKey)
        return DeleteOutcome.Deleted
    }

    @Transaction
    open suspend fun reorder(chapterId: String, ids: List<String>, now: Long): Boolean {
        val current = idsOfChapter(chapterId)
        if (ids.size != current.size || ids.toSet() != current.toSet()) return false
        ids.forEachIndexed { index, id -> setOrder(chapterId, id, (index + 1).toLong(), now) }
        return true
    }
}
