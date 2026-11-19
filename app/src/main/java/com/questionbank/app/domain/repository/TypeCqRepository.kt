package com.questionbank.app.domain.repository

import com.questionbank.app.data.local.entity.TypeCqQuestionBoardsEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionCategoriesEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionCategoryLinksEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionsEntity
import com.questionbank.app.data.local.entity.TypeCqSolutionPartsEntity
import com.questionbank.app.data.local.entity.TypeCqStimulusImagesEntity
import com.questionbank.app.data.local.entity.TypeCqStimuliEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionTypesEntity
import kotlinx.coroutines.flow.Flow

interface TypeCqRepository {
    fun observeQuestionTypes(): Flow<List<TypeCqQuestionTypesEntity>>
    fun observeStimuli(topicId: String): Flow<List<TypeCqStimuliEntity>>
    fun observeQuestions(topicId: String): Flow<List<TypeCqQuestionsEntity>>
    fun observeCategories(): Flow<List<TypeCqQuestionCategoriesEntity>>
    suspend fun isDuplicate(topicId: String, questionText: String): Boolean
    suspend fun replaceBoards(questionId: String, rows: List<TypeCqQuestionBoardsEntity>)
    suspend fun replaceCategories(questionId: String, rows: List<TypeCqQuestionCategoryLinksEntity>)
    suspend fun replaceSolutionParts(questionId: String, rows: List<TypeCqSolutionPartsEntity>)
    suspend fun replaceStimulusImages(stimulusId: String, rows: List<TypeCqStimulusImagesEntity>)
}
