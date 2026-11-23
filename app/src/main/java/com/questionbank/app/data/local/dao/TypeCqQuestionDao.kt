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
import com.questionbank.app.data.local.entity.TypeCqSolutionPartsEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionCategoryLinksEntity
import com.questionbank.app.data.local.entity.TypeCqStimulusImagesEntity
import com.questionbank.app.data.local.entity.TypeCqConceptsEntity
import com.questionbank.app.data.local.entity.TypeCqConceptPartsEntity
import java.util.UUID
import kotlinx.coroutines.flow.Flow

/** Paper title metadata for a Type CQ or Chapter CQ source question. */
data class QuestionPaperUsageDb(
    @ColumnInfo(name = "question_id") val questionId: String,
    @ColumnInfo(name = "paper_id") val paperId: String,
    @ColumnInfo(name = "short_name") val shortName: String,
    @ColumnInfo(name = "title") val title: String,
    @ColumnInfo(name = "category_name") val categoryName: String,
)

data class QuestionBreadcrumbDb(
    @ColumnInfo(name = "subject_id") val subjectId: String,
    @ColumnInfo(name = "subject_name") val subjectName: String,
    @ColumnInfo(name = "subject_order") val subjectOrder: Long,
    @ColumnInfo(name = "chapter_id") val chapterId: String,
    @ColumnInfo(name = "chapter_name") val chapterName: String,
    @ColumnInfo(name = "chapter_order") val chapterOrder: Long,
    @ColumnInfo(name = "topic_id") val topicId: String,
    @ColumnInfo(name = "topic_name") val topicName: String,
    @ColumnInfo(name = "topic_order") val topicOrder: Long,
)

data class QuestionConceptSummaryDb(
    @ColumnInfo(name = "question_id") val questionId: String,
    @ColumnInfo(name = "label") val label: String,
    @ColumnInfo(name = "question_text") val questionText: String,
)

data class QuestionConceptPartDb(
    @ColumnInfo(name = "question_id") val questionId: String,
    @ColumnInfo(name = "part_id") val partId: String,
    @ColumnInfo(name = "part_type") val partType: String,
    @ColumnInfo(name = "position") val position: Long,
    @ColumnInfo(name = "text_content") val textContent: String?,
    @ColumnInfo(name = "image_id") val imageId: String?,
)

data class StimulusQuestionIdDb(
    @ColumnInfo(name = "stimulus_id") val stimulusId: String,
    @ColumnInfo(name = "question_id") val questionId: String,
)

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
    @ColumnInfo(name = "question_type_id") val questionTypeId: String = "",
    @ColumnInfo(name = "reference_text") val referenceText: String? = null,
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
    @ColumnInfo(name = "question_type_id") val questionTypeId: String = "",
    @ColumnInfo(name = "marks") val marks: Double = 0.0,
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
    val solutionParts: List<String> = emptyList(),
    val categoryIds: List<String> = emptyList(),
    /** Complete mixed TEXT/IMAGE sequence. Empty means use the legacy text-only list above. */
    val orderedSolutionParts: List<NewSolutionPartRow> = emptyList(),
    /** Independent Concept content attached to this question. */
    val conceptParts: List<NewConceptPartRow> = emptyList(),
)

data class NewSolutionPartRow(
    val partId: String,
    val partType: String,
    val position: Long,
    val textContent: String?,
    val imageId: String?,
)

data class NewConceptPartRow(
    val partId: String,
    val partType: String,
    val position: Long,
    val textContent: String?,
    val imageId: String?,
)

data class NewStimulusImageRow(val imageId: String, val placement: String, val position: Long)
data class QuestionSolutionPartsDb(val questionId: String, val parts: List<NewSolutionPartRow>)

/** A complete saved card (one stimulus group or one standalone question) moved by CUT. */
data class MoveQuestionGroupDb(val stimulusId: String?, val questionIds: List<String>)

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
data class QuestionMetadataUpdate(val questionId: String, val typeId: String, val marks: Double)
data class QuestionSolutionUpdate(val questionId: String, val parts: List<String>)
data class QuestionCategoriesDb(val questionId: String, val categoryIds: List<String>)

private const val QUESTION_SELECT_SQL =
    "SELECT q.question_id AS question_id, q.stimulus_id AS stimulus_id, s.stimulus_text AS stimulus_text, " +
        "q.subquestion_label AS subquestion_label, q.marks AS marks, q.question_text AS question_text, " +
        "q.short_answer AS short_answer, q.rating AS rating, s.rating AS stimulus_rating, " +
        "q.question_type_id AS question_type_id, s.reference_text AS reference_text " +
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

