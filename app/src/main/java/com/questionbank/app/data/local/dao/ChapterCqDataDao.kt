package com.questionbank.app.data.local.dao

import androidx.room.Dao
import androidx.room.ColumnInfo
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import com.questionbank.app.data.local.entity.*
import com.questionbank.app.data.local.FtsIdAllocator
import kotlinx.coroutines.flow.Flow
import java.util.UUID

data class ChapterCqQuestionCardDb(
    @ColumnInfo(name = "question_id") val questionId: String,
    @ColumnInfo(name = "stimulus_id") val stimulusId: String?,
    @ColumnInfo(name = "stimulus_text") val stimulusText: String?,
    @ColumnInfo(name = "subquestion_label") val label: String,
    @ColumnInfo(name = "marks") val marks: Double,
    @ColumnInfo(name = "question_text") val questionText: String,
    @ColumnInfo(name = "short_answer") val shortAnswer: String,
    @ColumnInfo(name = "rating") val rating: Long?,
    @ColumnInfo(name = "stimulus_rating") val stimulusRating: Long?,
)

data class ChapterCqEditorProjectionDb(
    @ColumnInfo(name = "question_id") val questionId: String,
    @ColumnInfo(name = "chapter_id") val chapterId: String,
    @ColumnInfo(name = "stimulus_id") val stimulusId: String?,
    @ColumnInfo(name = "question_text") val questionText: String,
    @ColumnInfo(name = "short_answer") val shortAnswer: String,
    @ColumnInfo(name = "stimulus_text") val stimulusText: String?,
    @ColumnInfo(name = "reference_text") val referenceText: String?,
    @ColumnInfo(name = "marks") val marks: Double,
)

/** Chapter_CQ-only persistence. Deliberately contains no Type_CQ topic or question-type access. */
@Dao
abstract class ChapterCqDataDao {
    @Query("SELECT * FROM chapter_cq_subjects ORDER BY sort_order, name, subject_id")
    abstract fun observeSubjects(): Flow<List<ChapterCqSubjectsEntity>>

    @Query("SELECT * FROM chapter_cq_chapters WHERE subject_id = :subjectId ORDER BY sort_order, name, chapter_id")
    abstract fun observeChapters(subjectId: String): Flow<List<ChapterCqChaptersEntity>>

    @Query("SELECT * FROM chapter_cq_stimuli WHERE chapter_id = :chapterId ORDER BY created_at, stimulus_id")
    abstract fun observeStimuli(chapterId: String): Flow<List<ChapterCqStimuliEntity>>

    @Query("SELECT * FROM chapter_cq_question_categories ORDER BY is_archived, sort_order, name, category_id")
    abstract fun observeCategories(): Flow<List<ChapterCqQuestionCategoriesEntity>>

    @Query("SELECT q.* FROM chapter_cq_questions q WHERE q.chapter_id = :chapterId ORDER BY q.sort_order, q.question_id")
    abstract fun observeQuestions(chapterId: String): Flow<List<ChapterCqQuestionsEntity>>

    @Query("SELECT q.question_id AS question_id, q.stimulus_id AS stimulus_id, s.stimulus_text AS stimulus_text, q.subquestion_label AS subquestion_label, q.marks AS marks, q.question_text AS question_text, q.short_answer AS short_answer, q.rating AS rating, s.rating AS stimulus_rating FROM chapter_cq_questions q LEFT JOIN chapter_cq_stimuli s ON s.stimulus_id = q.stimulus_id WHERE q.chapter_id = :chapterId ORDER BY q.sort_order, q.question_id")
    abstract fun observeQuestionCards(chapterId: String): Flow<List<ChapterCqQuestionCardDb>>

    @Query("SELECT q.question_id AS question_id, q.chapter_id AS chapter_id, q.stimulus_id AS stimulus_id, q.question_text AS question_text, q.short_answer AS short_answer, s.stimulus_text AS stimulus_text, s.reference_text AS reference_text, q.marks AS marks FROM chapter_cq_questions q LEFT JOIN chapter_cq_stimuli s ON s.stimulus_id = q.stimulus_id WHERE q.question_id = :questionId LIMIT 1")
    abstract suspend fun editorProjection(questionId: String): ChapterCqEditorProjectionDb?

