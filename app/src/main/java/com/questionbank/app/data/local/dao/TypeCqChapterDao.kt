package com.questionbank.app.data.local.dao

import androidx.room.Dao
import androidx.room.Query
import com.questionbank.app.data.local.entity.TypeCqChaptersEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface TypeCqChapterDao {
    @Query("SELECT * FROM type_cq_chapters WHERE subject_id = :subjectId ORDER BY sort_order, name, chapter_id")
    fun observeBySubject(subjectId: String): Flow<List<TypeCqChaptersEntity>>

    @Query("SELECT * FROM type_cq_chapters WHERE chapter_id = :chapterId")
    fun observeById(chapterId: String): Flow<TypeCqChaptersEntity?>

    @Query("SELECT COUNT(*) FROM type_cq_chapters WHERE chapter_id = :chapterId")
    suspend fun countById(chapterId: String): Int

    @Query("SELECT COUNT(*) FROM type_cq_chapters WHERE subject_id = :subjectId AND name = :name")
    suspend fun countByName(subjectId: String, name: String): Int

    @Query(
        "INSERT INTO type_cq_chapters(chapter_id, subject_id, name, sort_order, created_at, updated_at) " +
            "SELECT :chapterId, :subjectId, :name, COALESCE(MAX(sort_order), 0) + 1, :now, :now " +
            "FROM type_cq_chapters WHERE subject_id = :subjectId"
    )
    suspend fun insertNext(chapterId: String, subjectId: String, name: String, now: Long)
}
