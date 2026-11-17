package com.questionbank.app.data.local.dao

import androidx.room.Dao
import androidx.room.Query
import com.questionbank.app.data.local.entity.TypeCqSubjectsEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface TypeCqSubjectDao {
    @Query("SELECT * FROM type_cq_subjects ORDER BY sort_order, name, subject_id")
    fun observeAll(): Flow<List<TypeCqSubjectsEntity>>

    @Query("SELECT * FROM type_cq_subjects WHERE subject_id = :subjectId")
    fun observeById(subjectId: String): Flow<TypeCqSubjectsEntity?>

    @Query("SELECT COUNT(*) FROM type_cq_subjects WHERE subject_id = :subjectId")
    suspend fun countById(subjectId: String): Int

    @Query("SELECT COUNT(*) FROM type_cq_subjects WHERE name = :name")
    suspend fun countByName(name: String): Int

    /** One statement, so the next sort_order is computed and written atomically. */
    @Query(
        "INSERT INTO type_cq_subjects(subject_id, name, sort_order, created_at, updated_at) " +
            "SELECT :subjectId, :name, COALESCE(MAX(sort_order), 0) + 1, :now, :now FROM type_cq_subjects"
    )
    suspend fun insertNext(subjectId: String, name: String, now: Long)
}