    @Query("SELECT * FROM chapter_cq_questions WHERE question_id = :questionId LIMIT 1")
    abstract suspend fun question(questionId: String): ChapterCqQuestionsEntity?


    @Query("""
        SELECT 'CHAPTER_CQ' AS scope, q.question_id AS question_id,
               sb.subject_id AS subject_id, sb.name AS subject_name,
               ch.chapter_id AS chapter_id, ch.name AS chapter_name,
               ch.chapter_id AS container_id, ch.name AS container_name,
               q.stimulus_id AS stimulus_id, COALESCE(st.stimulus_text,'') AS stimulus_text,
               COALESCE(st.reference_text,'') AS reference_text,
               q.subquestion_label AS label, q.marks AS marks, q.question_text AS question_text,
               q.short_answer AS short_answer, q.rating AS rating, NULL AS question_type_id
        FROM chapter_cq_questions q
        JOIN chapter_cq_chapters ch ON ch.chapter_id=q.chapter_id
        JOIN chapter_cq_subjects sb ON sb.subject_id=ch.subject_id
        LEFT JOIN chapter_cq_stimuli st ON st.stimulus_id=q.stimulus_id
        WHERE q.question_id=:questionId LIMIT 1
    """)
    abstract suspend fun paperSource(questionId: String): PaperSourceRowDb?

    @Query("SELECT * FROM chapter_cq_stimuli WHERE stimulus_id = :stimulusId LIMIT 1")
    abstract suspend fun stimulus(stimulusId: String): ChapterCqStimuliEntity?

    @Query("DELETE FROM chapter_cq_questions WHERE question_id = :questionId AND chapter_id = :chapterId")
    abstract suspend fun deleteQuestionRow(questionId: String, chapterId: String): Int

    @Query("SELECT COUNT(*) FROM chapter_cq_questions WHERE stimulus_id = :stimulusId")
    abstract suspend fun countQuestionsForStimulusId(stimulusId: String): Int

    @Query("DELETE FROM chapter_cq_stimuli WHERE stimulus_id = :stimulusId AND chapter_id = :chapterId")
    abstract suspend fun deleteStimulusRow(stimulusId: String, chapterId: String): Int

    @Query("SELECT DISTINCT stimulus_id FROM chapter_cq_questions WHERE question_id IN (:questionIds) AND chapter_id = :chapterId AND stimulus_id IS NOT NULL")
    abstract suspend fun stimulusIdsForQuestionIds(questionIds: List<String>, chapterId: String): List<String>

    @Query("SELECT COUNT(*) FROM chapter_cq_questions WHERE question_id IN (:questionIds) AND chapter_id = :chapterId")
    abstract suspend fun countQuestionIdsInChapter(questionIds: List<String>, chapterId: String): Int

    @Query("DELETE FROM chapter_cq_questions WHERE question_id IN (:questionIds) AND chapter_id = :chapterId")
    abstract suspend fun deleteQuestionRows(questionIds: List<String>, chapterId: String): Int

    /** Atomically removes selected questions and only the stimuli no longer referenced by any question. */
    @Transaction
    open suspend fun deleteQuestionBatchAndUnusedStimuli(questionIds: List<String>, chapterId: String): Boolean {
        if (chapterId.isBlank() || questionIds.isEmpty() || questionIds.any(String::isBlank) || questionIds.distinct().size != questionIds.size) return false
        if (countQuestionIdsInChapter(questionIds, chapterId) != questionIds.size) return false
        val stimuli = stimulusIdsForQuestionIds(questionIds, chapterId).distinct()
        check(deleteQuestionRows(questionIds, chapterId) == questionIds.size) { "Chapter_CQ bulk delete failed" }
        if (countQuestionIdsInChapter(questionIds, chapterId) != 0) error("Chapter_CQ bulk delete read-back failed")
        stimuli.forEach { stimulusId ->
            if (countQuestionsForStimulusId(stimulusId) == 0) deleteStimulusRow(stimulusId, chapterId)
        }
        return true
    }

