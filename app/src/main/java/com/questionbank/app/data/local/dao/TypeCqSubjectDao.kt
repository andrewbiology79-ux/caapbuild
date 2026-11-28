package com.questionbank.app.data.local.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction
import com.questionbank.app.data.local.entity.TypeCqSubjectsEntity
import kotlinx.coroutines.flow.Flow

/** Abstract class (not an interface) because [deleteIfEmpty] and [reorder] are @Transaction methods with a body. */
@Dao
abstract class TypeCqSubjectDao {
    @Query("SELECT * FROM type_cq_subjects ORDER BY sort_order, name, subject_id")
    abstract fun observeAll(): Flow<List<TypeCqSubjectsEntity>>

    @Query("SELECT * FROM type_cq_subjects WHERE subject_id = :subjectId")
    abstract fun observeById(subjectId: String): Flow<TypeCqSubjectsEntity?>

    @Query(
        "SELECT s.subject_id AS id, s.name AS name, " +
            "(SELECT COUNT(*) FROM type_cq_chapters c WHERE c.subject_id = s.subject_id) AS child_count, " +
            "(SELECT COUNT(*) FROM type_cq_questions q " +
            "JOIN type_cq_topics t ON t.topic_id = q.topic_id " +
            "JOIN type_cq_chapters c ON c.chapter_id = t.chapter_id " +
            "WHERE c.subject_id = s.subject_id) AS question_count " +
            "FROM type_cq_subjects s ORDER BY s.sort_order, s.name, s.subject_id"
    )
    abstract fun observeRows(): Flow<List<HierarchyRowDb>>

    @Query("SELECT COUNT(*) FROM type_cq_subjects WHERE subject_id = :subjectId")
    abstract suspend fun countById(subjectId: String): Int

    @Query("SELECT COUNT(*) FROM type_cq_subjects WHERE name = :name")
    abstract suspend fun countByName(name: String): Int

    @Query("SELECT COUNT(*) FROM type_cq_subjects WHERE name = :name AND subject_id <> :subjectId")
    abstract suspend fun countByNameExcept(name: String, subjectId: String): Int

    /** One statement, so the next sort_order is computed and written atomically. */
    @Query(
        "INSERT INTO type_cq_subjects(subject_id, name, sort_order, created_at, updated_at) " +
            "SELECT :subjectId, :name, COALESCE(MAX(sort_order), 0) + 1, :now, :now FROM type_cq_subjects"
    )
    abstract suspend fun insertNext(subjectId: String, name: String, now: Long)

    @Query("UPDATE type_cq_subjects SET name = :name, updated_at = :now WHERE subject_id = :subjectId")
    abstract suspend fun rename(subjectId: String, name: String, now: Long): Int

    @Query("SELECT COUNT(*) FROM type_cq_chapters WHERE subject_id = :subjectId")
    abstract suspend fun countChapters(subjectId: String): Int

    @Query(
        "SELECT COUNT(*) FROM type_cq_questions q " +
            "JOIN type_cq_topics t ON t.topic_id = q.topic_id " +
            "JOIN type_cq_chapters c ON c.chapter_id = t.chapter_id WHERE c.subject_id = :subjectId"
    )
    abstract suspend fun countQuestions(subjectId: String): Int

    @Query("DELETE FROM type_cq_subjects WHERE subject_id = :subjectId")
    abstract suspend fun deleteById(subjectId: String): Int

    @Query("SELECT subject_id FROM type_cq_subjects")
    abstract suspend fun allIds(): List<String>

    @Query("UPDATE type_cq_subjects SET sort_order = :position, updated_at = :now WHERE subject_id = :subjectId")
    abstract suspend fun setOrder(subjectId: String, position: Long, now: Long)

    /** Deletes only when the subject has no chapters and no questions; the check and the delete are one transaction. */
    @Transaction
    open suspend fun deleteIfEmpty(subjectId: String): DeleteOutcome {
        if (countById(subjectId) == 0) return DeleteOutcome.NotFound
        val chapters = countChapters(subjectId)
        val questions = countQuestions(subjectId)
        if (chapters > 0 || questions > 0) return DeleteOutcome.NotEmpty(chapters, questions)
        deleteById(subjectId)
        return DeleteOutcome.Deleted
    }

    /** Writes sort_order 1..n in the given order. Returns false (and writes nothing) unless [ids] is exactly the current set. */
    @Transaction
    open suspend fun reorder(ids: List<String>, now: Long): Boolean {
        val current = allIds()
        if (ids.size != current.size || ids.toSet() != current.toSet()) return false
        ids.forEachIndexed { index, id -> setOrder(id, (index + 1).toLong(), now) }
        return true
    }
}
