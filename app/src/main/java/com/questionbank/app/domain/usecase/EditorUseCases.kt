package com.questionbank.app.domain.usecase

import com.questionbank.app.data.local.entity.ChapterCqQuestionBoardsEntity
import com.questionbank.app.data.local.entity.ChapterCqQuestionCategoryLinksEntity
import com.questionbank.app.data.local.entity.ChapterCqQuestionsEntity
import com.questionbank.app.data.local.entity.ChapterCqSolutionPartsEntity
import com.questionbank.app.data.local.entity.PaperQuestionItemsEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionBoardsEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionCategoryLinksEntity
import com.questionbank.app.data.local.entity.TypeCqSolutionPartsEntity
import com.questionbank.app.domain.question.QuestionGroupInput
import com.questionbank.app.domain.question.SaveResult
import com.questionbank.app.domain.question.TypeCqQuestionRepository
import com.questionbank.app.domain.repository.ChapterCqRepository
import com.questionbank.app.domain.repository.PaperRepository
import com.questionbank.app.domain.repository.TypeCqRepository
import com.questionbank.app.domain.repository.EditorDraftRepository

/** Shared validation result used by both editor modes; hidden fields are retained in the draft object. */
data class EditorDraft(
    val scope: Scope,
    val parentId: String,
    val questionText: String,
    val shortAnswer: String = "",
    val stimulusText: String = "",
    val referenceText: String = "",
    val marks: Double = 0.0,
    val questionTypeId: String? = null,
    val solutionParts: List<String> = emptyList(),
    val imageIds: List<String> = emptyList(),
) {
    enum class Scope { TYPE_CQ, CHAPTER_CQ }
}

data class DraftValidation(val valid: Boolean, val errors: List<String>)

class ValidateEditorDraft {
    operator fun invoke(draft: EditorDraft): DraftValidation {
        val errors = buildList {
            if (draft.parentId.isBlank()) add("Parent selection is required")
            if (draft.questionText.isBlank()) add("Question text is required")
            if (!draft.marks.isFinite() || draft.marks <= 0.0) add("Marks must be a finite positive number")
            if (draft.scope == EditorDraft.Scope.TYPE_CQ && draft.questionTypeId.isNullOrBlank()) add("Question type is required for Type_CQ")
        }
        return DraftValidation(errors.isEmpty(), errors)
    }
}

class SaveTypeCqEditor(private val repository: TypeCqQuestionRepository) {
    suspend operator fun invoke(input: QuestionGroupInput): SaveResult = repository.saveGroup(input)
}

class SaveChapterCqEditor(private val repository: ChapterCqRepository) {
    suspend operator fun invoke(
        question: ChapterCqQuestionsEntity,
        solutionParts: List<ChapterCqSolutionPartsEntity> = emptyList(),
        boards: List<ChapterCqQuestionBoardsEntity> = emptyList(),
        categories: List<ChapterCqQuestionCategoryLinksEntity> = emptyList(),
    ): Boolean = repository.saveQuestion(question, solutionParts, boards, categories)
}

class LoadEditorDraft(private val repository: EditorDraftRepository) {
    suspend operator fun invoke(scope: EditorDraft.Scope, ownerId: String): String? =
        repository.load(if (scope == EditorDraft.Scope.TYPE_CQ) "type_cq" else "chapter_cq", ownerId)
}

class SaveEditorDraft(private val repository: EditorDraftRepository) {
    suspend operator fun invoke(scope: EditorDraft.Scope, ownerId: String, draftJson: String) =
        repository.save(if (scope == EditorDraft.Scope.TYPE_CQ) "type_cq" else "chapter_cq", ownerId, draftJson)
}

class DiscardEditorDraft(private val repository: EditorDraftRepository) {
    suspend operator fun invoke(scope: EditorDraft.Scope, ownerId: String) =
        repository.discard(if (scope == EditorDraft.Scope.TYPE_CQ) "type_cq" else "chapter_cq", ownerId)
}

