package com.questionbank.app.domain.repository

import com.questionbank.app.data.local.entity.ChapterCqQuestionsEntity
import com.questionbank.app.data.local.entity.ChapterCqSubjectsEntity
import com.questionbank.app.data.local.entity.ChapterCqChaptersEntity
import com.questionbank.app.data.local.entity.ChapterCqStimuliEntity
import com.questionbank.app.data.local.entity.ChapterCqStimulusImagesEntity
import com.questionbank.app.data.local.entity.ChapterCqQuestionCategoriesEntity
import com.questionbank.app.data.local.entity.ChapterCqSolutionPartsEntity
import com.questionbank.app.data.local.dao.ChapterCqQuestionCardDb
import com.questionbank.app.data.local.entity.ChapterCqQuestionBoardsEntity
import com.questionbank.app.data.local.entity.ChapterCqQuestionCategoryLinksEntity
import kotlinx.coroutines.flow.Flow

interface ChapterCqRepository {
    fun observeSubjects(): Flow<List<ChapterCqSubjectsEntity>>
    fun observeChapters(subjectId: String): Flow<List<ChapterCqChaptersEntity>>
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
    suspend fun loadSolutionParts(questionId: String): List<ChapterCqSolutionPartsEntity>
    suspend fun loadQuestionBoards(questionId: String): List<ChapterCqQuestionBoardsEntity>
    suspend fun loadQuestionCategories(questionId: String): List<ChapterCqQuestionCategoryLinksEntity>
    suspend fun addSubject(name: String): Boolean
    suspend fun addChapter(subjectId: String, name: String): Boolean
    suspend fun renameSubject(subjectId: String, name: String): Boolean
    suspend fun renameChapter(chapterId: String, name: String): Boolean
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
