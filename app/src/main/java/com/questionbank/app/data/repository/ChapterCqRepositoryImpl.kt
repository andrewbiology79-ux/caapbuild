package com.questionbank.app.data.repository

import com.questionbank.app.data.local.dao.ChapterCqDataDao
import com.questionbank.app.data.local.entity.*
import com.questionbank.app.domain.repository.ChapterCqRepository
import com.questionbank.app.domain.hierarchy.AddResult
import com.questionbank.app.domain.hierarchy.EditResult
import com.questionbank.app.domain.hierarchy.HierarchyName
import com.questionbank.app.domain.hierarchy.HierarchyRow
import com.questionbank.app.data.local.dao.DeleteOutcome
import com.questionbank.app.data.local.dao.HierarchyRowDb
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class ChapterCqRepositoryImpl(
    private val dao: ChapterCqDataDao,
    private val beforeWrite: suspend () -> Unit = {},
) : ChapterCqRepository {
    override fun observeSubjects(): Flow<List<ChapterCqSubjectsEntity>> = dao.observeSubjects()
    override fun observeSubjectRows(): Flow<List<HierarchyRow>> = dao.observeSubjectRows().map { it.toHierarchyRows() }
    override fun observeChapters(subjectId: String): Flow<List<ChapterCqChaptersEntity>> = dao.observeChapters(subjectId)
    override fun observeChapterRows(subjectId: String): Flow<List<HierarchyRow>> = dao.observeChapterRows(subjectId).map { it.toHierarchyRows() }
    override fun observeStimuli(chapterId: String): Flow<List<ChapterCqStimuliEntity>> = dao.observeStimuli(chapterId)
    override fun observeCategories(): Flow<List<ChapterCqQuestionCategoriesEntity>> = dao.observeCategories()
    override fun observeQuestions(chapterId: String): Flow<List<ChapterCqQuestionsEntity>> = dao.observeQuestions(chapterId)
    override fun observeQuestionCards(chapterId: String) = dao.observeQuestionCards(chapterId)
    override suspend fun loadQuestion(questionId: String): ChapterCqQuestionsEntity? = dao.question(questionId)
    override suspend fun deleteQuestion(questionId: String, chapterId: String): Boolean = try {
        beforeWrite()
        dao.deleteQuestionAndUnusedStimulus(questionId, chapterId)
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        false
    }
    override suspend fun deleteQuestions(questionIds: List<String>, chapterId: String): Boolean = try {
        if (questionIds.isEmpty() || questionIds.distinct().size != questionIds.size) return false
        beforeWrite()
        dao.deleteQuestionBatchAndUnusedStimuli(questionIds, chapterId)
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        false
    }

    override suspend fun duplicateQuestion(questionId: String, chapterId: String): Boolean = try {
        val original = dao.question(questionId) ?: return false
        if (original.chapterId != chapterId) return false
        val now = System.currentTimeMillis()
        val newQuestionId = "ccq_${java.util.UUID.randomUUID()}"
        val originalStimulus = original.stimulusId?.let { dao.stimulus(it) }
        val newStimulusId = originalStimulus?.let { "ccs_${java.util.UUID.randomUUID()}" }
        val clonedStimulus = originalStimulus?.copy(stimulusId = newStimulusId!!, createdAt = now, updatedAt = now)
        val imageRows = originalStimulus?.let { dao.stimulusImages(it.stimulusId) }.orEmpty().map { row -> row.copy(stimulusId = newStimulusId!!) }
        val questionCopy = original.copy(questionId = newQuestionId, ftsId = 0L, stimulusId = newStimulusId, createdAt = now, updatedAt = now)
        val parts = dao.solutionParts(questionId).map { it.copy(partId = "ccsp_${java.util.UUID.randomUUID()}", questionId = newQuestionId, createdAt = now) }
        val boards = dao.questionBoards(questionId).map { it.copy(id = "ccqb_${java.util.UUID.randomUUID()}", questionId = newQuestionId) }
        val categories = dao.questionCategories(questionId).map { it.copy(questionId = newQuestionId, assignedAt = now) }
        beforeWrite()
        dao.saveQuestionWithStimulusBundle(
            question = questionCopy, stimulusRow = clonedStimulus, parts = parts, boards = boards, categories = categories,
            mustUpdateExisting = false, draftKey = "draft:chapter_cq:duplicate:$newQuestionId", stimulusImageRows = imageRows,
        )
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        false
    }
    override suspend fun loadStimulus(stimulusId: String): ChapterCqStimuliEntity? = dao.stimulus(stimulusId)
    override suspend fun loadStimulusImages(stimulusId: String): List<ChapterCqStimulusImagesEntity> = dao.stimulusImages(stimulusId)
    override suspend fun loadStimulusBoards(stimulusId: String): List<ChapterCqStimulusBoardsEntity> = dao.stimulusBoards(stimulusId)
    override suspend fun loadSolutionParts(questionId: String): List<ChapterCqSolutionPartsEntity> = dao.solutionParts(questionId)
    override suspend fun loadQuestionBoards(questionId: String): List<ChapterCqQuestionBoardsEntity> = dao.questionBoards(questionId)
    override suspend fun loadQuestionCategories(questionId: String): List<ChapterCqQuestionCategoryLinksEntity> = dao.questionCategories(questionId)
    override suspend fun loadQuestionPaperUsages(questionId: String) = dao.paperUsagesForQuestion(questionId)
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

    override suspend fun addSubjectItem(name: String): AddResult = checkedAdd(name) { value ->
        if (dao.countSubjectName(value) > 0) return@checkedAdd AddResult.Duplicate
        val now = System.currentTimeMillis()
        val id = "cqs_${java.util.UUID.randomUUID()}"
        beforeWrite()
        dao.insertSubject(ChapterCqSubjectsEntity(id, value, 999, now, now))
        AddResult.Added(id)
    }

    override suspend fun addChapterItem(subjectId: String, name: String): AddResult = checkedAdd(name) { value ->
        if (dao.countSubject(subjectId) == 0) return@checkedAdd AddResult.ParentMissing
        if (dao.countChapterName(subjectId, value) > 0) return@checkedAdd AddResult.Duplicate
        val now = System.currentTimeMillis()
        val id = "cqc_${java.util.UUID.randomUUID()}"
        beforeWrite()
        dao.insertChapter(ChapterCqChaptersEntity(id, subjectId, value, 999, now, now))
        AddResult.Added(id)
    }

    override suspend fun renameSubjectItem(subjectId: String, name: String): EditResult = checkedEdit(name) { value ->
        if (dao.countSubject(subjectId) == 0) return@checkedEdit EditResult.NotFound
        if (dao.countSubjectNameExcept(value, subjectId) > 0) return@checkedEdit EditResult.Duplicate
        beforeWrite()
        if (dao.renameSubject(subjectId, value, System.currentTimeMillis()) > 0) EditResult.Done else EditResult.NotFound
    }

    override suspend fun renameChapterItem(chapterId: String, name: String): EditResult = checkedEdit(name) { value ->
        val subjectId = dao.subjectIdForChapter(chapterId) ?: return@checkedEdit EditResult.NotFound
        if (dao.countChapterName(subjectId, value) > 0 && dao.countChapterNameExcept(subjectId, value, chapterId) > 0) return@checkedEdit EditResult.Duplicate
        beforeWrite()
        if (dao.renameChapter(chapterId, value, System.currentTimeMillis()) > 0) EditResult.Done else EditResult.NotFound
    }

    override suspend fun deleteSubjectItem(subjectId: String): EditResult = guardedDelete { dao.deleteSubjectIfEmpty(subjectId) }
    override suspend fun deleteChapterItem(chapterId: String): EditResult = guardedDelete { dao.deleteChapterIfEmpty(chapterId) }
    override suspend fun reorderSubjectItems(orderedIds: List<String>): EditResult = guardedReorder { dao.reorderSubjects(orderedIds, System.currentTimeMillis()) }
    override suspend fun reorderChapterItems(subjectId: String, orderedIds: List<String>): EditResult = guardedReorder { dao.reorderChapters(subjectId, orderedIds, System.currentTimeMillis()) }

    private fun List<HierarchyRowDb>.toHierarchyRows(): List<HierarchyRow> = map {
        HierarchyRow(it.id, it.name, it.childCount, it.questionCount)
    }

    private suspend fun checkedAdd(raw: String, block: suspend (String) -> AddResult): AddResult {
        val name = HierarchyName.clean(raw)
        if (name.isEmpty()) return AddResult.Blank
        if (name.length > HierarchyName.MAX_LENGTH) return AddResult.TooLong
        return try { block(name) } catch (cancelled: CancellationException) { throw cancelled } catch (error: Exception) {
            AddResult.Failed(error.message ?: error.javaClass.simpleName)
        }
    }

    private suspend fun checkedEdit(raw: String, block: suspend (String) -> EditResult): EditResult {
        val name = HierarchyName.clean(raw)
        if (name.isEmpty()) return EditResult.Blank
        if (name.length > HierarchyName.MAX_LENGTH) return EditResult.TooLong
        return try { block(name) } catch (cancelled: CancellationException) { throw cancelled } catch (error: Exception) {
            EditResult.Failed(error.message ?: error.javaClass.simpleName)
        }
    }

    private suspend fun guardedDelete(block: suspend () -> DeleteOutcome): EditResult = try {
        beforeWrite()
        when (val value = block()) {
            DeleteOutcome.Deleted -> EditResult.Done
            DeleteOutcome.NotFound -> EditResult.NotFound
            is DeleteOutcome.NotEmpty -> EditResult.NotEmpty(value.childCount, value.questionCount)
        }
    } catch (cancelled: CancellationException) { throw cancelled } catch (error: Exception) {
        EditResult.Failed(error.message ?: error.javaClass.simpleName)
    }

    private suspend fun guardedReorder(block: suspend () -> Boolean): EditResult = try {
        beforeWrite()
        if (block()) EditResult.Done else EditResult.NotFound
    } catch (cancelled: CancellationException) { throw cancelled } catch (error: Exception) {
        EditResult.Failed(error.message ?: error.javaClass.simpleName)
    }
    override suspend fun saveQuestionWithStimulus(
        question: ChapterCqQuestionsEntity, stimulus: ChapterCqStimuliEntity?, solutionParts: List<ChapterCqSolutionPartsEntity>,
        boards: List<ChapterCqQuestionBoardsEntity>, categories: List<ChapterCqQuestionCategoryLinksEntity>,
        stimulusImages: List<ChapterCqStimulusImagesEntity>?, mustUpdateExisting: Boolean, draftOwnerId: String,
    ): Boolean {
        // The DAO owns the whole Room transaction, including all validation and read-back checks.
        // Do not perform a second post-commit read-back here: a late mismatch could otherwise report
        // failure after the write had already committed and could not be rolled back.
        return try {
            val command = com.questionbank.app.domain.editor.EditorSaveCommand.chapterCqBundle(
                question, stimulus, solutionParts, boards, categories, stimulusImages, mustUpdateExisting, draftOwnerId,
            )
            beforeWrite()
            dao.saveQuestionWithStimulusBundle(
                command.question, command.stimulus, command.solutionParts, command.boards, command.categories,
                mustUpdateExisting = command.mustUpdateExisting,
                draftKey = "draft:chapter_cq:editor:${command.draftOwnerId}",
                stimulusImageRows = command.stimulusImages,
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
