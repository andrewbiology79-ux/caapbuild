package com.questionbank.app.domain.repository

import com.questionbank.app.data.local.entity.TypeCqQuestionBoardsEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionCategoriesEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionCategoryLinksEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionsEntity
import com.questionbank.app.data.local.entity.TypeCqSolutionPartsEntity
import com.questionbank.app.data.local.entity.TypeCqStimulusImagesEntity
import com.questionbank.app.data.local.entity.TypeCqStimuliEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionTypesEntity
import com.questionbank.app.data.local.entity.BoardCatalogEntity
import kotlinx.coroutines.flow.Flow

interface TypeCqRepository {
    fun observeQuestionTypes(): Flow<List<TypeCqQuestionTypesEntity>>
    fun observeAllQuestionTypes(): Flow<List<TypeCqQuestionTypesEntity>>
    fun observeBoards(): Flow<List<BoardCatalogEntity>>
    suspend fun addQuestionType(code: String, label: String): Boolean
    suspend fun renameQuestionType(id: String, label: String): Boolean
    suspend fun setQuestionTypeActive(id: String, active: Boolean): Boolean
    suspend fun addBoard(code: String, label: String): Boolean
    suspend fun renameBoard(id: String, label: String): Boolean
    suspend fun setBoardArchived(id: String, archived: Boolean): Boolean
    fun observeStimuli(topicId: String): Flow<List<TypeCqStimuliEntity>>
    fun observeQuestions(topicId: String): Flow<List<TypeCqQuestionsEntity>>
    fun observeCategories(): Flow<List<TypeCqQuestionCategoriesEntity>>
    suspend fun addCategory(name: String): Boolean
    suspend fun renameCategory(id: String, name: String): Boolean
    suspend fun setCategoryArchived(id: String, archived: Boolean): Boolean
    suspend fun isDuplicate(topicId: String, questionText: String): Boolean
    suspend fun replaceBoards(questionId: String, rows: List<TypeCqQuestionBoardsEntity>)
    suspend fun replaceCategories(questionId: String, rows: List<TypeCqQuestionCategoryLinksEntity>)
    suspend fun replaceSolutionParts(questionId: String, rows: List<TypeCqSolutionPartsEntity>)
    suspend fun replaceStimulusImages(stimulusId: String, rows: List<TypeCqStimulusImagesEntity>)
}