    /** Delete a single Chapter_CQ source question and remove its now-unused stimulus, all in one transaction. */
    @Transaction
    open suspend fun deleteQuestionAndUnusedStimulus(questionId: String, chapterId: String): Boolean {
        val existing = question(questionId) ?: return false
        if (existing.chapterId != chapterId) return false
        check(deleteQuestionRow(questionId, chapterId) == 1) { "Chapter_CQ question delete failed" }
        if (existing.stimulusId != null && countQuestionsForStimulusId(existing.stimulusId) == 0) {
            deleteStimulusRow(existing.stimulusId, chapterId)
        }
        return question(questionId) == null
    }

    @Query("SELECT COUNT(*) FROM chapter_cq_chapters WHERE chapter_id = :chapterId AND subject_id = :subjectId")
    abstract suspend fun chapterBelongsToSubject(chapterId: String, subjectId: String): Int

    @Query("UPDATE chapter_cq_subjects SET name = :name, updated_at = :now WHERE subject_id = :subjectId")
    abstract suspend fun renameSubject(subjectId: String, name: String, now: Long): Int

    @Query("UPDATE chapter_cq_chapters SET name = :name, updated_at = :now WHERE chapter_id = :chapterId")
    abstract suspend fun renameChapter(chapterId: String, name: String, now: Long): Int

    @Query("UPDATE chapter_cq_stimuli SET stimulus_text = :text, reference_text = :reference, rating = :rating, updated_at = :now WHERE stimulus_id = :stimulusId")
    abstract suspend fun updateStimulusContent(stimulusId: String, text: String, reference: String, rating: Long?, now: Long): Int

    @Query("SELECT COUNT(*) FROM chapter_cq_questions WHERE chapter_id = :chapterId AND question_text = :text")
    abstract suspend fun countDuplicateQuestion(chapterId: String, text: String): Int

    @Query("SELECT COUNT(*) FROM chapter_cq_questions WHERE chapter_id = :chapterId AND question_text = :text AND question_id <> :excludeQuestionId")
    abstract suspend fun countDuplicateQuestionExcept(chapterId: String, text: String, excludeQuestionId: String): Int

    @Query("SELECT * FROM chapter_cq_solution_parts WHERE question_id = :questionId ORDER BY position, part_id")
    abstract suspend fun solutionParts(questionId: String): List<ChapterCqSolutionPartsEntity>

    @Query("SELECT * FROM chapter_cq_question_boards WHERE question_id = :questionId ORDER BY sort_order, year, board_code")
    abstract suspend fun questionBoards(questionId: String): List<ChapterCqQuestionBoardsEntity>

    @Query("SELECT * FROM chapter_cq_question_category_links WHERE question_id = :questionId ORDER BY assigned_at, category_id")
    abstract suspend fun questionCategories(questionId: String): List<ChapterCqQuestionCategoryLinksEntity>

    @Query("SELECT COUNT(*) FROM chapter_cq_question_boards WHERE question_id = :questionId AND board_code = :boardCode AND year = :year")
    abstract suspend fun boardAlreadyLinked(questionId: String, boardCode: String, year: Long): Int

    @Query("SELECT COUNT(*) FROM chapter_cq_question_category_links WHERE question_id = :questionId AND category_id = :categoryId")
    abstract suspend fun categoryAlreadyLinked(questionId: String, categoryId: String): Int

    @Query("SELECT * FROM chapter_cq_stimulus_images WHERE stimulus_id = :stimulusId ORDER BY position, image_id")
    abstract suspend fun stimulusImages(stimulusId: String): List<ChapterCqStimulusImagesEntity>

    @Transaction
    open suspend fun saveQuestionBundle(
        question: ChapterCqQuestionsEntity,
        parts: List<ChapterCqSolutionPartsEntity>,
        boards: List<ChapterCqQuestionBoardsEntity>,
        categories: List<ChapterCqQuestionCategoryLinksEntity>,
    ): Boolean = saveQuestionBundleBody(question, parts, boards, categories)

