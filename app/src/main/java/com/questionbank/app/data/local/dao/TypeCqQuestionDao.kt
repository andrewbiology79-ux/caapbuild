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
    @ColumnInfo(name = "rating") val rating: Int?,
)

/** Values for one question to insert; ids and the fts_id are decided inside the transaction. */
data class NewQuestionRow(
    val id: String,
    val typeId: String,
    val label: String,
    val marks: Double,
    val text: String,
    val answer: String,
    /** v0.2.30: 1-5 or null (the table has a CHECK for the range). */
    val rating: Int? = null,
)

/** Values for one stored question whose rating changes (v0.2.30); [rating] null clears it. */
data class QuestionRatingDb(val questionId: String, val rating: Int?)

/** Values for one stored question whose text and short answer change (v0.2.28). */
data class QuestionTextUpdate(val questionId: String, val text: String, val answer: String)

private const val QUESTION_SELECT_SQL =
    "SELECT q.question_id AS question_id, q.stimulus_id AS stimulus_id, s.stimulus_text AS stimulus_text, " +
        "q.subquestion_label AS subquestion_label, q.marks AS marks, q.question_text AS question_text, " +
        "q.short_answer AS short_answer, q.rating AS rating, s.rating AS stimulus_rating " +
        "FROM type_cq_questions q LEFT JOIN type_cq_stimuli s ON s.stimulus_id = q.stimulus_id "

/** Question rows of one topic with their stimulus, newest first. Shared by the live list and the search. */
private const val QUESTION_ROWS_SQL = QUESTION_SELECT_SQL + "WHERE q.topic_id = :topicId ORDER BY q.sort_order DESC, q.question_id"

/** The rows of ONE card: all questions of a stimulus (v0.2.28). */
private const val GROUP_BY_STIMULUS_SQL =
    QUESTION_SELECT_SQL + "WHERE q.topic_id = :topicId AND q.stimulus_id = :stimulusId ORDER BY q.sort_order DESC, q.question_id"

