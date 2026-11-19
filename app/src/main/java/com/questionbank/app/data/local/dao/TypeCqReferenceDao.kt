package com.questionbank.app.data.local.dao

import androidx.room.Dao
import androidx.room.ColumnInfo
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import com.questionbank.app.data.local.entity.*
import kotlinx.coroutines.flow.Flow

data class TypeCqEditorProjectionDb(
    @ColumnInfo(name = "question_id") val questionId: String,
    @ColumnInfo(name = "topic_id") val topicId: String,
    @ColumnInfo(name = "question_type_id") val questionTypeId: String,
    @ColumnInfo(name = "stimulus_id") val stimulusId: String?,
    @ColumnInfo(name = "question_text") val questionText: String,
    @ColumnInfo(name = "short_answer") val shortAnswer: String,
    @ColumnInfo(name = "stimulus_text") val stimulusText: String?,
    @ColumnInfo(name = "reference_text") val referenceText: String?,
    @ColumnInfo(name = "marks") val marks: Double,
)

/** Type_CQ-only editor/reference operations. Topic and QuestionType are intentionally absent from Chapter_CQ DAOs. */
@Dao
abstract class TypeCqReferenceDao {
    @Query("SELECT * FROM type_cq_question_types WHERE is_active = 1 ORDER BY sort_order, label, question_type_id")
    abstract fun observeQuestionTypes(): Flow<List<TypeCqQuestionTypesEntity>>

    @Query("SELECT * FROM type_cq_question_types ORDER BY sort_order, label, question_type_id")
    abstract suspend fun questionTypes(): List<TypeCqQuestionTypesEntity>

    @Query("SELECT * FROM type_cq_question_types ORDER BY is_active DESC, sort_order, label, question_type_id")
    abstract fun observeAllQuestionTypes(): Flow<List<TypeCqQuestionTypesEntity>>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    abstract suspend fun insertQuestionType(row: TypeCqQuestionTypesEntity)
    @Query("SELECT COUNT(*) FROM type_cq_question_types WHERE code = :code")
    abstract suspend fun questionTypeCodeExists(code: String): Int
    @Query("UPDATE type_cq_question_types SET label = :label WHERE question_type_id = :id")
    abstract suspend fun renameQuestionType(id: String, label: String): Int
    @Query("UPDATE type_cq_question_types SET is_active = :active WHERE question_type_id = :id")
    abstract suspend fun setQuestionTypeActive(id: String, active: Long): Int

    @Query("SELECT * FROM type_cq_stimuli WHERE topic_id = :topicId ORDER BY created_at, stimulus_id")
    abstract fun observeStimuli(topicId: String): Flow<List<TypeCqStimuliEntity>>

    @Query("SELECT * FROM type_cq_questions WHERE topic_id = :topicId ORDER BY sort_order DESC, question_id")
    abstract fun observeQuestions(topicId: String): Flow<List<TypeCqQuestionsEntity>>

    @Query("SELECT q.question_id AS question_id, q.topic_id AS topic_id, q.question_type_id AS question_type_id, q.stimulus_id AS stimulus_id, q.question_text AS question_text, q.short_answer AS short_answer, s.stimulus_text AS stimulus_text, s.reference_text AS reference_text, q.marks AS marks FROM type_cq_questions q LEFT JOIN type_cq_stimuli s ON s.stimulus_id = q.stimulus_id WHERE q.question_id = :questionId LIMIT 1")
    abstract suspend fun editorProjection(questionId: String): TypeCqEditorProjectionDb?

    @Query("SELECT * FROM type_cq_questions WHERE question_id = :questionId LIMIT 1")
    abstract suspend fun question(questionId: String): TypeCqQuestionsEntity?

    @Query("SELECT * FROM type_cq_stimuli WHERE stimulus_id = :stimulusId LIMIT 1")
    abstract suspend fun stimulus(stimulusId: String): TypeCqStimuliEntity?

    @Query("SELECT COUNT(*) FROM type_cq_topics WHERE topic_id = :topicId")
    abstract suspend fun topicExists(topicId: String): Int

    @Query("SELECT COUNT(*) FROM type_cq_question_types WHERE question_type_id = :typeId AND is_active = 1")
    abstract suspend fun activeQuestionTypeExists(typeId: String): Int

    @Query("SELECT COUNT(*) FROM type_cq_questions WHERE topic_id = :topicId AND question_text = :text")
    abstract suspend fun countDuplicateQuestion(topicId: String, text: String): Int

    @Query("SELECT * FROM type_cq_solution_parts WHERE question_id = :questionId ORDER BY position, part_id")
    abstract suspend fun solutionParts(questionId: String): List<TypeCqSolutionPartsEntity>

    @Query("SELECT * FROM type_cq_question_categories ORDER BY is_archived, sort_order, name, category_id")
    abstract fun observeCategories(): Flow<List<TypeCqQuestionCategoriesEntity>>

    @Query("SELECT * FROM type_cq_question_boards WHERE question_id = :questionId ORDER BY sort_order, year, board_code")
    abstract suspend fun questionBoards(questionId: String): List<TypeCqQuestionBoardsEntity>