    // Internal transaction body. The two public transactional entry points call this helper
    // directly so that the stimulus + question bundle is one transaction, not nested transactions.
    private suspend fun saveQuestionBundleBody(
        question: ChapterCqQuestionsEntity,
        parts: List<ChapterCqSolutionPartsEntity>,
        boards: List<ChapterCqQuestionBoardsEntity>,
        categories: List<ChapterCqQuestionCategoryLinksEntity>,
    ): Boolean {
        if (chapterExists(question.chapterId) == 0) return false
        if (!question.marks.isFinite() || question.marks <= 0.0 || question.subquestionLabel !in setOf("ক", "খ", "গ", "ঘ")) return false
        val stimulusId = question.stimulusId
        if (stimulusId != null && stimulusBelongsToChapter(stimulusId, question.chapterId) == 0) return false
        if (parts.any { it.questionId != question.questionId } || boards.any { it.questionId != question.questionId } || categories.any { it.questionId != question.questionId }) return false
        val existing = question(question.questionId)
        if (existing != null && existing.chapterId != question.chapterId) return false
        // Existing archived references may be retained while editing, but an archived reference cannot be newly assigned.
        if (boards.any { activeBoard(it.boardCode) == 0 && boardAlreadyLinked(question.questionId, it.boardCode, it.year) == 0 }) return false
        if (categories.any { activeCategory(it.categoryId) == 0 && categoryAlreadyLinked(question.questionId, it.categoryId) == 0 }) return false
        if (existing == null) {
            val allocator = FtsIdAllocator(maxFtsId())
            insertQuestion(question.copy(ftsId = allocator.next(), sortOrder = nextQuestionSortOrder(question.chapterId)))
        } else {
            updateQuestion(question.copy(ftsId = existing.ftsId, createdAt = existing.createdAt, sortOrder = existing.sortOrder))
            clearSolutionParts(question.questionId)
            clearQuestionBoards(question.questionId)
            clearQuestionCategories(question.questionId)
        }
        parts.sortedWith(compareBy<ChapterCqSolutionPartsEntity> { it.position }.thenBy { it.partId }).forEach { insertSolutionPart(it) }
        boards.sortedWith(compareBy<ChapterCqQuestionBoardsEntity> { it.sortOrder }.thenBy { it.year }.thenBy { it.boardCode }).forEach { insertQuestionBoard(it) }
        categories.sortedBy { it.categoryId }.forEach { insertCategoryLink(it) }
        return true
    }

