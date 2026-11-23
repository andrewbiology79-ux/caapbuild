package com.questionbank.app.data.local.dao

import androidx.room.Dao
import androidx.room.Embedded
import androidx.room.ColumnInfo
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Relation
import androidx.room.Transaction
import com.questionbank.app.data.local.entity.TypeCqConceptEntity
import com.questionbank.app.data.local.entity.TypeCqConceptPartsEntity
import java.util.UUID
import kotlinx.coroutines.flow.Flow

data class TypeCqConceptWithParts(
    @Embedded val concept: TypeCqConceptEntity,
    @Relation(parentColumn = "concept_id", entityColumn = "concept_id")
    val parts: List<TypeCqConceptPartsEntity>,
)

data class TypeCqConceptListItemDb(
    @Embedded val concept: TypeCqConceptEntity,
    @Relation(parentColumn = "concept_id", entityColumn = "concept_id")
    val parts: List<TypeCqConceptPartsEntity>,
    @ColumnInfo(name = "card_number") val cardNumber: Int,
)

data class TypeCqConceptOwnerDb(
    @ColumnInfo(name = "stimulus_id") val stimulusId: String?,
    @ColumnInfo(name = "question_id") val questionId: String?,
)

@Dao
abstract class TypeCqConceptDao {
    @Query("SELECT stimulus_id, question_id FROM type_cq_concepts WHERE topic_id = :topicId")
    abstract suspend fun cardOwnersOfTopic(topicId: String): List<TypeCqConceptOwnerDb>
    @Transaction
    @Query("""
        SELECT c.* FROM type_cq_concepts c
        WHERE (:stimulusId IS NOT NULL AND c.stimulus_id = :stimulusId)
           OR (:questionId IS NOT NULL AND c.question_id = :questionId)
        LIMIT 1
    """)
    abstract fun observeForCard(stimulusId: String?, questionId: String?): Flow<TypeCqConceptWithParts?>

    @Transaction
    @Query("""
        SELECT c.*,
          CAST((
            SELECT COUNT(*) + 1 FROM (
              SELECT MIN(q2.sort_order) AS first_sort_order
              FROM type_cq_questions q2
              WHERE q2.topic_id = :topicId
              GROUP BY CASE
                WHEN q2.stimulus_id IS NULL THEN 'Q:' || q2.question_id
                ELSE 'S:' || q2.stimulus_id
              END
            ) cards
            WHERE cards.first_sort_order < COALESCE(
              (SELECT MIN(q.sort_order) FROM type_cq_questions q
               WHERE q.topic_id = :topicId AND (
                 (c.stimulus_id IS NOT NULL AND q.stimulus_id = c.stimulus_id)
                 OR (c.question_id IS NOT NULL AND q.question_id = c.question_id)
               )),
              9223372036854775807
            )
          ) AS INTEGER) AS card_number
        FROM type_cq_concepts c
        WHERE c.topic_id = :topicId
        ORDER BY COALESCE(
          (SELECT MIN(q.sort_order) FROM type_cq_questions q
           WHERE q.topic_id = :topicId AND (
             (c.stimulus_id IS NOT NULL AND q.stimulus_id = c.stimulus_id)
             OR (c.question_id IS NOT NULL AND q.question_id = c.question_id)
           )),
          9223372036854775807
        ) ASC
    """)
    abstract fun observeTopicConcepts(topicId: String): Flow<List<TypeCqConceptListItemDb>>

    @Query("""
        SELECT * FROM type_cq_concepts
        WHERE (:stimulusId IS NOT NULL AND stimulus_id = :stimulusId)
           OR (:questionId IS NOT NULL AND question_id = :questionId)
        LIMIT 1
    """)
    abstract suspend fun findForCard(stimulusId: String?, questionId: String?): TypeCqConceptEntity?

    @Query("SELECT COUNT(*) FROM type_cq_stimuli WHERE stimulus_id = :id AND topic_id = :topicId")
    abstract suspend fun stimulusExists(id: String, topicId: String): Int

    @Query("SELECT COUNT(*) FROM type_cq_questions WHERE question_id = :id AND topic_id = :topicId AND stimulus_id IS NULL")
    abstract suspend fun singleQuestionExists(id: String, topicId: String): Int