    @Query("SELECT * FROM type_cq_question_category_links WHERE question_id = :questionId ORDER BY assigned_at, category_id")
    abstract suspend fun questionCategories(questionId: String): List<TypeCqQuestionCategoryLinksEntity>

    @Query("SELECT * FROM type_cq_stimulus_images WHERE stimulus_id = :stimulusId ORDER BY position, image_id")
    abstract suspend fun stimulusImages(stimulusId: String): List<TypeCqStimulusImagesEntity>

    @Query("SELECT COUNT(*) FROM type_cq_stimuli WHERE stimulus_id = :stimulusId AND topic_id = :topicId")
    abstract suspend fun stimulusBelongsToTopic(stimulusId: String, topicId: String): Int

    @Query("SELECT COUNT(*) FROM board_catalog WHERE code = :code AND is_archived = 0")
    abstract suspend fun activeBoard(code: String): Int

    @Query("SELECT COUNT(*) FROM type_cq_question_categories WHERE category_id = :id AND is_archived = 0")
    abstract suspend fun activeCategory(id: String): Int

    @Query("SELECT COUNT(*) FROM type_cq_images WHERE image_id = :id")
    abstract suspend fun imageExists(id: String): Int

    @Insert(onConflict = OnConflictStrategy.ABORT) abstract suspend fun insertStimulus(row: TypeCqStimuliEntity)
    @Insert(onConflict = OnConflictStrategy.ABORT) abstract suspend fun insertSolutionPart(row: TypeCqSolutionPartsEntity)
    @Insert(onConflict = OnConflictStrategy.ABORT) abstract suspend fun insertQuestionBoard(row: TypeCqQuestionBoardsEntity)
    @Insert(onConflict = OnConflictStrategy.ABORT) abstract suspend fun insertCategoryLink(row: TypeCqQuestionCategoryLinksEntity)
    @Insert(onConflict = OnConflictStrategy.ABORT) abstract suspend fun insertStimulusImage(row: TypeCqStimulusImagesEntity)

    @Query("DELETE FROM type_cq_question_boards WHERE question_id = :questionId") abstract suspend fun clearQuestionBoards(questionId: String)
    @Query("DELETE FROM type_cq_question_category_links WHERE question_id = :questionId") abstract suspend fun clearQuestionCategories(questionId: String)
    @Query("DELETE FROM type_cq_solution_parts WHERE question_id = :questionId") abstract suspend fun clearSolutionParts(questionId: String)
    @Query("DELETE FROM type_cq_stimulus_images WHERE stimulus_id = :stimulusId") abstract suspend fun clearStimulusImages(stimulusId: String)

    @Transaction
    open suspend fun replaceQuestionBoards(questionId: String, rows: List<TypeCqQuestionBoardsEntity>) {
        require(question(questionId) != null) { "Type_CQ question does not exist" }
        require(rows.all { it.questionId == questionId }) { "Board rows must belong to the target Type_CQ question" }
        require(rows.all { activeBoard(it.boardCode) == 1 }) { "Archived or unknown board cannot be assigned" }
        clearQuestionBoards(questionId)
        rows.sortedWith(compareBy<TypeCqQuestionBoardsEntity> { it.sortOrder }.thenBy { it.year }.thenBy { it.boardCode })
            .forEach { insertQuestionBoard(it) }
    }

    @Transaction
    open suspend fun replaceQuestionCategories(questionId: String, rows: List<TypeCqQuestionCategoryLinksEntity>) {
        require(question(questionId) != null) { "Type_CQ question does not exist" }
        require(rows.all { it.questionId == questionId }) { "Category rows must belong to the target Type_CQ question" }
        require(rows.all { activeCategory(it.categoryId) == 1 }) { "Archived or unknown category cannot be assigned" }
        clearQuestionCategories(questionId)
        rows.sortedBy { it.categoryId }.forEach { insertCategoryLink(it) }
    }

    @Transaction
    open suspend fun replaceSolutionParts(questionId: String, rows: List<TypeCqSolutionPartsEntity>) {
        require(question(questionId) != null) { "Type_CQ question does not exist" }
        require(rows.all { it.questionId == questionId }) { "Solution parts must belong to the target Type_CQ question" }
        require(rows.all { it.imageId == null || imageExists(it.imageId) == 1 }) { "Solution image does not exist" }
        clearSolutionParts(questionId)
        rows.sortedWith(compareBy<TypeCqSolutionPartsEntity> { it.position }.thenBy { it.partId })
            .forEach { insertSolutionPart(it) }
    }

    @Transaction
    open suspend fun replaceStimulusImages(stimulusId: String, rows: List<TypeCqStimulusImagesEntity>) {
        require(stimulus(stimulusId) != null) { "Type_CQ stimulus does not exist" }
        require(rows.all { it.stimulusId == stimulusId }) { "Images must belong to the target Type_CQ stimulus" }
        require(rows.all { imageExists(it.imageId) == 1 }) { "Stimulus image does not exist" }
        clearStimulusImages(stimulusId)
        rows.sortedWith(compareBy<TypeCqStimulusImagesEntity> { it.position }.thenBy { it.imageId })
            .forEach { insertStimulusImage(it) }
    }
}