    /** Creates or updates the optional stimulus and the question + linked child rows as one transaction. */
    @Transaction
    open suspend fun saveQuestionWithStimulusBundle(
        question: ChapterCqQuestionsEntity,
        stimulusRow: ChapterCqStimuliEntity?,
        parts: List<ChapterCqSolutionPartsEntity>,
        boards: List<ChapterCqQuestionBoardsEntity>,
        categories: List<ChapterCqQuestionCategoryLinksEntity>,
        mustUpdateExisting: Boolean,
        draftKey: String,
        stimulusImageRows: List<ChapterCqStimulusImagesEntity>? = null,
    ): Boolean {
        // Validate every condition that could make saveQuestionBundle return false BEFORE writing a stimulus.
        // Exceptions during later inserts still roll the enclosing Room transaction back.
        if (chapterExists(question.chapterId) == 0) return false
        if (!question.marks.isFinite() || question.marks <= 0.0 || question.subquestionLabel !in setOf("ক", "খ", "গ", "ঘ")) return false
        val existingQuestion = question(question.questionId)
        if (mustUpdateExisting && existingQuestion == null) return false
        if (!mustUpdateExisting && existingQuestion != null) return false
        if (existingQuestion != null && existingQuestion.chapterId != question.chapterId) return false
        if (parts.any { it.questionId != question.questionId } || boards.any { it.questionId != question.questionId } || categories.any { it.questionId != question.questionId }) return false
        if (boards.any { activeBoard(it.boardCode) == 0 && boardAlreadyLinked(question.questionId, it.boardCode, it.year) == 0 }) return false
        if (categories.any { activeCategory(it.categoryId) == 0 && categoryAlreadyLinked(question.questionId, it.categoryId) == 0 }) return false
        if (stimulusImageRows != null && stimulusImageRows.any { it.imageId.isBlank() || it.placement !in setOf("TOP", "BOTTOM") || imageExists(it.imageId) == 0 }) return false
        if (stimulusRow == null && stimulusImageRows.orEmpty().isNotEmpty()) return false
        var target = question
        var effectiveStimulus: ChapterCqStimuliEntity? = null
        if (stimulusRow != null) {
            if (stimulusRow.chapterId != question.chapterId) return false
            val existingStimulus = stimulus(stimulusRow.stimulusId)
            if (existingStimulus == null) {
                insertStimulus(stimulusRow)
                effectiveStimulus = stimulusRow
            } else {
                if (existingStimulus.chapterId != question.chapterId) return false
                val contentChanged = existingStimulus.stimulusText != stimulusRow.stimulusText ||
                    existingStimulus.referenceText != stimulusRow.referenceText || existingStimulus.rating != stimulusRow.rating
                val sharedByOtherQuestions = countQuestionsForStimulus(existingStimulus.stimulusId) > 1
                if (sharedByOtherQuestions && contentChanged) {
                    // A per-question editor must not silently change the stimulus of other questions in the same group.
                    // Clone the stimulus and its existing image links, then attach only this question to the clone.
                    val clonedId = "ccs_${UUID.randomUUID()}"
                    val cloned = stimulusRow.copy(stimulusId = clonedId, createdAt = stimulusRow.updatedAt, updatedAt = stimulusRow.updatedAt)
                    insertStimulus(cloned)
                    stimulusImages(existingStimulus.stimulusId).forEach { imageLink ->
                        insertStimulusImage(imageLink.copy(stimulusId = clonedId))
                    }
                    effectiveStimulus = cloned
                } else {
                    if (!sharedByOtherQuestions && contentChanged) {
                        check(updateStimulusContent(stimulusRow.stimulusId, stimulusRow.stimulusText, stimulusRow.referenceText, stimulusRow.rating, stimulusRow.updatedAt) == 1) {
                            "Chapter_CQ stimulus was not updated"
                        }
                    }
                    effectiveStimulus = existingStimulus
                }
            }
            target = question.copy(stimulusId = effectiveStimulus!!.stimulusId)
        } else if (question.stimulusId != null && stimulusBelongsToChapter(question.stimulusId, question.chapterId) == 0) {
            return false
        }
        if (effectiveStimulus != null && stimulusImageRows != null) {
            val effectiveId = effectiveStimulus!!.stimulusId
            val orderedImages = stimulusImageRows.sortedWith(compareBy<ChapterCqStimulusImagesEntity> { it.position }.thenBy { it.imageId })
            require(orderedImages.map { it.imageId }.distinct().size == orderedImages.size) { "Duplicate Chapter_CQ stimulus image link" }
            clearStimulusImages(effectiveId)
            orderedImages.forEachIndexed { index, row ->
                insertStimulusImage(row.copy(stimulusId = effectiveId, position = index.toLong()))
            }
        }
        // If any bundle/read-back condition fails, throw so the enclosing transaction rolls back stimulus edits too.
        check(saveQuestionBundleBody(target, parts, boards, categories)) { "Chapter_CQ question bundle was rejected" }
        val expectedStimulusId = effectiveStimulus?.stimulusId ?: question.stimulusId
        val storedQuestion = question(question.questionId)
        check(storedQuestion != null && storedQuestion.chapterId == question.chapterId &&
            storedQuestion.questionText == question.questionText && storedQuestion.shortAnswer == question.shortAnswer &&
            storedQuestion.marks == question.marks && storedQuestion.subquestionLabel == question.subquestionLabel &&
            storedQuestion.rating == question.rating && storedQuestion.stimulusId == expectedStimulusId) {
            "Chapter_CQ question read-back mismatch"
        }
        val savedParts = solutionParts(question.questionId).sortedWith(compareBy<ChapterCqSolutionPartsEntity> { it.position }.thenBy { it.partId })
        val expectedParts = parts.sortedWith(compareBy<ChapterCqSolutionPartsEntity> { it.position }.thenBy { it.partId })
        check(savedParts.map { Triple(it.partType, it.textContent, it.imageId) } ==
            expectedParts.map { Triple(it.partType, it.textContent, it.imageId) }) { "Chapter_CQ solution read-back mismatch" }
        val savedBoards = questionBoards(question.questionId).sortedWith(compareBy<ChapterCqQuestionBoardsEntity> { it.sortOrder }.thenBy { it.year }.thenBy { it.boardCode })
        val expectedBoards = boards.sortedWith(compareBy<ChapterCqQuestionBoardsEntity> { it.sortOrder }.thenBy { it.year }.thenBy { it.boardCode })
        check(savedBoards.map { it.boardCode to it.year } == expectedBoards.map { it.boardCode to it.year }) { "Chapter_CQ board read-back mismatch" }
        check(questionCategories(question.questionId).map { it.categoryId }.toSet() == categories.map { it.categoryId }.toSet()) {
            "Chapter_CQ category read-back mismatch"
        }
        if (effectiveStimulus != null) {
            if (stimulusImageRows != null) {
                val savedImages = stimulusImages(effectiveStimulus!!.stimulusId).sortedWith(compareBy<ChapterCqStimulusImagesEntity> { it.position }.thenBy { it.imageId })
                val wantedImages = stimulusImageRows.sortedWith(compareBy<ChapterCqStimulusImagesEntity> { it.position }.thenBy { it.imageId })
                check(savedImages.map { Triple(it.imageId, it.placement, it.position) } == wantedImages.mapIndexed { index, row -> Triple(row.imageId, row.placement, index.toLong()) }) {
                    "Chapter_CQ stimulus image read-back mismatch"
                }
            }
            val savedStimulus = stimulus(effectiveStimulus!!.stimulusId)
            check(savedStimulus != null && savedStimulus.stimulusText == effectiveStimulus!!.stimulusText &&
                savedStimulus.referenceText == effectiveStimulus!!.referenceText && savedStimulus.rating == effectiveStimulus!!.rating) {
                "Chapter_CQ stimulus read-back mismatch"
            }
        }
        // Remove the editor draft in this very same transaction. A crash/rollback must leave the draft intact.
        deleteEditorDraftMetadata(draftKey)
        return true
    }