    @Query("SELECT * FROM type_cq_concept_parts WHERE concept_id = :conceptId ORDER BY position, part_id")
    abstract suspend fun parts(conceptId: String): List<TypeCqConceptPartsEntity>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    abstract suspend fun insertConcept(row: TypeCqConceptEntity)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    abstract suspend fun insertPart(row: TypeCqConceptPartsEntity)

    @Query("UPDATE type_cq_concepts SET updated_at = :now WHERE concept_id = :conceptId")
    abstract suspend fun touchConcept(conceptId: String, now: Long): Int

    @Query("DELETE FROM type_cq_concept_parts WHERE concept_id = :conceptId")
    abstract suspend fun clearParts(conceptId: String)

    @Query("DELETE FROM type_cq_concepts WHERE concept_id = :conceptId")
    abstract suspend fun deleteConceptRow(conceptId: String): Int

    @Transaction
    open suspend fun saveForCard(
        topicId: String,
        stimulusId: String?,
        questionId: String?,
        rows: List<TypeCqConceptPartsEntity>,
        now: Long,
    ): Boolean {
        if (topicId.isBlank() || (stimulusId == null) == (questionId == null)) return false
        val ownerExists = if (stimulusId != null) stimulusExists(stimulusId, topicId) == 1
            else singleQuestionExists(questionId.orEmpty(), topicId) == 1
        if (!ownerExists) return false
        if (rows.map { it.partId }.distinct().size != rows.size) return false
        if (rows.any { row ->
                row.partType !in setOf("TEXT", "IMAGE") ||
                    (row.partType == "TEXT" && (row.textContent.isNullOrBlank() || row.imageId != null)) ||
                    (row.partType == "IMAGE" && (row.imageId.isNullOrBlank() || row.textContent != null))
            }) return false
        val existing = findForCard(stimulusId, questionId)
        if (rows.isEmpty()) {
            existing?.let { deleteConceptRow(it.conceptId) }
            return true
        }
        val conceptId = existing?.conceptId ?: UUID.randomUUID().toString()
        if (existing == null) {
            insertConcept(TypeCqConceptEntity(conceptId, topicId, stimulusId, questionId, now, now))
        } else {
            touchConcept(conceptId, now)
            clearParts(conceptId)
        }
        rows.sortedBy { it.position }.forEachIndexed { index, row ->
            insertPart(row.copy(conceptId = conceptId, position = index.toLong(), createdAt = now))
        }
        return parts(conceptId).size == rows.size
    }

    /** A copied card gets its own concept row, while its image files may be safely shared. */
    @Transaction
    open suspend fun copyConcept(sourceStimulusId: String?, sourceQuestionId: String?, targetTopicId: String, targetStimulusId: String?, targetQuestionId: String?, now: Long): Boolean {
        if ((sourceStimulusId == null) == (sourceQuestionId == null) || (targetStimulusId == null) == (targetQuestionId == null)) return false
        val source = findForCard(sourceStimulusId, sourceQuestionId) ?: return true
        val targetExists = if (targetStimulusId != null) stimulusExists(targetStimulusId, targetTopicId) == 1
            else singleQuestionExists(targetQuestionId.orEmpty(), targetTopicId) == 1
        if (!targetExists || findForCard(targetStimulusId, targetQuestionId) != null) return false
        val newId = UUID.randomUUID().toString()
        insertConcept(TypeCqConceptEntity(newId, targetTopicId, targetStimulusId, targetQuestionId, now, now))
        parts(source.conceptId).forEachIndexed { index, part ->
            insertPart(part.copy(partId = UUID.randomUUID().toString(), conceptId = newId, position = index.toLong(), createdAt = now))
        }
        return true
    }

    @Query("UPDATE type_cq_concepts SET topic_id = :topicId, updated_at = :now WHERE stimulus_id = :stimulusId")
    abstract suspend fun moveStimulusConcept(stimulusId: String, topicId: String, now: Long): Int

    @Query("UPDATE type_cq_concepts SET topic_id = :topicId, updated_at = :now WHERE question_id = :questionId")
    abstract suspend fun moveQuestionConcept(questionId: String, topicId: String, now: Long): Int
}
