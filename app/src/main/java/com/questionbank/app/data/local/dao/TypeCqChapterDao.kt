package com.questionbank.app.data.local.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction
import com.questionbank.app.data.local.entity.TypeCqChaptersEntity
import kotlinx.coroutines.flow.Flow

@Dao
abstract class TypeCqChapterDao {
    @Query("SELECT * FROM type_cq_chapters WHERE subject_id = :subjectId ORDER BY sort_order, name, chapter_id")
    abstract fun observeBySubject(subjectId: String): Flow<List<TypeCqChaptersEntity>>

    @Query("SELECT * FROM type_cq_chapters WHERE chapter_id = :chapterId")
    abstract fun observeById(chapterId: String): Flow<TypeCqChaptersEntity?>

    @Query(
        "SELECT c.chapter_id AS id, c.name AS name, " +
            "(SELECT COUNT(*) FROM type_cq_topics t WHERE t.chapter_id = c.chapter_id) AS child_count, " +
            "(SELECT COUNT(*) FROM type_cq_questions q JOIN type_cq_topics t ON t.topic_id = q.topic_id " +
            "WHERE t.chapter_id = c.chapter_id) AS question_count " +
            "FROM type_cq_chapters c WHERE c.subject_id = :subjectId ORDER BY c.sort_order, c.name, c.chapter_id"
    )
    abstract fun observeRows(subjectId: String): Flow<List<HierarchyRowDb>>

    @Query(
        "SELECT s.subject_id AS subject_id, s.name AS subject_name, c.chapter_id AS chapter_id, c.name AS chapter_name " +
            "FROM type_cq_chapters c JOIN type_cq_subjects s ON s.subject_id = c.subject_id WHERE c.chapter_id = :chapterId"
    )
    abstract fun observePath(chapterId: String): Flow<ChapterPathDb?>

    @Query("SELECT COUNT(*) FROM type_cq_chapters WHERE chapter_id = :chapterId")
    abstract suspend fun countById(chapterId: String): Int

    @Query("SELECT COUNT(*) FROM type_cq_chapters WHERE subject_id = :subjectId AND name = :name")
    abstract suspend fun countByName(subjectId: String, name: String): Int

    @Query("SELECT COUNT(*) FROM type_cq_chapters WHERE subject_id = :subjectId AND name = :name AND chapter_id <> :chapterId")
    abstract suspend fun countByNameExcept(subjectId: String, name: String, chapterId: String): Int

    @Query("SELECT subject_id FROM type_cq_chapters WHERE chapter_id = :chapterId")
    abstract suspend fun subjectIdOf(chapterId: String): String?

    @Query(
        "INSERT INTO type_cq_chapters(chapter_id, subject_id, name, sort_order, created_at, updated_at) " +
            "SELECT :chapterId, :subjectId, :name, COALESCE(MAX(sort_order), 0) + 1, :now, :now " +
            "FROM type_cq_chapters WHERE subject_id = :subjectId"
    )
    abstract suspend fun insertNext(chapterId: String, subjectId: String, name: String, now: Long)

    @Query("UPDATE type_cq_chapters SET name = :name, updated_at = :now WHERE chapter_id = :chapterId")
    abstract suspend fun rename(chapterId: String, name: String, now: Long): Int

    @Query("SELECT COUNT(*) FROM type_cq_topics WHERE chapter_id = :chapterId")
    abstract suspend fun countTopics(chapterId: String): Int

    @Query(
        "SELECT COUNT(*) FROM type_cq_questions q JOIN type_cq_topics t ON t.topic_id = q.topic_id " +
            "WHERE t.chapter_id = :chapterId"
    )
    abstract suspend fun countQuestions(chapterId: String): Int

    @Query("DELETE FROM type_cq_chapters WHERE chapter_id = :chapterId")
    abstract suspend fun deleteById(chapterId: String): Int

    @Query("SELECT chapter_id FROM type_cq_chapters WHERE subject_id = :subjectId")
    abstract suspend fun idsOfSubject(subjectId: String): List<String>

    @Query(
        "UPDATE type_cq_chapters SET sort_order = :position, updated_at = :now " +
            "WHERE chapter_id = :chapterId AND subject_id = :subjectId"
    )
    abstract suspend fun setOrder(subjectId: String, chapterId: String, position: Long, now: Long)

    @Transaction
    open suspend fun deleteIfEmpty(chapterId: String): DeleteOutcome {
        if (countById(chapterId) == 0) return DeleteOutcome.NotFound
        val topics = countTopics(chapterId)
        val questions = countQuestions(chapterId)
        if (topics > 0 || questions > 0) return DeleteOutcome.NotEmpty(topics, questions)
        deleteById(chapterId)
        return DeleteOutcome.Deleted
    }

    @Transaction
    open suspend fun reorder(subjectId: String, ids: List<String>, now: Long): Boolean {
        val current = idsOfSubject(subjectId)
        if (ids.size != current.size || ids.toSet() != current.toSet()) return false
        ids.forEachIndexed { index, id -> setOrder(subjectId, id, (index + 1).toLong(), now) }
        return true
    }
}