    @Query("DELETE FROM app_metadata WHERE `key` = :draftKey")
    abstract suspend fun deleteEditorDraftMetadata(draftKey: String): Int

    @Query("SELECT COUNT(*) FROM chapter_cq_chapters WHERE chapter_id = :chapterId")
    abstract suspend fun chapterExists(chapterId: String): Int

    @Query("SELECT COUNT(*) FROM chapter_cq_questions WHERE stimulus_id = :stimulusId")
    abstract suspend fun countQuestionsForStimulus(stimulusId: String): Int

    @Query("SELECT COALESCE(MAX(fts_id), 0) FROM chapter_cq_questions")
    abstract suspend fun maxFtsId(): Long

    @Query("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM chapter_cq_questions WHERE chapter_id = :chapterId")
    abstract suspend fun nextQuestionSortOrder(chapterId: String): Long

    @Query("SELECT COUNT(*) FROM chapter_cq_stimuli WHERE stimulus_id = :stimulusId AND chapter_id = :chapterId")
    abstract suspend fun stimulusBelongsToChapter(stimulusId: String, chapterId: String): Int

    @Query("SELECT COUNT(*) FROM board_catalog WHERE code = :code AND is_archived = 0")
    abstract suspend fun activeBoard(code: String): Int

    @Query("SELECT COUNT(*) FROM chapter_cq_question_categories WHERE category_id = :id AND is_archived = 0")
    abstract suspend fun activeCategory(id: String): Int

    @Query("SELECT COUNT(*) FROM chapter_cq_images WHERE image_id = :id")
    abstract suspend fun imageExists(id: String): Int