/** The row of ONE single question without a stimulus (v0.2.28). */
private const val GROUP_BY_SINGLE_SQL =
    QUESTION_SELECT_SQL + "WHERE q.topic_id = :topicId AND q.question_id = :questionId AND q.stimulus_id IS NULL"

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

    @Query(GROUP_BY_STIMULUS_SQL)
    abstract suspend fun selectByStimulus(topicId: String, stimulusId: String): List<QuestionRowDb>

    @Query(GROUP_BY_SINGLE_SQL)
    abstract suspend fun selectBySingle(topicId: String, questionId: String): List<QuestionRowDb>

    @Query("SELECT stimulus_id, stimulus_text FROM type_cq_stimuli WHERE topic_id = :topicId AND stimulus_text <> ''")
    abstract suspend fun stimuliOfTopic(topicId: String): List<StimulusTextDb>

    @Query("SELECT COUNT(*) FROM type_cq_topics WHERE topic_id = :topicId")
    abstract suspend fun countTopic(topicId: String): Int

    @Query("SELECT COALESCE(MAX(fts_id), 0) FROM type_cq_questions")
    abstract suspend fun maxFtsId(): Long

    @Query("SELECT COALESCE(MAX(sort_order), 0) FROM type_cq_questions WHERE topic_id = :topicId")
    abstract suspend fun maxSortOrder(topicId: String): Long

    @Query("SELECT COUNT(*) FROM type_cq_stimuli WHERE stimulus_id = :stimulusId AND topic_id = :topicId")
    abstract suspend fun countStimulus(stimulusId: String, topicId: String): Int

    @Query("SELECT COUNT(*) FROM type_cq_questions WHERE question_id IN (:ids) AND topic_id = :topicId")
    abstract suspend fun countQuestionsIn(ids: List<String>, topicId: String): Int

    @Query("SELECT COALESCE(MAX(sort_order), 0) FROM type_cq_questions WHERE stimulus_id = :stimulusId")
    abstract suspend fun maxSortOrderOfStimulus(stimulusId: String): Long

    @Query("UPDATE type_cq_stimuli SET stimulus_text = :text, updated_at = :now WHERE stimulus_id = :stimulusId")
    abstract suspend fun updateStimulusText(stimulusId: String, text: String, now: Long): Int

    @Query("UPDATE type_cq_questions SET question_text = :text, short_answer = :answer, updated_at = :now WHERE question_id = :questionId")
    abstract suspend fun updateQuestionText(questionId: String, text: String, answer: String, now: Long): Int

    @Query("UPDATE type_cq_questions SET rating = :rating, updated_at = :now WHERE question_id = :questionId")
    abstract suspend fun updateQuestionRating(questionId: String, rating: Int?, now: Long): Int

    @Query("UPDATE type_cq_stimuli SET rating = :rating, updated_at = :now WHERE stimulus_id = :stimulusId")
    abstract suspend fun updateStimulusRating(stimulusId: String, rating: Int?, now: Long): Int

    @Insert
    abstract suspend fun insertStimulus(row: TypeCqStimuliEntity)

    @Insert
    abstract suspend fun insertQuestion(row: TypeCqQuestionsEntity)

    @Query("SELECT question_id, question_text, short_answer, rating FROM type_cq_questions WHERE question_id IN (:ids)")
    abstract suspend fun readBack(ids: List<String>): List<StoredTextDb>

    @Query("SELECT stimulus_text FROM type_cq_stimuli WHERE stimulus_id = :stimulusId")
    abstract suspend fun readStimulusText(stimulusId: String): String?

    /** The stored stimulus rating (null when none, and also null when the stimulus does not exist: the callers check existence first). */
    @Query("SELECT rating FROM type_cq_stimuli WHERE stimulus_id = :stimulusId")
    abstract suspend fun readStimulusRating(stimulusId: String): Int?

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
        stimulusRating: Int?,
        items: List<NewQuestionRow>,
        now: Long,
        draftKey: String,
    ): Boolean {
        if (countTopic(topicId) == 0) return false
        if (stimulusId != null) {
            insertStimulus(TypeCqStimuliEntity(stimulusId, topicId, stimulusText, stimulusRating?.toLong(), "", now, now))
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
                    rating = item.rating?.toLong(),
                    sortOrder = order,
                    createdAt = now,
                    updatedAt = now,
                )
            )
        }
        deleteMeta(draftKey)
        return true
    }
    /**
     * Changes an existing group in ONE transaction (v0.2.28). Returns false, having written nothing, when the topic, the stimulus
     * or one of the questions no longer exists (everything is checked before the first write). Any exception rolls back every
     * write of this call. The `trg_type_question_fts_update` trigger keeps the FTS rows in step with the new texts.
     *
     * New rows get the group's current highest `sort_order`, so the card keeps its place in the list (the list shows the newest
     * card first and a card is placed by its highest `sort_order`).
     *
     * v0.2.29: [draftKey] (the edit draft of this card) is deleted in the same transaction, after every write succeeded.
     */
    @Transaction
    open suspend fun updateGroup(
        topicId: String,
        stimulusId: String?,
        newStimulusText: String?,
        updates: List<QuestionTextUpdate>,
        adds: List<NewQuestionRow>,
        now: Long,
        draftKey: String,
        changeStimulusRating: Boolean,
        newStimulusRating: Int?,
        ratingUpdates: List<QuestionRatingDb>,
    ): Boolean {
        if (countTopic(topicId) == 0) return false
        if (stimulusId != null && countStimulus(stimulusId, topicId) == 0) return false
        if (updates.isNotEmpty() && countQuestionsIn(updates.map { it.questionId }, topicId) != updates.size) return false
        if (ratingUpdates.isNotEmpty() && countQuestionsIn(ratingUpdates.map { it.questionId }, topicId) != ratingUpdates.size) return false
        if (changeStimulusRating && stimulusId == null) return false
        if (newStimulusText != null) {
            val sid = checkNotNull(stimulusId) { "stimulus text given for a group without a stimulus" }
            check(updateStimulusText(sid, newStimulusText, now) == 1) { "stimulus row was not updated" }
        }
        if (changeStimulusRating) {
            val sid = checkNotNull(stimulusId) { "stimulus rating given for a group without a stimulus" }
            check(updateStimulusRating(sid, newStimulusRating, now) == 1) { "stimulus rating was not updated" }
        }
        for (u in updates) {
            check(updateQuestionText(u.questionId, u.text, u.answer, now) == 1) { "question row was not updated" }
        }
        for (r in ratingUpdates) {
            check(updateQuestionRating(r.questionId, r.rating, now) == 1) { "question rating was not updated" }
        }
        if (adds.isNotEmpty()) {
            val sid = checkNotNull(stimulusId) { "new sub-question needs a stimulus" }
            val ids = FtsIdAllocator(maxFtsId())
            val order = maxSortOrderOfStimulus(sid)
            for (item in adds) {
                insertQuestion(
                    TypeCqQuestionsEntity(
                        questionId = item.id,
                        ftsId = ids.next(),
                        stimulusId = sid,
                        topicId = topicId,
                        questionTypeId = item.typeId,
                        subquestionLabel = item.label,
                        marks = item.marks,
                        questionText = item.text,
                        shortAnswer = item.answer,
                        rating = item.rating?.toLong(),
                        sortOrder = order,
                        createdAt = now,
                        updatedAt = now,
                    )
                )
            }
        }
        // v0.2.29: the edit draft of this card is removed in the same transaction, so a saved edit never leaves a draft behind.
        deleteMeta(draftKey)
        return true
    }
}
