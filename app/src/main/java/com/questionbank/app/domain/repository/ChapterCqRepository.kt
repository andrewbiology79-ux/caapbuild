package com.questionbank.app.domain.repository

import com.questionbank.app.data.local.entity.ChapterCqQuestionsEntity
import com.questionbank.app.data.local.entity.ChapterCqSubjectsEntity
import com.questionbank.app.data.local.entity.ChapterCqChaptersEntity
import com.questionbank.app.data.local.entity.ChapterCqStimuliEntity
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
    suspend fun saveQuestion(
        question: ChapterCqQuestionsEntity,
        solutionParts: List<ChapterCqSolutionPartsEntity> = emptyList(),
        boards: List<ChapterCqQuestionBoardsEntity> = emptyList(),
        categories: List<ChapterCqQuestionCategoryLinksEntity> = emptyList(),
    ): Boolean
    suspend fun isDuplicate(chapterId: String, questionText: String): Boolean
    suspend fun replaceBoards(questionId: String, rows: List<ChapterCqQuestionBoardsEntity>)
    suspend fun replaceCategories(questionId: String, rows: List<ChapterCqQuestionCategoryLinksEntity>)
    suspend fun replaceSolutionParts(questionId: String, rows: List<ChapterCqSolutionPartsEntity>)
}
