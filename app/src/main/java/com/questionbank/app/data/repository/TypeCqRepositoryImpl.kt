package com.questionbank.app.data.repository

import com.questionbank.app.data.local.dao.TypeCqReferenceDao
import com.questionbank.app.data.local.entity.*
import java.util.UUID
import com.questionbank.app.domain.repository.TypeCqRepository
import kotlinx.coroutines.flow.Flow

class TypeCqRepositoryImpl(private val dao: TypeCqReferenceDao, private val categoryDao: com.questionbank.app.data.local.dao.CategoryDataDao, private val sharedDao: com.questionbank.app.data.local.dao.SharedDataDao, private val beforeWrite: suspend () -> Unit = {}) : TypeCqRepository {
    override fun observeQuestionTypes(): Flow<List<TypeCqQuestionTypesEntity>> = dao.observeQuestionTypes()
    override fun observeAllQuestionTypes(): Flow<List<TypeCqQuestionTypesEntity>> = dao.observeAllQuestionTypes()
    override fun observeBoards(): Flow<List<BoardCatalogEntity>> = sharedDao.observeBoards()
    override suspend fun addQuestionType(code: String, label: String): Boolean {
        val c = code.trim().uppercase(); val n = label.trim()
        if (c.isBlank() || n.isBlank() || dao.questionTypeCodeExists(c) > 0) return false
        beforeWrite()
        return try { dao.insertQuestionType(TypeCqQuestionTypesEntity("qtype_${UUID.randomUUID()}", c, n, dao.questionTypes().size.toLong() + 1, 1)); true } catch (_: Exception) { false }
    }
    override suspend fun renameQuestionType(id: String, label: String): Boolean { if(label.trim().isBlank()) return false; beforeWrite(); return dao.renameQuestionType(id, label.trim()) > 0 }
    override suspend fun setQuestionTypeActive(id: String, active: Boolean): Boolean { beforeWrite(); return dao.setQuestionTypeActive(id, if (active) 1 else 0) > 0 }
    override suspend fun addBoard(code: String, label: String): Boolean {
        val c = code.trim().uppercase(); val n = label.trim(); if (c.isBlank() || n.isBlank() || sharedDao.boardCodeExists(c) > 0) return false
        beforeWrite()
        val now = System.currentTimeMillis()
        return try { sharedDao.insertBoard(BoardCatalogEntity("brd_custom_${UUID.randomUUID()}", c, n, "CUSTOM", 0, 999, now, now)); true } catch (_: Exception) { false }
    }
    override suspend fun renameBoard(id: String, label: String): Boolean { if(label.trim().isBlank()) return false; beforeWrite(); return sharedDao.renameBoard(id, label.trim(), System.currentTimeMillis()) > 0 }
    override suspend fun setBoardArchived(id: String, archived: Boolean): Boolean { beforeWrite(); return sharedDao.setBoardArchived(id, if (archived) 1 else 0, System.currentTimeMillis()) > 0 }
    override fun observeStimuli(topicId: String): Flow<List<TypeCqStimuliEntity>> = dao.observeStimuli(topicId)
    override fun observeQuestions(topicId: String): Flow<List<TypeCqQuestionsEntity>> = dao.observeQuestions(topicId)
    override fun observeCategories(): Flow<List<TypeCqQuestionCategoriesEntity>> = dao.observeCategories()
    override suspend fun addCategory(name: String): Boolean { val n=name.trim(); if(n.isBlank()) return false; val now=System.currentTimeMillis(); beforeWrite(); return try { categoryDao.insertTypeCategory(TypeCqQuestionCategoriesEntity("tcat_${UUID.randomUUID()}",n,"","","",999,0,now,now)); true } catch (_: Exception) { false } }
    override suspend fun renameCategory(id: String, name: String): Boolean { val n=name.trim(); if(n.isBlank()) return false; beforeWrite(); return safeWrite { categoryDao.renameTypeCategory(id,n,System.currentTimeMillis())>0 } }
    override suspend fun setCategoryArchived(id: String, archived: Boolean): Boolean { beforeWrite(); return if (archived) categoryDao.archiveTypeIfUnused(id,System.currentTimeMillis()) else categoryDao.setTypeCategoryArchived(id,0,System.currentTimeMillis())>0 }
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
