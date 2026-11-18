package com.questionbank.app.data.local.dao

import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Transaction
import com.questionbank.app.data.local.FtsIdAllocator
import com.questionbank.app.data.local.entity.TypeCqQuestionsEntity
import com.questionbank.app.data.local.entity.TypeCqStimuliEntity
import kotlinx.coroutines.flow.Flow

/** One question row joined with its stimulus text (null when the question has no stimulus). */
data class QuestionRowDb(
    @ColumnInfo(name = "question_id") val questionId: String,
    @ColumnInfo(name = "stimulus_id") val stimulusId: String?,
    @ColumnInfo(name = "stimulus_text") val stimulusText: String?,
    @ColumnInfo(name = "subquestion_label") val label: String,
    @ColumnInfo(name = "marks") val marks: Double,
    @ColumnInfo(name = "question_text") val questionText: String,
    @ColumnInfo(name = "short_answer") val shortAnswer: String,
    @ColumnInfo(name = "rating") val rating: Int?,
    @ColumnInfo(name = "stimulus_rating") val stimulusRating: Int?,
)

/** A stimulus of one topic with its text, for the plain-text part of the search. */
data class StimulusTextDb(
    @ColumnInfo(name = "stimulus_id") val stimulusId: String,
    @ColumnInfo(name = "stimulus_text") val stimulusText: String,
)

data class StoredTextDb(
    @ColumnInfo(name = "question_id") val questionId: String,
    @ColumnInfo(name = "question_text") val questionText: String,
    @ColumnInfo(name = "short_answer") val shortAnswer: String,
)

/** Values for one question to insert; ids and the fts_id are decided inside the transaction. */
data class NewQuestionRow(
    val id: String,
    val typeId: String,
    val label: String,
    val marks: Double,
    val text: String,
    val answer: String,
)

/** Question rows of one topic with their stimulus, newest first. Shared by the live list and the search. */
private const val QUESTION_ROWS_SQL =
    "SELECT q.question_id AS question_id, q.stimulus_id AS stimulus_id, s.stimulus_text AS stimulus_text, " +
        "q.subquestion_label AS subquestion_label, q.marks AS marks, q.question_text AS question_text, " +
        "q.short_answer AS short_answer, q.rating AS rating, s.rating AS stimulus_rating " +
        "FROM type_cq_questions q LEFT JOIN type_cq_stimuli s ON s.stimulus_id = q.stimulus_id " +
        "WHERE q.topic_id = :topicId ORDER BY q.sort_order DESC, q.question_id"

/**
 * Abstract class (not an interface) because [insertGroup] is a @Transaction method with a body.
 * Room runs the whole body in one transaction: any exception rolls back the stimulus, every question, their FTS rows
 * (written by the canonical triggers) and the draft removal together.
 */
@Dao
abstract class TypeCqQuestionDao {
    @Query("SELECT name FROM type_cq_topics WHERE topic_id = :topicId")
    abstract fun observeTopicName(topicId: String): Flow<String?>

    @Query(QUESTION_ROWS_SQL)
    abstract fun observeByTopic(topicId: String): Flow<List<QuestionRowDb>>

    /** Same rows as [observeByTopic], read once (used by the search). */
    @Query(QUESTION_ROWS_SQL)
    abstract suspend fun selectByTopic(topicId: String): List<QuestionRowDb>

    @Query("SELECT stimulus_id, stimulus_text FROM type_cq_stimuli WHERE topic_id = :topicId AND stimulus_text <> ''")
    abstract suspend fun stimuliOfTopic(topicId: String): List<StimulusTextDb>

    @Query("SELECT COUNT(*) FROM type_cq_topics WHERE topic_id = :topicId")
    abstract suspend fun countTopic(topicId: String): Int

    @Query("SELECT COALESCE(MAX(fts_id), 0) FROM type_cq_questions")
    abstract suspend fun maxFtsId(): Long

    @Query("SELECT COALESCE(MAX(sort_order), 0) FROM type_cq_questions WHERE topic_id = :topicId")
    abstract suspend fun maxSortOrder(topicId: String): Long

    @Insert
    abstract suspend fun insertStimulus(row: TypeCqStimuliEntity)

    @Insert
    abstract suspend fun insertQuestion(row: TypeCqQuestionsEntity)

    @Query("SELECT question_id, question_text, short_answer FROM type_cq_questions WHERE question_id IN (:ids)")
    abstract suspend fun readBack(ids: List<String>): List<StoredTextDb>

    @Query("SELECT stimulus_text FROM type_cq_stimuli WHERE stimulus_id = :stimulusId")
    abstract suspend fun readStimulusText(stimulusId: String): String?

    @Query("SELECT value_json FROM app_metadata WHERE \"key\" = :key")
    abstract suspend fun getMeta(key: String): String?

    @Query("INSERT OR REPLACE INTO app_metadata(\"key\", value_json, updated_at) VALUES(:key, :json, :now)")
    abstract suspend fun putMeta(key: String, json: String, now: Long)

    @Query("DELETE FROM app_metadata WHERE \"key\" = :key")
    abstract suspend fun deleteMeta(key: String)

    /** Returns false (and writes nothing) when the topic no longer exists. */
    @Transaction
    open suspend fun insertGroup(
        topicId: String,
        stimulusId: String?,
        stimulusText: String,
        items: List<NewQuestionRow>,
        now: Long,
        draftKey: String,
    ): Boolean {
        if (countTopic(topicId) == 0) return false
        if (stimulusId != null) {
            insertStimulus(TypeCqStimuliEntity(stimulusId, topicId, stimulusText, null, "", now, now))
        }
        val ids = FtsIdAllocator(maxFtsId())
        var order = maxSortOrder(topicId)
        for (item in items) {
            order += 1
            insertQuestion(
                TypeCqQuestionsEntity(
                    questionId = item.id,
                    ftsId = ids.next(),
                    stimulusId = stimulusId,
                    topicId = topicId,
                    questionTypeId = item.typeId,
                    subquestionLabel = item.label,
                    marks = item.marks,
                    questionText = item.text,
                    shortAnswer = item.answer,
                    rating = null,
                    sortOrder = order,
                    createdAt = now,
                    updatedAt = now,
                )
            )
        }
        deleteMeta(draftKey)
        return true
    }
}