/** Read-back helper used from inside the write transaction, before the corresponding draft is removed. */
private suspend fun TypeCqQuestionDao.boardTagsMatch(
    wantedStimulus: Pair<String, List<NewTagRow>>?,
    wantedQuestions: Map<String, List<NewTagRow>>,
): Boolean {
    fun same(actual: List<BoardRowDb>, expected: List<NewTagRow>): Boolean =
        actual.map { it.boardCode to it.year } == expected.map { it.boardCode to it.year }

    if (wantedStimulus != null) {
        val actual = stimulusBoardsIn(listOf(wantedStimulus.first))
            .filter { it.ownerId == wantedStimulus.first }
        if (!same(actual, wantedStimulus.second)) return false
    }
    if (wantedQuestions.isNotEmpty()) {
        val actual = questionBoardsIn(wantedQuestions.keys.toList()).groupBy { it.ownerId }
        if (!wantedQuestions.all { (id, expected) -> same(actual[id].orEmpty(), expected) }) return false
    }
    return true
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

    @Query("""
        SELECT sb.subject_id AS subject_id, sb.name AS subject_name, sb.sort_order AS subject_order,
               ch.chapter_id AS chapter_id, ch.name AS chapter_name, ch.sort_order AS chapter_order,
               tp.topic_id AS topic_id, tp.name AS topic_name, tp.sort_order AS topic_order
        FROM type_cq_topics tp
        JOIN type_cq_chapters ch ON ch.chapter_id = tp.chapter_id
        JOIN type_cq_subjects sb ON sb.subject_id = ch.subject_id
        WHERE tp.topic_id = :topicId LIMIT 1
    """)
    abstract fun observeBreadcrumb(topicId: String): Flow<QuestionBreadcrumbDb?>


    @Query("""
        SELECT 'TYPE_CQ' AS scope, q.question_id AS question_id,
               sb.subject_id AS subject_id, sb.name AS subject_name,
               ch.chapter_id AS chapter_id, ch.name AS chapter_name,
               tp.topic_id AS container_id, tp.name AS container_name,
               q.stimulus_id AS stimulus_id, COALESCE(st.stimulus_text,'') AS stimulus_text,
               COALESCE(st.reference_text,'') AS reference_text,
               q.subquestion_label AS label, q.marks AS marks, q.question_text AS question_text,
               q.short_answer AS short_answer, q.rating AS rating, q.question_type_id AS question_type_id
        FROM type_cq_questions q
        JOIN type_cq_topics tp ON tp.topic_id=q.topic_id
        JOIN type_cq_chapters ch ON ch.chapter_id=tp.chapter_id
        JOIN type_cq_subjects sb ON sb.subject_id=ch.subject_id
        LEFT JOIN type_cq_stimuli st ON st.stimulus_id=q.stimulus_id
        WHERE q.question_id=:questionId LIMIT 1
    """)
    abstract suspend fun paperSource(questionId: String): PaperSourceRowDb?

    @Query(QUESTION_ROWS_SQL)
    abstract fun observeByTopic(topicId: String): Flow<List<QuestionRowDb>>

    /** Same rows as [observeByTopic], read once (used by the search). */
    @Query(QUESTION_ROWS_SQL)
    abstract suspend fun selectByTopic(topicId: String): List<QuestionRowDb>

    @Query(GROUP_BY_STIMULUS_SQL)
    abstract suspend fun selectByStimulus(topicId: String, stimulusId: String): List<QuestionRowDb>

    /** All sub-question IDs for the complete stimulus cards, including rows hidden by a search filter. */
    @Query("SELECT stimulus_id AS stimulus_id, question_id AS question_id FROM type_cq_questions WHERE stimulus_id IN (:stimulusIds) ORDER BY stimulus_id, sort_order DESC, question_id")
    abstract suspend fun questionIdsForStimuli(stimulusIds: List<String>): List<StimulusQuestionIdDb>

    @Query(GROUP_BY_SINGLE_SQL)
    abstract suspend fun selectBySingle(topicId: String, questionId: String): List<QuestionRowDb>

    @Query("SELECT stimulus_id, stimulus_text FROM type_cq_stimuli WHERE topic_id = :topicId AND stimulus_text <> ''")
    abstract suspend fun stimuliOfTopic(topicId: String): List<StimulusTextDb>

    @Query("SELECT COUNT(*) FROM type_cq_topics WHERE topic_id = :topicId")
    abstract suspend fun countTopic(topicId: String): Int

    @Query("SELECT COUNT(*) FROM type_cq_question_types WHERE question_type_id = :typeId AND is_active = 1")
    abstract suspend fun activeQuestionTypeExists(typeId: String): Int

    @Query("SELECT COUNT(*) FROM type_cq_question_categories WHERE category_id = :categoryId AND is_archived = 0")
    abstract suspend fun activeCategory(categoryId: String): Int

    @Query("SELECT COUNT(*) FROM type_cq_question_category_links WHERE question_id = :questionId AND category_id = :categoryId")
    abstract suspend fun categoryAlreadyLinked(questionId: String, categoryId: String): Int

    @Query("SELECT * FROM type_cq_question_category_links WHERE question_id IN (:ids) ORDER BY question_id, assigned_at, category_id")
    abstract suspend fun categoryLinksIn(ids: List<String>): List<TypeCqQuestionCategoryLinksEntity>

    @Query("""
        SELECT DISTINCT link.category_id FROM type_cq_question_category_links link
        JOIN type_cq_questions q ON q.question_id = link.question_id
        WHERE q.topic_id = :topicId AND (
            (:stimulusId IS NOT NULL AND q.stimulus_id = :stimulusId) OR
            (:stimulusId IS NULL AND q.question_id = :singleQuestionId)
        ) ORDER BY link.assigned_at, link.category_id
    """)
    abstract suspend fun categoryIdsOfCard(topicId: String, stimulusId: String?, singleQuestionId: String): List<String>

    @Query("SELECT * FROM type_cq_question_category_links WHERE question_id IN (SELECT question_id FROM type_cq_questions WHERE topic_id = :topicId) ORDER BY question_id, assigned_at, category_id")
    abstract suspend fun categoryLinksOfTopic(topicId: String): List<TypeCqQuestionCategoryLinksEntity>

    @Insert
    abstract suspend fun insertCategoryLink(row: TypeCqQuestionCategoryLinksEntity)

    @Query("DELETE FROM type_cq_question_category_links WHERE question_id = :questionId")
    abstract suspend fun deleteQuestionCategories(questionId: String)

    @Query("SELECT COUNT(*) FROM type_cq_questions WHERE question_id = :questionId")
    abstract suspend fun countQuestion(questionId: String): Int

    @Transaction
    open suspend fun replaceQuestionCategories(questionId: String, categoryIds: List<String>, now: Long): Boolean {
        if (questionId.isBlank() || countQuestion(questionId) != 1) return false
        if (categoryIds.any(String::isBlank) || categoryIds.distinct().size != categoryIds.size) return false
        if (categoryIds.any { activeCategory(it) == 0 && categoryAlreadyLinked(questionId, it) == 0 }) return false
        deleteQuestionCategories(questionId)
        categoryIds.forEach { categoryId ->
            insertCategoryLink(TypeCqQuestionCategoryLinksEntity(questionId, categoryId, now))
        }
        // Force observeByTopic() to invalidate; its row query intentionally stays independent of category joins.
        check(touchQuestion(questionId, now) == 1) { "Question category owner was not touched" }
        val actual = categoryLinksIn(listOf(questionId)).map { it.categoryId }.toSet()
        check(actual == categoryIds.toSet()) { "Question category read-back mismatch" }
        return true
    }

    @Transaction
    open suspend fun replaceQuestionCategoriesForGroup(questionIds: List<String>, categoryIds: List<String>, now: Long): Boolean {
        if (questionIds.isEmpty() || questionIds.any(String::isBlank) || questionIds.distinct().size != questionIds.size) return false
        if (countQuestionIds(questionIds) != questionIds.size) return false
        if (categoryIds.any(String::isBlank) || categoryIds.distinct().size != categoryIds.size) return false
        if (categoryIds.any { categoryId -> activeCategory(categoryId) == 0 && questionIds.none { qid -> categoryAlreadyLinked(qid, categoryId) > 0 } }) return false
        questionIds.forEach { questionId ->
            deleteQuestionCategories(questionId)
            categoryIds.forEach { categoryId ->
                insertCategoryLink(TypeCqQuestionCategoryLinksEntity(questionId, categoryId, now))
            }
            check(touchQuestion(questionId, now) == 1) { "Question category owner was not touched" }
        }
        val actual = categoryLinksIn(questionIds).groupBy({ it.questionId }, { it.categoryId })
        check(questionIds.all { actual[it].orEmpty().toSet() == categoryIds.toSet() }) { "Group category read-back mismatch" }
        return true
    }

    @Query("SELECT * FROM type_cq_concepts WHERE question_id = :questionId LIMIT 1")
    abstract fun observeConcept(questionId: String): Flow<TypeCqConceptsEntity?>

    @Query("""
        SELECT p.* FROM type_cq_concept_parts p
        JOIN type_cq_concepts c ON c.concept_id = p.concept_id
        WHERE c.question_id = :questionId ORDER BY p.position, p.part_id
    """)
    abstract fun observeConceptParts(questionId: String): Flow<List<TypeCqConceptPartsEntity>>

    @Query("SELECT * FROM type_cq_concepts WHERE question_id = :questionId LIMIT 1")
    abstract suspend fun conceptForQuestion(questionId: String): TypeCqConceptsEntity?

    @Query("""
        SELECT c.question_id AS question_id, p.part_id AS part_id, p.part_type AS part_type,
               p.position AS position, p.text_content AS text_content, p.image_id AS image_id
        FROM type_cq_concept_parts p JOIN type_cq_concepts c ON c.concept_id = p.concept_id
        WHERE c.question_id IN (:ids) ORDER BY c.question_id, p.position, p.part_id
    """)
    abstract suspend fun conceptPartsOfQuestions(ids: List<String>): List<QuestionConceptPartDb>

    @Query("SELECT * FROM type_cq_concept_parts WHERE concept_id = :conceptId ORDER BY position, part_id")
    abstract suspend fun conceptPartsFor(conceptId: String): List<TypeCqConceptPartsEntity>

    @Query("DELETE FROM type_cq_concept_parts WHERE concept_id = :conceptId")
    abstract suspend fun deleteConceptParts(conceptId: String)

    @Query("DELETE FROM type_cq_concepts WHERE concept_id = :conceptId")
    abstract suspend fun deleteConceptById(conceptId: String)

    @androidx.room.Insert(onConflict = androidx.room.OnConflictStrategy.ABORT)
    abstract suspend fun insertConcept(row: TypeCqConceptsEntity)

    @androidx.room.Insert(onConflict = androidx.room.OnConflictStrategy.ABORT)
    abstract suspend fun insertConceptPart(row: TypeCqConceptPartsEntity)

    @Transaction
    open suspend fun replaceConcept(questionId: String, parts: List<com.questionbank.app.domain.question.ConceptContentPart>, now: Long): Boolean {
        if (questionId.isBlank() || countQuestion(questionId) != 1) return false
        if (parts.map { it.partId }.distinct().size != parts.size || parts.any { it.partId.isBlank() }) return false
        if (parts.any { part ->
                part.partType !in setOf("TEXT", "IMAGE") ||
                    (part.partType == "TEXT" && (part.textContent == null || part.imageId != null)) ||
                    (part.partType == "IMAGE" && (part.imageId.isNullOrBlank() || part.textContent != null || imageExistsForQuestion(part.imageId) == 0))
            }) return false
        val existing = conceptForQuestion(questionId)
        if (parts.isEmpty()) {
            existing?.let { deleteConceptById(it.conceptId) }
            return true
        }
        val conceptId = existing?.conceptId ?: "concept_${UUID.randomUUID()}"
        if (existing == null) insertConcept(TypeCqConceptsEntity(conceptId, questionId, now, now))
        else check(touchConcept(conceptId, now) == 1)
        deleteConceptParts(conceptId)
        parts.sortedWith(compareBy<com.questionbank.app.domain.question.ConceptContentPart> { it.position }.thenBy { it.partId })
            .forEachIndexed { index, part ->
                insertConceptPart(TypeCqConceptPartsEntity(safeConceptPartId(part.partId), conceptId, index.toLong(), part.partType, part.textContent, part.imageId, now))
            }
        val stored = conceptPartsFor(conceptId)
        check(stored.size == parts.size && stored.map { it.partType to (it.textContent to it.imageId) } ==
            parts.sortedBy { it.position }.map { it.partType to (it.textContent to it.imageId) }) { "Concept read-back mismatch" }
        return true
    }

    @Query("UPDATE type_cq_concepts SET updated_at = :now WHERE concept_id = :conceptId")
    abstract suspend fun touchConcept(conceptId: String, now: Long): Int

    @Query("""
        SELECT q.question_id AS question_id, q.subquestion_label AS label, q.question_text AS question_text
        FROM type_cq_questions q JOIN type_cq_concepts c ON c.question_id = q.question_id
        WHERE q.topic_id = :topicId ORDER BY q.sort_order DESC, q.question_id
    """)
    abstract suspend fun conceptSummariesForTopic(topicId: String): List<QuestionConceptSummaryDb>

    @Query("SELECT question_type_id FROM type_cq_questions WHERE question_id = :questionId LIMIT 1")
    abstract suspend fun questionTypeOf(questionId: String): String?

    @Query("SELECT COALESCE(MAX(fts_id), 0) FROM type_cq_questions")
    abstract suspend fun maxFtsId(): Long

    @Query("SELECT COALESCE(MAX(sort_order), 0) FROM type_cq_questions WHERE topic_id = :topicId")
    abstract suspend fun maxSortOrder(topicId: String): Long

    @Query("SELECT COALESCE(MIN(sort_order), 0) FROM type_cq_questions WHERE topic_id = :topicId")
    abstract suspend fun minSortOrder(topicId: String): Long

    @Query("SELECT COUNT(*) FROM type_cq_stimuli WHERE stimulus_id = :stimulusId AND topic_id = :topicId")
    abstract suspend fun countStimulus(stimulusId: String, topicId: String): Int

    @Query("SELECT COUNT(*) FROM type_cq_questions WHERE question_id IN (:ids) AND topic_id = :topicId")
    abstract suspend fun countQuestionsIn(ids: List<String>, topicId: String): Int

    @Query("SELECT COUNT(*) FROM type_cq_questions WHERE question_id IN (:ids) AND topic_id = :topicId AND stimulus_id IS :stimulusId")
    abstract suspend fun countQuestionsInGroup(ids: List<String>, topicId: String, stimulusId: String?): Int

    @Query("SELECT COUNT(*) FROM type_cq_questions WHERE topic_id = :topicId AND stimulus_id IS :stimulusId")
    abstract suspend fun countQuestionsInTargetGroup(topicId: String, stimulusId: String?): Int

    @Query("SELECT COUNT(*) FROM type_cq_questions WHERE question_id IN (:ids)")
    abstract suspend fun countQuestionIds(ids: List<String>): Int

    @Query("DELETE FROM type_cq_questions WHERE question_id IN (:ids) AND topic_id = :topicId AND stimulus_id IS :stimulusId")
    abstract suspend fun deleteQuestionsInGroup(ids: List<String>, topicId: String, stimulusId: String?): Int

    @Query("DELETE FROM type_cq_stimuli WHERE stimulus_id = :stimulusId AND topic_id = :topicId AND NOT EXISTS (SELECT 1 FROM type_cq_questions WHERE stimulus_id = :stimulusId)")
    abstract suspend fun deleteStimulusIfUnused(stimulusId: String, topicId: String): Int


    @Query("SELECT DISTINCT stimulus_id FROM type_cq_questions WHERE question_id IN (:ids) AND topic_id = :topicId AND stimulus_id IS NOT NULL")
    abstract suspend fun stimulusIdsForQuestions(ids: List<String>, topicId: String): List<String>

    @Query("DELETE FROM type_cq_questions WHERE question_id IN (:ids) AND topic_id = :topicId")
    abstract suspend fun deleteQuestionRowsByIds(ids: List<String>, topicId: String): Int

    @Query("UPDATE type_cq_questions SET topic_id = :targetTopicId, sort_order = :sortOrder, updated_at = :now WHERE question_id = :questionId AND topic_id = :sourceTopicId")
    abstract suspend fun moveQuestionToTopic(questionId: String, sourceTopicId: String, targetTopicId: String, sortOrder: Long, now: Long): Int

    /** Temporarily detach a question while moving its stimulus + group across topics; DB triggers enforce matching topics. */
    @Query("UPDATE type_cq_questions SET stimulus_id = NULL, topic_id = :targetTopicId, sort_order = :sortOrder, updated_at = :now WHERE question_id = :questionId AND topic_id = :sourceTopicId AND stimulus_id = :stimulusId")
    abstract suspend fun detachQuestionForMove(questionId: String, sourceTopicId: String, targetTopicId: String, stimulusId: String, sortOrder: Long, now: Long): Int

    @Query("UPDATE type_cq_questions SET stimulus_id = :stimulusId, updated_at = :now WHERE question_id = :questionId AND topic_id = :targetTopicId AND stimulus_id IS NULL")
    abstract suspend fun attachQuestionAfterMove(questionId: String, targetTopicId: String, stimulusId: String, now: Long): Int

    @Query("UPDATE type_cq_stimuli SET topic_id = :targetTopicId, updated_at = :now WHERE stimulus_id = :stimulusId AND topic_id = :sourceTopicId")
    abstract suspend fun moveStimulusToTopic(stimulusId: String, sourceTopicId: String, targetTopicId: String, now: Long): Int

    /** Deletes all selected complete card contents atomically. */
    @Transaction
    open suspend fun deleteQuestionGroups(topicId: String, questionIds: List<String>): Boolean {
        if (topicId.isBlank() || questionIds.isEmpty() || questionIds.any(String::isBlank) || questionIds.distinct().size != questionIds.size) return false
        if (countQuestionsIn(questionIds, topicId) != questionIds.size) return false
        val stimulusIds = stimulusIdsForQuestions(questionIds, topicId).distinct()
        val deleted = deleteQuestionRowsByIds(questionIds, topicId)
        if (deleted != questionIds.size || countQuestionIds(questionIds) != 0) error("Bulk question delete read-back failed")
        stimulusIds.forEach { deleteStimulusIfUnused(it, topicId) }
        return true
    }

    /**
     * CUT moves complete cards without changing question/stimulus IDs. Paper references therefore remain linked.
     * New order values are placed after all existing cards (the list is sorted by sort_order DESC).
     */
    @Transaction
    open suspend fun moveQuestionGroups(
        sourceTopicId: String,
        targetTopicId: String,
        groups: List<MoveQuestionGroupDb>,
        now: Long,
    ): Boolean {
        if (sourceTopicId.isBlank() || targetTopicId.isBlank() || groups.isEmpty()) return false
        if (countTopic(sourceTopicId) == 0 || countTopic(targetTopicId) == 0) return false
        val allIds = groups.flatMap { it.questionIds }
        if (allIds.isEmpty() || allIds.any(String::isBlank) || allIds.distinct().size != allIds.size) return false
        if (groups.any { it.questionIds.isEmpty() || it.questionIds.distinct().size != it.questionIds.size }) return false
        if (countQuestionsIn(allIds, sourceTopicId) != allIds.size) return false
        for (group in groups) {
            if (group.stimulusId == null) {
                if (group.questionIds.size != 1 || countQuestionsInGroup(group.questionIds, sourceTopicId, null) != 1) return false
            } else {
                if (countQuestionsInGroup(group.questionIds, sourceTopicId, group.stimulusId) != group.questionIds.size) return false
                if (countQuestionsInTargetGroup(sourceTopicId, group.stimulusId) != group.questionIds.size) return false
                if (countStimulus(group.stimulusId, sourceTopicId) != 1) return false
            }
        }
        var nextOrder = minSortOrder(targetTopicId)
        for (group in groups) {
            if (sourceTopicId != targetTopicId && group.stimulusId != null) {
                // The schema requires every question.topic_id to match its parent stimulus.topic_id.
                // Detach each child inside this transaction, move the stimulus, then restore the links.
                for (questionId in group.questionIds) {
                    nextOrder -= 1
                    check(detachQuestionForMove(questionId, sourceTopicId, targetTopicId, group.stimulusId, nextOrder, now) == 1) {
                        "question detach failed during group move"
                    }
                }
                check(moveStimulusToTopic(group.stimulusId, sourceTopicId, targetTopicId, now) == 1) { "stimulus move failed" }
                group.questionIds.forEach { questionId ->
                    check(attachQuestionAfterMove(questionId, targetTopicId, group.stimulusId, now) == 1) {
                        "question reattach failed during group move"
                    }
                }
            } else {
                for (questionId in group.questionIds) {
                    nextOrder -= 1
                    check(moveQuestionToTopic(questionId, sourceTopicId, targetTopicId, nextOrder, now) == 1) { "question move failed" }
                }
            }
        }
        if (countQuestionsIn(allIds, targetTopicId) != allIds.size) error("Moved question read-back failed")
        for (group in groups) {
            if (group.stimulusId != null && countStimulus(group.stimulusId, targetTopicId) != 1) error("Moved stimulus read-back failed")
        }
        return true
    }

    @Query("SELECT COUNT(*) FROM type_cq_questions WHERE topic_id = :topicId")
    abstract suspend fun countQuestionsInTopic(topicId: String): Int

    @Query("UPDATE type_cq_questions SET sort_order = :sortOrder WHERE question_id = :questionId AND topic_id = :topicId")
    abstract suspend fun setQuestionSortOrder(topicId: String, questionId: String, sortOrder: Long): Int

    /** Re-indexes all complete cards in the supplied order. Each card's sub-questions remain contiguous. */
    @Transaction
    open suspend fun reorderQuestionGroups(topicId: String, orderedGroups: List<MoveQuestionGroupDb>): Boolean {
        if (topicId.isBlank() || orderedGroups.isEmpty()) return false
        if (countTopic(topicId) == 0) return false
        if (orderedGroups.any { it.questionIds.isEmpty() || it.questionIds.distinct().size != it.questionIds.size }) return false
        val ids = orderedGroups.flatMap { it.questionIds }
        if (ids.any(String::isBlank) || ids.distinct().size != ids.size) return false
        if (countQuestionsIn(ids, topicId) != ids.size || countQuestionsInTopic(topicId) != ids.size) return false
        for (group in orderedGroups) {
            if (group.stimulusId == null) {
                if (group.questionIds.size != 1 || countQuestionsInGroup(group.questionIds, topicId, null) != 1) return false
            } else {
                if (countQuestionsInGroup(group.questionIds, topicId, group.stimulusId) != group.questionIds.size) return false
                if (countQuestionsInTargetGroup(topicId, group.stimulusId) != group.questionIds.size) return false
                if (countStimulus(group.stimulusId, topicId) != 1) return false
            }
        }
        for ((groupIndex, group) in orderedGroups.withIndex()) {
            val base = (orderedGroups.size - groupIndex).toLong() * 10L
            // List comes from the loaded group order (ક, খ, গ, ঘ); descending sort_order preserves it.
            group.questionIds.forEachIndexed { questionIndex, questionId ->
                val sortOrder = base + (group.questionIds.size - questionIndex).toLong()
                check(setQuestionSortOrder(topicId, questionId, sortOrder) == 1) { "question group ordering failed" }
            }
        }
        return true
    }

    /** Card-level delete: all question rows and their cascade-owned children are removed atomically. */
    @Transaction
    open suspend fun deleteGroup(topicId: String, stimulusId: String?, questionIds: List<String>): Boolean {
        if (topicId.isBlank() || questionIds.isEmpty() || questionIds.distinct().size != questionIds.size) return false
        if (countQuestionsInGroup(questionIds, topicId, stimulusId) != questionIds.size) return false
        val deleted = deleteQuestionsInGroup(questionIds, topicId, stimulusId)
        if (deleted != questionIds.size || countQuestionIds(questionIds) != 0) error("Question group delete read-back failed")
        if (stimulusId != null) deleteStimulusIfUnused(stimulusId, topicId)
        return true
    }

    @Query("SELECT COALESCE(MAX(sort_order), 0) FROM type_cq_questions WHERE stimulus_id = :stimulusId")
    abstract suspend fun maxSortOrderOfStimulus(stimulusId: String): Long

    @Query("UPDATE type_cq_stimuli SET stimulus_text = :text, updated_at = :now WHERE stimulus_id = :stimulusId")
    abstract suspend fun updateStimulusText(stimulusId: String, text: String, now: Long): Int

    @Query("UPDATE type_cq_stimuli SET reference_text = :text, updated_at = :now WHERE stimulus_id = :stimulusId")
    abstract suspend fun updateStimulusReference(stimulusId: String, text: String, now: Long): Int

    @Query("UPDATE type_cq_questions SET question_type_id = :typeId, marks = :marks, updated_at = :now WHERE question_id = :questionId")
    abstract suspend fun updateQuestionMetadata(questionId: String, typeId: String, marks: Double, now: Long): Int

    @Query("SELECT * FROM type_cq_solution_parts WHERE question_id = :questionId ORDER BY position, part_id")
    abstract suspend fun solutionParts(questionId: String): List<TypeCqSolutionPartsEntity>

    /** Diagnostic only (activity log): which question already owns this solution part id. */
    @Query("SELECT question_id FROM type_cq_solution_parts WHERE part_id = :partId LIMIT 1")
    abstract suspend fun ownerOfPart(partId: String): String?

    @Query("""
        SELECT c.question_id FROM type_cq_concept_parts p
        JOIN type_cq_concepts c ON c.concept_id = p.concept_id
        WHERE p.part_id = :partId LIMIT 1
    """)
    abstract suspend fun ownerOfConceptPart(partId: String): String?

    @Query("""
        SELECT DISTINCT pq.type_cq_question_id AS question_id, p.paper_id AS paper_id,
               p.short_name AS short_name, p.title AS title, pc.name AS category_name
        FROM paper_question_items pq
        JOIN papers p ON p.paper_id=pq.paper_id
        JOIN paper_categories pc ON pc.paper_category_id=p.paper_category_id
        WHERE pq.type_cq_question_id IN (:ids)
        ORDER BY pq.created_at DESC, p.updated_at DESC, p.paper_id DESC
    """)
    abstract suspend fun paperUsagesForQuestions(ids: List<String>): List<QuestionPaperUsageDb>

    @Query("SELECT * FROM type_cq_solution_parts WHERE question_id IN (:ids) ORDER BY question_id, position, part_id")
    abstract suspend fun solutionPartsIn(ids: List<String>): List<TypeCqSolutionPartsEntity>

    @Query("SELECT * FROM type_cq_stimulus_images WHERE stimulus_id = :stimulusId ORDER BY position, image_id")
    abstract suspend fun stimulusImagesFor(stimulusId: String): List<TypeCqStimulusImagesEntity>

    @Query("SELECT * FROM type_cq_stimulus_images WHERE stimulus_id IN (:stimulusIds) ORDER BY stimulus_id, position, image_id")
    abstract suspend fun stimulusImagesForAll(stimulusIds: List<String>): List<TypeCqStimulusImagesEntity>

    @Query("SELECT COUNT(*) FROM type_cq_images WHERE image_id = :imageId")
    abstract suspend fun imageExistsForQuestion(imageId: String): Int

    @Insert
    abstract suspend fun insertStimulusImageLink(row: TypeCqStimulusImagesEntity)

    @Query("DELETE FROM type_cq_stimulus_images WHERE stimulus_id = :stimulusId")
    abstract suspend fun clearStimulusImages(stimulusId: String)

    @Query("DELETE FROM type_cq_solution_parts WHERE question_id = :questionId")
    abstract suspend fun deleteSolutionParts(questionId: String)

    @Insert
    abstract suspend fun insertSolutionPart(row: TypeCqSolutionPartsEntity)

    /**
     * part_id is a table-wide PRIMARY KEY, but the editors build ids that are only unique per draft. If another question
     * already owns [wanted] (callers delete the question's own parts first), store the part under a fresh id instead of
     * failing the whole save with "UNIQUE constraint failed: type_cq_solution_parts.part_id". Content is unchanged.
     */
    private suspend fun safePartId(wanted: String): String {
        if (ownerOfPart(wanted) == null) return wanted
        val fresh = UUID.randomUUID().toString()
        com.questionbank.app.ActivityLog.event("DB-FIX", "part_id $wanted already belongs to another question; stored as $fresh")
        return fresh
    }

    /** Concept part ids are table-wide too; validate against the Concept table, not the Solution table. */
    private suspend fun safeConceptPartId(wanted: String): String {
        if (ownerOfConceptPart(wanted) == null) return wanted
        val fresh = UUID.randomUUID().toString()
        com.questionbank.app.ActivityLog.event("DB-FIX", "concept part_id $wanted already exists; stored as $fresh")
        return fresh
    }

    // Called only from updateGroup(), whose enclosing Room transaction owns this write.
    private suspend fun replaceTextSolutionPartsWithinUpdate(questionId: String, texts: List<String>, now: Long) {
        val existing = solutionParts(questionId).sortedWith(compareBy<TypeCqSolutionPartsEntity> { it.position }.thenBy { it.partId })
        val cleanTexts = texts.map { it.trim() }.filter { it.isNotEmpty() }
        var textIndex = 0
        val maxOldPosition = existing.maxOfOrNull { it.position } ?: -1L
        val retained = existing.mapNotNull { part ->
            if (part.partType == "TEXT") {
                val value = cleanTexts.getOrNull(textIndex++)
                value?.let { TypeCqSolutionPartsEntity(UUID.randomUUID().toString(), questionId, part.position, "TEXT", it, null, now) }
            } else {
                // A text-only edit must not move or otherwise rewrite a pre-existing image/media part.
                part
            }
        }
        val appended = cleanTexts.drop(textIndex).mapIndexed { index, value ->
            TypeCqSolutionPartsEntity(UUID.randomUUID().toString(), questionId, maxOldPosition + index + 1L, "TEXT", value, null, now)
        }
        deleteSolutionParts(questionId)
        (retained + appended).sortedBy { it.position }.forEach { insertSolutionPart(it) }
        val storedNonText = solutionParts(questionId).filter { it.partType != "TEXT" }
        check(storedNonText == existing.filter { it.partType != "TEXT" }) {
            "Non-text solution parts changed during text-only edit"
        }
    }

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

    @Query("SELECT question_id, question_text, short_answer, rating, question_type_id, marks FROM type_cq_questions WHERE question_id IN (:ids)")
    abstract suspend fun readBack(ids: List<String>): List<StoredTextDb>

    @Query("SELECT stimulus_text FROM type_cq_stimuli WHERE stimulus_id = :stimulusId")
    abstract suspend fun readStimulusText(stimulusId: String): String?

    @Query("SELECT reference_text FROM type_cq_stimuli WHERE stimulus_id = :stimulusId")
    abstract suspend fun readStimulusReference(stimulusId: String): String?

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
        referenceText: String,
        stimulusRating: Int?,
        stimulusTags: List<NewTagRow>,
        items: List<NewQuestionRow>,
        now: Long,
        draftKey: String,
        editorDraftKey: String? = null,
        stimulusImageRows: List<NewStimulusImageRow> = emptyList(),
    ): Boolean {
        if (topicId.isBlank() || countTopic(topicId) == 0) return false
        if (items.map { it.label }.distinct().size != items.size) return false
        if (items.any { activeQuestionTypeExists(it.typeId) == 0 }) return false
        if (items.any { item -> item.categoryIds.any(String::isBlank) || item.categoryIds.distinct().size != item.categoryIds.size || item.categoryIds.any { activeCategory(it) == 0 } }) return false
        if (stimulusId == null && stimulusImageRows.isNotEmpty()) return false
        if (stimulusImageRows.any { it.imageId.isBlank() || it.placement !in setOf("TOP", "BOTTOM") || imageExistsForQuestion(it.imageId) == 0 }) return false
        if (items.any { item -> item.orderedSolutionParts.any { part ->
                part.partType !in setOf("TEXT", "IMAGE") ||
                    (part.partType == "TEXT" && (part.textContent == null || part.imageId != null)) ||
                    (part.partType == "IMAGE" && (part.imageId.isNullOrBlank() || part.textContent != null || (part.imageId?.let { imageExistsForQuestion(it) } ?: 0) == 0))
            } }) return false
        if (items.any { item -> item.conceptParts.any { part ->
                part.partType !in setOf("TEXT", "IMAGE") ||
                    (part.partType == "TEXT" && (part.textContent == null || part.imageId != null)) ||
                    (part.partType == "IMAGE" && (part.imageId.isNullOrBlank() || part.textContent != null || (part.imageId?.let { imageExistsForQuestion(it) } ?: 0) == 0))
            } }) return false
        if (stimulusId != null) {
            insertStimulus(TypeCqStimuliEntity(stimulusId, topicId, stimulusText, stimulusRating?.toLong(), referenceText, now, now))
            writeStimulusTags(stimulusId, stimulusTags)
            stimulusImageRows.sortedWith(compareBy<NewStimulusImageRow> { it.position }.thenBy { it.imageId }).forEachIndexed { index, row ->
                insertStimulusImageLink(TypeCqStimulusImagesEntity(stimulusId, row.imageId, index.toLong(), row.placement))
            }
        }
        val ids = FtsIdAllocator(maxFtsId())
        var order = minSortOrder(topicId)
        for (item in items) {
            order -= 1
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
            item.categoryIds.forEach { categoryId -> insertCategoryLink(TypeCqQuestionCategoryLinksEntity(item.id, categoryId, now)) }
            if (item.orderedSolutionParts.isNotEmpty()) {
                item.orderedSolutionParts.sortedWith(compareBy<NewSolutionPartRow> { it.position }.thenBy { it.partId }).forEach { part ->
                    insertSolutionPart(TypeCqSolutionPartsEntity(safePartId(part.partId), item.id, part.position, part.partType, part.textContent, part.imageId, now))
                }
            } else {
                item.solutionParts.forEachIndexed { index, text -> insertSolutionPart(TypeCqSolutionPartsEntity(UUID.randomUUID().toString(), item.id, index.toLong(), "TEXT", text, null, now)) }
            }
            if (item.conceptParts.isNotEmpty()) {
                val conceptId = "concept_${UUID.randomUUID()}"
                insertConcept(TypeCqConceptsEntity(conceptId, item.id, now, now))
                item.conceptParts.sortedBy { it.position }.forEachIndexed { index, part ->
                    insertConceptPart(TypeCqConceptPartsEntity(safeConceptPartId(part.partId), conceptId, index.toLong(), part.partType, part.textContent, part.imageId, now))
                }
            }
        }
        val storedRows = readBack(items.map { it.id }).associateBy { it.questionId }
        val questionsMatch = items.all { item ->
            val stored = storedRows[item.id]
            stored != null && stored.questionText == item.text && stored.shortAnswer == item.answer &&
                stored.rating == item.rating && stored.questionTypeId == item.typeId && stored.marks == item.marks
        }
        val solutionsMatch = items.all { item ->
            val stored = solutionParts(item.id).sortedWith(compareBy<TypeCqSolutionPartsEntity> { it.position }.thenBy { it.partId })
            if (item.orderedSolutionParts.isNotEmpty()) {
                stored.map { Triple(it.partType, it.textContent, it.imageId) } == item.orderedSolutionParts.sortedBy { it.position }.map { Triple(it.partType, it.textContent, it.imageId) }
            } else stored.filter { it.partType == "TEXT" }.mapNotNull { it.textContent } == item.solutionParts
        }
        val conceptsMatch = items.all { item ->
            val concept = conceptForQuestion(item.id)
            val stored = concept?.let { conceptPartsFor(it.conceptId) }.orEmpty()
            val expected = item.conceptParts.sortedBy { it.position }
            stored.size == expected.size && stored.map { Triple(it.partType, it.textContent, it.imageId) } ==
                expected.map { Triple(it.partType, it.textContent, it.imageId) }
        }
        val stimulusMatch = stimulusId == null || (
            readStimulusText(stimulusId) == stimulusText && readStimulusReference(stimulusId) == referenceText &&
                readStimulusRating(stimulusId) == stimulusRating
            )
        val boardsMatch = boardTagsMatch(
            if (stimulusId != null) stimulusId to stimulusTags else null,
            items.associate { it.id to it.tags },
        )
        val categoriesByQuestion = categoryLinksIn(items.map { it.id }).groupBy({ it.questionId }, { it.categoryId })
        val categoriesMatch = items.all { item -> categoriesByQuestion[item.id].orEmpty().toSet() == item.categoryIds.toSet() }
        val stimulusImagesMatch = stimulusId == null || stimulusImagesFor(stimulusId).map { Triple(it.imageId, it.placement, it.position) } ==
            stimulusImageRows.sortedWith(compareBy<NewStimulusImageRow> { it.position }.thenBy { it.imageId }).mapIndexed { index, it -> Triple(it.imageId, it.placement, index.toLong()) }
        check(questionsMatch && solutionsMatch && conceptsMatch && stimulusMatch && boardsMatch && categoriesMatch && stimulusImagesMatch) {
            "Type_CQ insert read-back mismatch; transaction rolled back"
        }
        deleteMeta(draftKey)
        editorDraftKey?.let { deleteMeta(it) }
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
        newReferenceText: String?,
        updates: List<QuestionTextUpdate>,
        metadataUpdates: List<QuestionMetadataUpdate>,
        solutionUpdates: List<QuestionSolutionUpdate>,
        adds: List<NewQuestionRow>,
        now: Long,
        draftKey: String,
        changeStimulusRating: Boolean,
        newStimulusRating: Int?,
        ratingUpdates: List<QuestionRatingDb>,
        changeStimulusBoards: Boolean,
        newStimulusBoards: List<NewTagRow>,
        boardUpdates: List<QuestionBoardsDb>,
        deletes: List<String> = emptyList(),
        categoryUpdates: List<QuestionCategoriesDb> = emptyList(),
        editorDraftKey: String? = null,
        solutionPartUpdates: List<QuestionSolutionPartsDb> = emptyList(),
        stimulusImageReplacement: List<NewStimulusImageRow>? = null,
    ): Boolean {
        if (topicId.isBlank() || countTopic(topicId) == 0) return false
        if (stimulusId != null && countStimulus(stimulusId, topicId) == 0) return false
        if (stimulusId == null && deletes.isNotEmpty()) return false
        if (deletes.distinct().size != deletes.size || deletes.any(String::isBlank)) return false
        val editedIds = (updates.map { it.questionId } + metadataUpdates.map { it.questionId } + solutionUpdates.map { it.questionId } +
            solutionPartUpdates.map { it.questionId } + ratingUpdates.map { it.questionId } + boardUpdates.map { it.questionId } + categoryUpdates.map { it.questionId }).toSet()
        if (deletes.any { it in editedIds }) return false
        val affectedIds = (editedIds + deletes).toList()
        if (affectedIds.isNotEmpty() && countQuestionsInGroup(affectedIds, topicId, stimulusId) != affectedIds.size) return false
        if (deletes.isNotEmpty() && countQuestionsInTargetGroup(topicId, stimulusId) - deletes.size + adds.size <= 0) return false
        if (updates.isNotEmpty() && countQuestionsInGroup(updates.map { it.questionId }, topicId, stimulusId) != updates.size) return false
        if (metadataUpdates.isNotEmpty() && countQuestionsInGroup(metadataUpdates.map { it.questionId }, topicId, stimulusId) != metadataUpdates.size) return false
        if (metadataUpdates.any { activeQuestionTypeExists(it.typeId) == 0 && questionTypeOf(it.questionId) != it.typeId }) return false
        if (solutionUpdates.isNotEmpty() && countQuestionsInGroup(solutionUpdates.map { it.questionId }, topicId, stimulusId) != solutionUpdates.size) return false
        if (solutionPartUpdates.isNotEmpty() && countQuestionsInGroup(solutionPartUpdates.map { it.questionId }, topicId, stimulusId) != solutionPartUpdates.size) return false
        if (solutionPartUpdates.map { it.questionId }.distinct().size != solutionPartUpdates.size) return false
        if (solutionPartUpdates.any { update -> update.parts.map { it.partId }.distinct().size != update.parts.size || update.parts.any { part ->
                part.partType !in setOf("TEXT", "IMAGE") ||
                    (part.partType == "TEXT" && (part.textContent == null || part.imageId != null)) ||
                    (part.partType == "IMAGE" && (part.imageId.isNullOrBlank() || part.textContent != null || (part.imageId?.let { imageExistsForQuestion(it) } ?: 0) == 0))
            } }) return false
        if (stimulusImageReplacement != null && (stimulusId == null || stimulusImageReplacement.any { row ->
                row.imageId.isBlank() || row.placement !in setOf("TOP", "BOTTOM") || imageExistsForQuestion(row.imageId) == 0
            })) return false
        if (ratingUpdates.isNotEmpty() && countQuestionsInGroup(ratingUpdates.map { it.questionId }, topicId, stimulusId) != ratingUpdates.size) return false
        if (changeStimulusRating && stimulusId == null) return false
        if (boardUpdates.isNotEmpty() && countQuestionsInGroup(boardUpdates.map { it.questionId }, topicId, stimulusId) != boardUpdates.size) return false
        if (categoryUpdates.isNotEmpty() && countQuestionsInGroup(categoryUpdates.map { it.questionId }, topicId, stimulusId) != categoryUpdates.size) return false
        if (adds.isNotEmpty() && stimulusId == null) return false
        if (adds.any { activeQuestionTypeExists(it.typeId) == 0 }) return false
        if (adds.any { item -> item.categoryIds.any(String::isBlank) || item.categoryIds.distinct().size != item.categoryIds.size || item.categoryIds.any { activeCategory(it) == 0 } }) return false
        if (adds.any { item -> item.orderedSolutionParts.map { it.partId }.distinct().size != item.orderedSolutionParts.size || item.orderedSolutionParts.any { part ->
                part.partType !in setOf("TEXT", "IMAGE") ||
                    (part.partType == "TEXT" && (part.textContent == null || part.imageId != null)) ||
                    (part.partType == "IMAGE" && (part.imageId.isNullOrBlank() || part.textContent != null || (part.imageId?.let { imageExistsForQuestion(it) } ?: 0) == 0))
            } }) return false
        if (adds.any { item -> item.conceptParts.map { it.partId }.distinct().size != item.conceptParts.size || item.conceptParts.any { part ->
                part.partType !in setOf("TEXT", "IMAGE") ||
                    (part.partType == "TEXT" && (part.textContent == null || part.imageId != null)) ||
                    (part.partType == "IMAGE" && (part.imageId.isNullOrBlank() || part.textContent != null || (part.imageId?.let { imageExistsForQuestion(it) } ?: 0) == 0))
            } }) return false
        if (categoryUpdates.any { update -> update.categoryIds.any(String::isBlank) || update.categoryIds.distinct().size != update.categoryIds.size }) return false
        if (categoryUpdates.any { update -> update.categoryIds.any { activeCategory(it) == 0 && categoryAlreadyLinked(update.questionId, it) == 0 } }) return false
        if (changeStimulusBoards && stimulusId == null) return false
        if (newStimulusText != null) {
            val sid = checkNotNull(stimulusId) { "stimulus text given for a group without a stimulus" }
            check(updateStimulusText(sid, newStimulusText, now) == 1) { "stimulus row was not updated" }
        }
        if (newReferenceText != null) {
            val sid = checkNotNull(stimulusId) { "reference text given for a group without a stimulus" }
            check(updateStimulusReference(sid, newReferenceText, now) == 1) { "stimulus reference was not updated" }
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
        for (m in metadataUpdates) {
            require(m.marks.isFinite() && m.marks > 0.0) { "marks out of range" }
            check(updateQuestionMetadata(m.questionId, m.typeId, m.marks, now) == 1) { "question metadata was not updated" }
        }
        for (u in solutionUpdates) {
            replaceTextSolutionPartsWithinUpdate(u.questionId, u.parts, now)
            check(touchQuestion(u.questionId, now) == 1) { "question solution was not updated" }
        }
        for (u in solutionPartUpdates) {
            deleteSolutionParts(u.questionId)
            u.parts.sortedWith(compareBy<NewSolutionPartRow> { it.position }.thenBy { it.partId }).forEach { part ->
                insertSolutionPart(TypeCqSolutionPartsEntity(safePartId(part.partId), u.questionId, part.position, part.partType, part.textContent, part.imageId, now))
            }
            check(touchQuestion(u.questionId, now) == 1) { "question mixed solution was not updated" }
        }
        if (stimulusImageReplacement != null) {
            val sid = checkNotNull(stimulusId) { "stimulus images supplied for a group without a stimulus" }
            clearStimulusImages(sid)
            stimulusImageReplacement.sortedWith(compareBy<NewStimulusImageRow> { it.position }.thenBy { it.imageId }).forEachIndexed { index, row ->
                insertStimulusImageLink(TypeCqStimulusImagesEntity(sid, row.imageId, index.toLong(), row.placement))
            }
            check(touchStimulus(sid, now) == 1) { "stimulus images were not attached" }
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
        for (categoryUpdate in categoryUpdates) {
            deleteQuestionCategories(categoryUpdate.questionId)
            categoryUpdate.categoryIds.sorted().forEach { categoryId ->
                insertCategoryLink(TypeCqQuestionCategoryLinksEntity(categoryUpdate.questionId, categoryId, now))
            }
            check(touchQuestion(categoryUpdate.questionId, now) == 1) { "question categories were not updated" }
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
                item.categoryIds.forEach { categoryId -> insertCategoryLink(TypeCqQuestionCategoryLinksEntity(item.id, categoryId, now)) }
                if (item.orderedSolutionParts.isNotEmpty()) {
                    item.orderedSolutionParts.sortedWith(compareBy<NewSolutionPartRow> { it.position }.thenBy { it.partId }).forEach { part ->
                        insertSolutionPart(TypeCqSolutionPartsEntity(safePartId(part.partId), item.id, part.position, part.partType, part.textContent, part.imageId, now))
                    }
                } else {
                    item.solutionParts.forEachIndexed { index, text -> insertSolutionPart(TypeCqSolutionPartsEntity(UUID.randomUUID().toString(), item.id, index.toLong(), "TEXT", text, null, now)) }
                }
                if (item.conceptParts.isNotEmpty()) {
                    val conceptId = "concept_${UUID.randomUUID()}"
                    insertConcept(TypeCqConceptsEntity(conceptId, item.id, now, now))
                    item.conceptParts.sortedBy { it.position }.forEachIndexed { index, part ->
                        insertConceptPart(TypeCqConceptPartsEntity(safeConceptPartId(part.partId), conceptId, index.toLong(), part.partType, part.textContent, part.imageId, now))
                    }
                }
            }
        }
        if (deletes.isNotEmpty()) {
            check(deleteQuestionsInGroup(deletes, topicId, stimulusId) == deletes.size) { "explicit question deletion failed" }
            check(countQuestionIds(deletes) == 0) { "deleted question is still present" }
        }
        val checkedIds = (updates.map { it.questionId } + metadataUpdates.map { it.questionId } +
            solutionUpdates.map { it.questionId } + solutionPartUpdates.map { it.questionId } + ratingUpdates.map { it.questionId } + categoryUpdates.map { it.questionId } + adds.map { it.id }).distinct()
        val storedRows = if (checkedIds.isEmpty()) emptyMap() else readBack(checkedIds).associateBy { it.questionId }
        val textMatches = updates.all { update ->
            val stored = storedRows[update.questionId]
            stored != null && stored.questionText == update.text && stored.shortAnswer == update.answer
        }
        val metadataMatches = metadataUpdates.all { update ->
            val stored = storedRows[update.questionId]
            stored != null && stored.questionTypeId == update.typeId && stored.marks == update.marks
        }
        val ratingsMatch = ratingUpdates.all { update -> storedRows[update.questionId]?.rating == update.rating }
        val addedRowsMatch = adds.all { item ->
            val stored = storedRows[item.id]
            stored != null && stored.questionText == item.text && stored.shortAnswer == item.answer &&
                stored.rating == item.rating && stored.questionTypeId == item.typeId && stored.marks == item.marks
        }
        val solutionsMatch = solutionUpdates.all { update ->
            solutionParts(update.questionId).filter { it.partType == "TEXT" }.mapNotNull { it.textContent } == update.parts
        } && solutionPartUpdates.all { update ->
            solutionParts(update.questionId).sortedBy { it.position }.map { Triple(it.partType, it.textContent, it.imageId) } ==
                update.parts.sortedBy { it.position }.map { Triple(it.partType, it.textContent, it.imageId) }
        } && adds.all { item ->
            val stored = solutionParts(item.id).sortedBy { it.position }
            if (item.orderedSolutionParts.isNotEmpty()) stored.map { Triple(it.partType, it.textContent, it.imageId) } ==
                item.orderedSolutionParts.sortedBy { it.position }.map { Triple(it.partType, it.textContent, it.imageId) }
            else stored.filter { it.partType == "TEXT" }.mapNotNull { it.textContent } == item.solutionParts
        }
        val conceptsMatch = adds.all { item ->
            val concept = conceptForQuestion(item.id)
            val stored = concept?.let { conceptPartsFor(it.conceptId) }.orEmpty()
            val expected = item.conceptParts.sortedBy { it.position }
            stored.size == expected.size && stored.map { Triple(it.partType, it.textContent, it.imageId) } ==
                expected.map { Triple(it.partType, it.textContent, it.imageId) }
        }
        val stimulusMatch = stimulusId == null || (
            (newStimulusText == null || readStimulusText(stimulusId) == newStimulusText) &&
                (newReferenceText == null || readStimulusReference(stimulusId) == newReferenceText) &&
                (!changeStimulusRating || readStimulusRating(stimulusId) == newStimulusRating)
            )
        val categoryRows = if (checkedIds.isEmpty()) emptyList() else categoryLinksIn(checkedIds)
        val storedCategories = categoryRows.groupBy({ it.questionId }, { it.categoryId })
        val categoriesMatch = categoryUpdates.all { storedCategories[it.questionId].orEmpty().toSet() == it.categoryIds.toSet() } &&
            adds.all { storedCategories[it.id].orEmpty().toSet() == it.categoryIds.toSet() }
        val wantedQuestionBoards = boardUpdates.associate { it.questionId to it.tags } + adds.associate { it.id to it.tags }
        val boardsMatch = boardTagsMatch(
            if (changeStimulusBoards && stimulusId != null) stimulusId to newStimulusBoards else null,
            wantedQuestionBoards,
        )
        val stimulusImagesMatch = stimulusImageReplacement == null || stimulusId?.let { sid ->
            stimulusImagesFor(sid).map { Triple(it.imageId, it.placement, it.position) } == stimulusImageReplacement
                .sortedWith(compareBy<NewStimulusImageRow> { it.position }.thenBy { it.imageId })
                .mapIndexed { index, it -> Triple(it.imageId, it.placement, index.toLong()) }
        } == true
        check(textMatches && metadataMatches && ratingsMatch && addedRowsMatch && solutionsMatch && conceptsMatch && stimulusMatch && boardsMatch && categoriesMatch && stimulusImagesMatch) {
            "Type_CQ update read-back mismatch; transaction rolled back"
        }
        // Draft deletion occurs only after every read-back check passed, in the same transaction.
        deleteMeta(draftKey)
        editorDraftKey?.let { deleteMeta(it) }
        return true
    }
}
