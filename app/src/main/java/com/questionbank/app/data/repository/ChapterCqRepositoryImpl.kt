package com.questionbank.app.data.repository

import com.questionbank.app.data.local.dao.ChapterCqDataDao
import com.questionbank.app.data.local.entity.*
import com.questionbank.app.domain.repository.ChapterCqRepository
import kotlinx.coroutines.CancellationException
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
    override suspend fun loadStimulus(stimulusId: String): ChapterCqStimuliEntity? = dao.stimulus(stimulusId)
    override suspend fun loadSolutionParts(questionId: String): List<ChapterCqSolutionPartsEntity> = dao.solutionParts(questionId)
    override suspend fun loadQuestionBoards(questionId: String): List<ChapterCqQuestionBoardsEntity> = dao.questionBoards(questionId)
    override suspend fun loadQuestionCategories(questionId: String): List<ChapterCqQuestionCategoryLinksEntity> = dao.questionCategories(questionId)
    override suspend fun addSubject(name: String): Boolean {
        val value = name.trim(); if (value.isBlank()) return false
        val now = System.currentTimeMillis(); beforeWrite()
        return try { dao.insertSubject(ChapterCqSubjectsEntity("cqs_${java.util.UUID.randomUUID()}", value, 999, now, now)); true } catch (cancelled: CancellationException) { throw cancelled } catch (_: Exception) { false }
    }
    override suspend fun addChapter(subjectId: String, name: String): Boolean {
        val value = name.trim(); if (value.isBlank()) return false
        val now = System.currentTimeMillis(); beforeWrite()
        return try { dao.insertChapter(ChapterCqChaptersEntity("cqc_${java.util.UUID.randomUUID()}", subjectId, value, 999, now, now)); true } catch (cancelled: CancellationException) { throw cancelled } catch (_: Exception) { false }
    }
    override suspend fun renameSubject(subjectId: String, name: String): Boolean {
        val value = name.trim(); if (value.isBlank()) return false
        beforeWrite(); return try { dao.renameSubject(subjectId, value, System.currentTimeMillis()) > 0 } catch (cancelled: CancellationException) { throw cancelled } catch (_: Exception) { false }
    }
    override suspend fun renameChapter(chapterId: String, name: String): Boolean {
        val value = name.trim(); if (value.isBlank()) return false
        beforeWrite(); return try { dao.renameChapter(chapterId, value, System.currentTimeMillis()) > 0 } catch (cancelled: CancellationException) { throw cancelled } catch (_: Exception) { false }
    }
    override suspend fun saveQuestionWithStimulus(
        question: ChapterCqQuestionsEntity, stimulus: ChapterCqStimuliEntity?, solutionParts: List<ChapterCqSolutionPartsEntity>,
        boards: List<ChapterCqQuestionBoardsEntity>, categories: List<ChapterCqQuestionCategoryLinksEntity>,
        mustUpdateExisting: Boolean, draftOwnerId: String,
    ): Boolean {
        // The DAO owns the whole Room transaction, including all validation and read-back checks.
        // Do not perform a second post-commit read-back here: a late mismatch could otherwise report
        // failure after the write had already committed and could not be rolled back.
        return try {
            val command = com.questionbank.app.domain.editor.EditorSaveCommand.chapterCqBundle(
                question, stimulus, solutionParts, boards, categories, mustUpdateExisting, draftOwnerId,
            )
            beforeWrite()
            dao.saveQuestionWithStimulusBundle(
                command.question, command.stimulus, command.solutionParts, command.boards, command.categories,
                mustUpdateExisting = command.mustUpdateExisting,
                draftKey = "draft:chapter_cq:editor:${command.draftOwnerId}",
            )
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            false
        }
    }
    override suspend fun saveQuestion(
        question: ChapterCqQuestionsEntity,
        solutionParts: List<ChapterCqSolutionPartsEntity>,
        boards: List<ChapterCqQuestionBoardsEntity>,
        categories: List<ChapterCqQuestionCategoryLinksEntity>,
    ): Boolean {
        beforeWrite()
        return dao.saveQuestionBundle(question, solutionParts, boards, categories)
    }
    override suspend fun isDuplicate(chapterId: String, questionText: String, excludeQuestionId: String?): Boolean =
        if (excludeQuestionId == null) dao.countDuplicateQuestion(chapterId, questionText.trim()) > 0
        else dao.countDuplicateQuestionExcept(chapterId, questionText.trim(), excludeQuestionId) > 0
    override suspend fun replaceBoards(questionId: String, rows: List<ChapterCqQuestionBoardsEntity>) { beforeWrite(); dao.replaceQuestionBoards(questionId, rows) }
    override suspend fun replaceCategories(questionId: String, rows: List<ChapterCqQuestionCategoryLinksEntity>) { beforeWrite(); dao.replaceQuestionCategories(questionId, rows) }
    override suspend fun replaceSolutionParts(questionId: String, rows: List<ChapterCqSolutionPartsEntity>) { beforeWrite(); dao.replaceSolutionParts(questionId, rows) }
}