class CheckDuplicateQuestion(
    private val typeRepository: TypeCqRepository,
    private val chapterRepository: ChapterCqRepository,
) {
    suspend fun inTypeCq(topicId: String, questionText: String): Boolean = typeRepository.isDuplicate(topicId, questionText)
    suspend fun inChapterCq(chapterId: String, questionText: String): Boolean = chapterRepository.isDuplicate(chapterId, questionText)
}

class AssignQuestionCategories(
    private val typeRepository: TypeCqRepository,
    private val chapterRepository: ChapterCqRepository,
) {
    suspend fun forTypeCq(questionId: String, categories: List<TypeCqQuestionCategoryLinksEntity>) {
        require(categories.all { it.questionId == questionId }) { "All categories must belong to the selected Type_CQ question" }
        typeRepository.replaceCategories(questionId, categories)
    }
    suspend fun forChapterCq(questionId: String, categories: List<ChapterCqQuestionCategoryLinksEntity>) {
        require(categories.all { it.questionId == questionId }) { "All categories must belong to the selected Chapter_CQ question" }
        chapterRepository.replaceCategories(questionId, categories)
    }
}

class ReplaceBoardYearLinks(
    private val typeRepository: TypeCqRepository,
    private val chapterRepository: ChapterCqRepository,
) {
    suspend fun forTypeCq(questionId: String, links: List<TypeCqQuestionBoardsEntity>) {
        require(links.all { it.questionId == questionId }) { "All board/year links must belong to the selected Type_CQ question" }
        typeRepository.replaceBoards(questionId, links)
    }
    suspend fun forChapterCq(questionId: String, links: List<ChapterCqQuestionBoardsEntity>) {
        require(links.all { it.questionId == questionId }) { "All board/year links must belong to the selected Chapter_CQ question" }
        chapterRepository.replaceBoards(questionId, links)
    }
}

class ReorderSolutionParts(
    private val typeRepository: TypeCqRepository,
    private val chapterRepository: ChapterCqRepository,
) {
    suspend fun forTypeCq(questionId: String, parts: List<TypeCqSolutionPartsEntity>) {
        require(parts.all { it.questionId == questionId }) { "All solution parts must belong to the selected Type_CQ question" }
        require(parts.map { it.partId }.distinct().size == parts.size) { "Solution part IDs must be unique" }
        typeRepository.replaceSolutionParts(questionId, parts.mapIndexed { index, part -> part.copy(position = index.toLong()) })
    }
    suspend fun forChapterCq(questionId: String, parts: List<ChapterCqSolutionPartsEntity>) {
        require(parts.all { it.questionId == questionId }) { "All solution parts must belong to the selected Chapter_CQ question" }
        require(parts.map { it.partId }.distinct().size == parts.size) { "Solution part IDs must be unique" }
        chapterRepository.replaceSolutionParts(questionId, parts.mapIndexed { index, part -> part.copy(position = index.toLong()) })
    }
}

class BuildPaperSnapshot(private val repository: PaperRepository) {
    suspend operator fun invoke(
        itemId: String,
        paperId: String,
        sectionId: String?,
        typeCqQuestionId: String?,
        chapterCqQuestionId: String?,
        immutableSnapshotJson: String,
        sortOrder: Long,
        now: Long,
    ): Boolean {
        require((typeCqQuestionId != null) xor (chapterCqQuestionId != null)) { "A paper item must reference exactly one source question" }
        require(immutableSnapshotJson.isNotBlank()) { "A paper snapshot cannot be empty" }
        return repository.addSnapshotItem(
            PaperQuestionItemsEntity(
                itemId = itemId,
                paperId = paperId,
                sectionId = sectionId,
                typeCqQuestionId = typeCqQuestionId,
                chapterCqQuestionId = chapterCqQuestionId,
                snapshotJson = immutableSnapshotJson,
                sortOrder = sortOrder,
                marksOverride = null,
                createdAt = now,
            )
        )
    }
}
