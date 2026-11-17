package com.questionbank.app.data.local.dao

import androidx.room.Dao
import androidx.room.Query
import com.questionbank.app.data.local.entity.TypeCqTopicsEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface TypeCqTopicDao {
    @Query("SELECT * FROM type_cq_topics WHERE chapter_id = :chapterId ORDER BY sort_order, name, topic_id")
    fun observeByChapter(chapterId: String): Flow<List<TypeCqTopicsEntity>>

    @Query("SELECT COUNT(*) FROM type_cq_topics WHERE chapter_id = :chapterId AND name = :name")
    suspend fun countByName(chapterId: String, name: String): Int

    @Query(
        "INSERT INTO type_cq_topics(topic_id, chapter_id, name, sort_order, created_at, updated_at) " +
            "SELECT :topicId, :chapterId, :name, COALESCE(MAX(sort_order), 0) + 1, :now, :now " +
            "FROM type_cq_topics WHERE chapter_id = :chapterId"
    )
    suspend fun insertNext(topicId: String, chapterId: String, name: String, now: Long)
}
