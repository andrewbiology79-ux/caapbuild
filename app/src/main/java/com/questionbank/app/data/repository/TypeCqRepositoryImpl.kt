package com.questionbank.app.data.repository

import com.questionbank.app.data.local.dao.TypeCqReferenceDao
import com.questionbank.app.data.local.entity.*
import com.questionbank.app.domain.repository.TypeCqRepository
import kotlinx.coroutines.flow.Flow

class TypeCqRepositoryImpl(private val dao: TypeCqReferenceDao) : TypeCqRepository {
    override fun observeQuestionTypes(): Flow<List<TypeCqQuestionTypesEntity>> = dao.observeQuestionTypes()
    override fun observeStimuli(topicId: String): Flow<List<TypeCqStimuliEntity>> = dao.observeStimuli(topicId)
    override fun observeQuestions(topicId: String): Flow<List<TypeCqQuestionsEntity>> = dao.observeQuestions(topicId)
    override fun observeCategories(): Flow<List<TypeCqQuestionCategoriesEntity>> = dao.observeCategories()
    override suspend fun isDuplicate(topicId: String, questionText: String): Boolean =
        dao.countDuplicateQuestion(topicId, questionText.trim()) > 0
    override suspend fun replaceBoards(questionId: String, rows: List<TypeCqQuestionBoardsEntity>) =
        dao.replaceQuestionBoards(questionId, rows)
    override suspend fun replaceCategories(questionId: String, rows: List<TypeCqQuestionCategoryLinksEntity>) =
        dao.replaceQuestionCategories(questionId, rows)
    override suspend fun replaceSolutionParts(questionId: String, rows: List<TypeCqSolutionPartsEntity>) =
        dao.replaceSolutionParts(questionId, rows)
    override suspend fun replaceStimulusImages(stimulusId: String, rows: List<TypeCqStimulusImagesEntity>) =
        dao.replaceStimulusImages(stimulusId, rows)
}