    @Insert(onConflict = OnConflictStrategy.ABORT) abstract suspend fun insertSubject(row: ChapterCqSubjectsEntity)
    @Insert(onConflict = OnConflictStrategy.ABORT) abstract suspend fun insertChapter(row: ChapterCqChaptersEntity)
    @Insert(onConflict = OnConflictStrategy.ABORT) abstract suspend fun insertStimulus(row: ChapterCqStimuliEntity)
    @Insert(onConflict = OnConflictStrategy.ABORT) abstract suspend fun insertQuestion(row: ChapterCqQuestionsEntity)
    @Update abstract suspend fun updateQuestion(row: ChapterCqQuestionsEntity)
    @Insert(onConflict = OnConflictStrategy.ABORT) abstract suspend fun insertSolutionPart(row: ChapterCqSolutionPartsEntity)
    @Insert(onConflict = OnConflictStrategy.ABORT) abstract suspend fun insertQuestionBoard(row: ChapterCqQuestionBoardsEntity)
    @Insert(onConflict = OnConflictStrategy.ABORT) abstract suspend fun insertCategoryLink(row: ChapterCqQuestionCategoryLinksEntity)
    @Insert(onConflict = OnConflictStrategy.ABORT) abstract suspend fun insertStimulusImage(row: ChapterCqStimulusImagesEntity)

    @Query("DELETE FROM chapter_cq_question_boards WHERE question_id = :questionId") abstract suspend fun clearQuestionBoards(questionId: String)
    @Query("DELETE FROM chapter_cq_question_category_links WHERE question_id = :questionId") abstract suspend fun clearQuestionCategories(questionId: String)
    @Query("DELETE FROM chapter_cq_solution_parts WHERE question_id = :questionId") abstract suspend fun clearSolutionParts(questionId: String)
    @Query("DELETE FROM chapter_cq_stimulus_images WHERE stimulus_id = :stimulusId") abstract suspend fun clearStimulusImages(stimulusId: String)

    @Transaction
    open suspend fun replaceQuestionBoards(questionId: String, rows: List<ChapterCqQuestionBoardsEntity>) {
        require(question(questionId) != null) { "Chapter_CQ question does not exist" }
        require(rows.all { it.questionId == questionId }) { "Board rows must belong to the target Chapter_CQ question" }
        require(rows.all { activeBoard(it.boardCode) == 1 }) { "Archived or unknown board cannot be assigned" }
        clearQuestionBoards(questionId)
        rows.sortedWith(compareBy<ChapterCqQuestionBoardsEntity> { it.sortOrder }.thenBy { it.year }.thenBy { it.boardCode })
            .forEach { insertQuestionBoard(it) }
    }

    @Transaction
    open suspend fun replaceQuestionCategories(questionId: String, rows: List<ChapterCqQuestionCategoryLinksEntity>) {
        require(question(questionId) != null) { "Chapter_CQ question does not exist" }
        require(rows.all { it.questionId == questionId }) { "Category rows must belong to the target Chapter_CQ question" }
        require(rows.all { activeCategory(it.categoryId) == 1 }) { "Archived or unknown category cannot be assigned" }
        clearQuestionCategories(questionId)
        rows.sortedBy { it.categoryId }.forEach { insertCategoryLink(it) }
    }

    @Transaction
    open suspend fun replaceSolutionParts(questionId: String, rows: List<ChapterCqSolutionPartsEntity>) {
        require(question(questionId) != null) { "Chapter_CQ question does not exist" }
        require(rows.all { it.questionId == questionId }) { "Solution parts must belong to the target Chapter_CQ question" }
        require(rows.all { it.imageId == null || imageExists(it.imageId) == 1 }) { "Solution image does not exist" }
        clearSolutionParts(questionId)
        rows.sortedWith(compareBy<ChapterCqSolutionPartsEntity> { it.position }.thenBy { it.partId })
            .forEach { insertSolutionPart(it) }
    }

    @Transaction
    open suspend fun replaceStimulusImages(stimulusId: String, rows: List<ChapterCqStimulusImagesEntity>) {
        require(stimulus(stimulusId) != null) { "Chapter_CQ stimulus does not exist" }
        require(rows.all { it.stimulusId == stimulusId }) { "Images must belong to the target Chapter_CQ stimulus" }
        require(rows.all { imageExists(it.imageId) == 1 }) { "Stimulus image does not exist" }
        clearStimulusImages(stimulusId)
        rows.sortedWith(compareBy<ChapterCqStimulusImagesEntity> { it.position }.thenBy { it.imageId })
            .forEach { insertStimulusImage(it) }
    }
}
