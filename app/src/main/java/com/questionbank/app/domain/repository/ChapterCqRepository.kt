package com.questionbank.app.domain.repository

import com.questionbank.app.data.local.entity.ChapterCqQuestionsEntity
import com.questionbank.app.data.local.entity.ChapterCqSubjectsEntity
import com.questionbank.app.data.local.entity.ChapterCqChaptersEntity
import com.questionbank.app.data.local.entity.ChapterCqStimuliEntity
import com.questionbank.app.data.local.entity.ChapterCqStimulusImagesEntity
import com.questionbank.app.data.local.entity.ChapterCqStimulusBoardsEntity
import com.questionbank.app.data.local.entity.ChapterCqQuestionCategoriesEntity
import com.questionbank.app.data.local.entity.ChapterCqSolutionPartsEntity
import com.questionbank.app.data.local.dao.ChapterCqQuestionCardDb
import com.questionbank.app.data.local.dao.QuestionPaperUsageDb
import com.questionbank.app.domain.hierarchy.AddResult
import com.questionbank.app.domain.hierarchy.EditResult
import com.questionbank.app.domain.hierarchy.HierarchyRow
import com.questionbank.app.data.local.entity.ChapterCqQuestionBoardsEntity
import com.questionbank.app.data.local.entity.ChapterCqQuestionCategoryLinksEntity
import kotlinx.coroutines.flow.Flow

interface ChapterCqRepository {
    fun observeSubjects(): Flow<List<ChapterCqSubjectsEntity>>
    fun observeSubjectRows(): Flow<List<HierarchyRow>>
    fun observeChapters(subjectId: String): Flow<List<ChapterCqChaptersEntity>>
    fun observeChapterRows(subjectId: String): Flow<List<HierarchyRow>>
    fun observeStimuli(chapterId: String): Flow<List<ChapterCqStimuliEntity>>
    fun observeCategories(): Flow<List<ChapterCqQuestionCategoriesEntity>>
    fun observeQuestions(chapterId: String): Flow<List<ChapterCqQuestionsEntity>>
    fun observeQuestionCards(chapterId: String): Flow<List<ChapterCqQuestionCardDb>>
    suspend fun loadQuestion(questionId: String): ChapterCqQuestionsEntity?
    suspend fun deleteQuestion(questionId: String, chapterId: String): Boolean
    /** Atomically deletes a selected set in one chapter; restricted paper references roll the whole batch back. */
    suspend fun deleteQuestions(questionIds: List<String>, chapterId: String): Boolean
    /** Copies one Chapter_CQ question, its stimulus images, solution blocks, tags and categories. */
    suspend fun duplicateQuestion(questionId: String, chapterId: String): Boolean
    suspend fun loadStimulus(stimulusId: String): ChapterCqStimuliEntity?
    suspend fun loadStimulusImages(stimulusId: String): List<ChapterCqStimulusImagesEntity>
    suspend fun loadStimulusBoards(stimulusId: String): List<ChapterCqStimulusBoardsEntity>
    suspend fun loadSolutionParts(questionId: String): List<ChapterCqSolutionPartsEntity>
    suspend fun loadQuestionBoards(questionId: String): List<ChapterCqQuestionBoardsEntity>
    suspend fun loadQuestionCategories(questionId: String): List<ChapterCqQuestionCategoryLinksEntity>
    suspend fun loadQuestionPaperUsages(questionId: String): List<QuestionPaperUsageDb>
    suspend fun addSubject(name: String): Boolean
    suspend fun addChapter(subjectId: String, name: String): Boolean
    suspend fun renameSubject(subjectId: String, name: String): Boolean
    suspend fun renameChapter(chapterId: String, name: String): Boolean
    /** Chapter_CQ hierarchy UI adapter contracts; separate from the legacy boolean editor helpers above. */
    suspend fun addSubjectItem(name: String): AddResult
    suspend fun addChapterItem(subjectId: String, name: String): AddResult
    suspend fun renameSubjectItem(subjectId: String, name: String): EditResult
    suspend fun renameChapterItem(chapterId: String, name: String): EditResult
    suspend fun deleteSubjectItem(subjectId: String): EditResult
    suspend fun deleteChapterItem(chapterId: String): EditResult
    suspend fun reorderSubjectItems(orderedIds: List<String>): EditResult
    suspend fun reorderChapterItems(subjectId: String, orderedIds: List<String>): EditResult
    suspend fun saveQuestionWithStimulus(
        question: ChapterCqQuestionsEntity,
        stimulus: ChapterCqStimuliEntity?,
        solutionParts: List<ChapterCqSolutionPartsEntity> = emptyList(),
        boards: List<ChapterCqQuestionBoardsEntity> = emptyList(),
        categories: List<ChapterCqQuestionCategoryLinksEntity> = emptyList(),
        stimulusImages: List<ChapterCqStimulusImagesEntity>? = null,
        mustUpdateExisting: Boolean,
        draftOwnerId: String,
    ): Boolean
    suspend fun saveQuestion(
        question: ChapterCqQuestionsEntity,
        solutionParts: List<ChapterCqSolutionPartsEntity> = emptyList(),
        boards: List<ChapterCqQuestionBoardsEntity> = emptyList(),
        categories: List<ChapterCqQuestionCategoryLinksEntity> = emptyList(),
    ): Boolean
    suspend fun isDuplicate(chapterId: String, questionText: String, excludeQuestionId: String? = null): Boolean
    suspend fun replaceBoards(questionId: String, rows: List<ChapterCqQuestionBoardsEntity>)
    suspend fun replaceCategories(questionId: String, rows: List<ChapterCqQuestionCategoryLinksEntity>)
    suspend fun replaceSolutionParts(questionId: String, rows: List<ChapterCqSolutionPartsEntity>)
}
