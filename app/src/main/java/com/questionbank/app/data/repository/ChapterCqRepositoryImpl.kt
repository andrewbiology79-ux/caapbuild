package com.questionbank.app.data.repository

import com.questionbank.app.data.local.dao.ChapterCqDataDao
import com.questionbank.app.data.local.entity.*
import com.questionbank.app.domain.repository.ChapterCqRepository
import kotlinx.coroutines.flow.Flow

class ChapterCqRepositoryImpl(
    private val dao: ChapterCqDataDao,
    private val beforeWrite: suspend () -> Unit = {},
) : ChapterCqRepository {
    override fun observeSubjects(): Flow<List<ChapterCqSubjectsEntity>> = dao.observeSubjects()
    override fun observeChapters(subjectId: String): Flow<List<ChapterCqChaptersEntity>> = dao.observeChapters(subjectId)
    override fun observeStimuli(chapterId: String): Flow<List<ChapterCqStimuliEntity>> = dao.observeStimuli(chapterId)
    override fun observeCategories(): Flow<List<ChapterCqQuestionCategoriesEntity>> = dao.observeCategories()
    override fun observeQuestions(chapterId: String): Flow<List<ChapterCqQuestionsEntity>> = dao.observeQuestions(chapterId)
    override fun observeQuestionCards(chapterId: String) = dao.observeQuestionCards(chapterId)
    override suspend fun loadQuestion(questionId: String): ChapterCqQuestionsEntity? = dao.question(questionId)
    override suspend fun saveQuestion(
        question: ChapterCqQuestionsEntity,
        solutionParts: List<ChapterCqSolutionPartsEntity>,
        boards: List<ChapterCqQuestionBoardsEntity>,
        categories: List<ChapterCqQuestionCategoryLinksEntity>,
    ): Boolean {
        beforeWrite()
        return dao.saveQuestionBundle(question, solutionParts, boards, categories)
    }
    override suspend fun isDuplicate(chapterId: String, questionText: String): Boolean =
        dao.countDuplicateQuestion(chapterId, questionText.trim()) > 0
    override suspend fun replaceBoards(questionId: String, rows: List<ChapterCqQuestionBoardsEntity>) { beforeWrite(); dao.replaceQuestionBoards(questionId, rows) }
    override suspend fun replaceCategories(questionId: String, rows: List<ChapterCqQuestionCategoryLinksEntity>) { beforeWrite(); dao.replaceQuestionCategories(questionId, rows) }
    override suspend fun replaceSolutionParts(questionId: String, rows: List<ChapterCqSolutionPartsEntity>) { beforeWrite(); dao.replaceSolutionParts(questionId, rows) }
}
