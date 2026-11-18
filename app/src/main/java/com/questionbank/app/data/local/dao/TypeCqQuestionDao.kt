package com.questionbank.app.data.local.dao

import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Transaction
import com.questionbank.app.data.local.FtsIdAllocator
import com.questionbank.app.data.local.entity.BoardCatalogEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionBoardsEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionsEntity
import com.questionbank.app.data.local.entity.TypeCqStimuliEntity
import com.questionbank.app.data.local.entity.TypeCqStimulusBoardsEntity
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
    /** v0.2.30c: board tags of this question, stored in the same transaction (the ids are decided by the caller). */
    val tags: List<NewTagRow> = emptyList(),
)

/** One board tag to store (v0.2.30c). The position in the list becomes `sort_order`. */
data class NewTagRow(val id: String, val boardCode: String, val year: Int)

/** The wanted full tag list of one stored question (v0.2.30c); an empty list clears. */
data class QuestionBoardsDb(val questionId: String, val tags: List<NewTagRow>)

/** One stored board tag of a stimulus or a question ([ownerId] is the stimulus_id or the question_id). */
data class BoardRowDb(
    @ColumnInfo(name = "owner_id") val ownerId: String,
    @ColumnInfo(name = "board_code") val boardCode: String,
    @ColumnInfo(name = "year") val year: Int,
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

private const val STIMULUS_BOARDS_SELECT =
    "SELECT sb.stimulus_id AS owner_id, sb.board_code AS board_code, sb.year AS year FROM type_cq_stimulus_boards sb "
private const val QUESTION_BOARDS_SELECT =
    "SELECT qb.question_id AS owner_id, qb.board_code AS board_code, qb.year AS year FROM type_cq_question_boards qb "

private suspend fun TypeCqQuestionDao.writeStimulusTags(stimulusId: String, tags: List<NewTagRow>) {
    tags.forEachIndexed { index, tag ->
        insertStimulusBoard(TypeCqStimulusBoardsEntity(tag.id, stimulusId, tag.boardCode, tag.year.toLong(), index.toLong()))
    }
}

private suspend fun TypeCqQuestionDao.writeQuestionTags(questionId: String, tags: List<NewTagRow>) {
    tags.forEachIndexed { index, tag ->
        insertQuestionBoard(TypeCqQuestionBoardsEntity(tag.id, questionId, tag.boardCode, tag.year.toLong(), index.toLong()))
    }
}

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

    @Query("UPDATE type_cq_stimuli SET updated_at = :now WHERE stimulus_id = :stimulusId")
    abstract suspend fun touchStimulus(stimulusId: String, now: Long): Int

    @Query("UPDATE type_cq_questions SET updated_at = :now WHERE question_id = :questionId")
    abstract suspend fun touchQuestion(questionId: String, now: Long): Int

    // ---- boards and years (v0.2.30c) ----

    @Query("SELECT * FROM board_catalog ORDER BY is_archived, sort_order, display_name")
    abstract fun observeBoards(): Flow<List<BoardCatalogEntity>>

    @Query("SELECT * FROM board_catalog ORDER BY is_archived, sort_order, display_name")
    abstract suspend fun boardsOnce(): List<BoardCatalogEntity>

    @Query("SELECT code FROM board_catalog")
    abstract suspend fun boardCodes(): List<String>

    @Query("SELECT COALESCE(MAX(sort_order), 0) FROM board_catalog")
    abstract suspend fun maxBoardSortOrder(): Long

    @Insert
    abstract suspend fun insertBoard(row: BoardCatalogEntity)

    @Insert
    abstract suspend fun insertStimulusBoard(row: TypeCqStimulusBoardsEntity)

    @Insert
    abstract suspend fun insertQuestionBoard(row: TypeCqQuestionBoardsEntity)

    @Query("DELETE FROM type_cq_stimulus_boards WHERE stimulus_id = :stimulusId")
    abstract suspend fun deleteStimulusBoards(stimulusId: String)

    @Query("DELETE FROM type_cq_question_boards WHERE question_id = :questionId")
    abstract suspend fun deleteQuestionBoards(questionId: String)

    /** Tags of every stimulus of one topic, in the order they were chosen. */
    @Query(STIMULUS_BOARDS_SELECT + "JOIN type_cq_stimuli s ON s.stimulus_id = sb.stimulus_id WHERE s.topic_id = :topicId ORDER BY sb.stimulus_id, sb.sort_order, sb.year, sb.board_code")
    abstract suspend fun stimulusBoardsOfTopic(topicId: String): List<BoardRowDb>

    /** Tags of every question of one topic, in the order they were chosen. */
    @Query(QUESTION_BOARDS_SELECT + "JOIN type_cq_questions q ON q.question_id = qb.question_id WHERE q.topic_id = :topicId ORDER BY qb.question_id, qb.sort_order, qb.year, qb.board_code")
    abstract suspend fun questionBoardsOfTopic(topicId: String): List<BoardRowDb>

    /** For a few stimuli only (one card, the read-back): never call it with a topic-sized list. */
    @Query(STIMULUS_BOARDS_SELECT + "WHERE sb.stimulus_id IN (:ids) ORDER BY sb.stimulus_id, sb.sort_order, sb.year, sb.board_code")
    abstract suspend fun stimulusBoardsIn(ids: List<String>): List<BoardRowDb>

    /** For a few questions only (one card, the read-back): never call it with a topic-sized list. */
    @Query(QUESTION_BOARDS_SELECT + "WHERE qb.question_id IN (:ids) ORDER BY qb.question_id, qb.sort_order, qb.year, qb.board_code")
    abstract suspend fun questionBoardsIn(ids: List<String>): List<BoardRowDb>

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
        stimulusTags: List<NewTagRow>,
        items: List<NewQuestionRow>,
        now: Long,
        draftKey: String,
    ): Boolean {
        if (countTopic(topicId) == 0) return false
        if (stimulusId != null) {
            insertStimulus(TypeCqStimuliEntity(stimulusId, topicId, stimulusText, stimulusRating?.toLong(), "", now, now))
            writeStimulusTags(stimulusId, stimulusTags)
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
            writeQuestionTags(item.id, item.tags)
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
        changeStimulusBoards: Boolean,
        newStimulusBoards: List<NewTagRow>,
        boardUpdates: List<QuestionBoardsDb>,
    ): Boolean {
        if (countTopic(topicId) == 0) return false
        if (stimulusId != null && countStimulus(stimulusId, topicId) == 0) return false
        if (updates.isNotEmpty() && countQuestionsIn(updates.map { it.questionId }, topicId) != updates.size) return false
        if (ratingUpdates.isNotEmpty() && countQuestionsIn(ratingUpdates.map { it.questionId }, topicId) != ratingUpdates.size) return false
        if (changeStimulusRating && stimulusId == null) return false
        if (boardUpdates.isNotEmpty() && countQuestionsIn(boardUpdates.map { it.questionId }, topicId) != boardUpdates.size) return false
        if (changeStimulusBoards && stimulusId == null) return false
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
        if (changeStimulusBoards) {
            val sid = checkNotNull(stimulusId) { "stimulus boards given for a group without a stimulus" }
            deleteStimulusBoards(sid)
            writeStimulusTags(sid, newStimulusBoards)
            check(touchStimulus(sid, now) == 1) { "stimulus row was not touched" }
        }
        for (b in boardUpdates) {
            deleteQuestionBoards(b.questionId)
            writeQuestionTags(b.questionId, b.tags)
            check(touchQuestion(b.questionId, now) == 1) { "question row was not touched" }
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
                writeQuestionTags(item.id, item.tags)
            }
        }
        // v0.2.29: the edit draft of this card is removed in the same transaction, so a saved edit never leaves a draft behind.
        deleteMeta(draftKey)
        return true
    }
}
