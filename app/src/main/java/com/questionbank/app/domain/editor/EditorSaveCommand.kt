package com.questionbank.app.domain.editor

import com.questionbank.app.data.local.entity.ChapterCqQuestionBoardsEntity
import com.questionbank.app.data.local.entity.ChapterCqQuestionCategoryLinksEntity
import com.questionbank.app.data.local.entity.ChapterCqQuestionsEntity
import com.questionbank.app.data.local.entity.ChapterCqSolutionPartsEntity
import com.questionbank.app.data.local.entity.ChapterCqStimuliEntity
import com.questionbank.app.data.local.entity.ChapterCqStimulusImagesEntity
import com.questionbank.app.domain.question.BoardsInput
import com.questionbank.app.domain.question.GroupEditInput
import com.questionbank.app.domain.question.QuestionGroupInput
import com.questionbank.app.domain.question.QuestionGroupKey
import java.util.ArrayList
import java.util.Collections
import java.util.LinkedHashMap

/**
 * Immutable save-boundary snapshots for the two editor scopes.
 * Mutable caller-owned collections are copied before repository validation or database work begins.
 * The Room DAO remains the transaction/commit authority; this command is not a second persistence layer.
 */
sealed interface EditorSaveCommand {
    val scope: Scope
    val ownerId: String

    enum class Scope { TYPE_CQ, CHAPTER_CQ }

    data class TypeCqCreate internal constructor(
        val input: QuestionGroupInput,
    ) : EditorSaveCommand {
        override val scope: Scope = Scope.TYPE_CQ
        override val ownerId: String get() = input.topicId
    }

    data class TypeCqEdit internal constructor(
        val input: GroupEditInput,
    ) : EditorSaveCommand {
        override val scope: Scope = Scope.TYPE_CQ
        override val ownerId: String get() = input.topicId
    }

    data class ChapterCqBundle internal constructor(
        val question: ChapterCqQuestionsEntity,
        val stimulus: ChapterCqStimuliEntity?,
        val solutionParts: List<ChapterCqSolutionPartsEntity>,
        val boards: List<ChapterCqQuestionBoardsEntity>,
        val categories: List<ChapterCqQuestionCategoryLinksEntity>,
        val stimulusImages: List<ChapterCqStimulusImagesEntity>?,
        val mustUpdateExisting: Boolean,
        val draftOwnerId: String,
    ) : EditorSaveCommand {
        override val scope: Scope = Scope.CHAPTER_CQ
        override val ownerId: String get() = question.chapterId
    }

    companion object {
        fun typeCqCreate(source: QuestionGroupInput): TypeCqCreate {
            require(source.topicId.isNotBlank()) { "Type_CQ topic ID is required" }
            val snapshot = source.copy(
                subQuestions = immutableList(source.subQuestions.map { it.copy(solutionParts = immutableList(it.solutionParts)) }),
                ratings = source.ratings?.copy(byLabel = immutableMap(source.ratings.byLabel)),
                boards = source.boards?.let { copyBoards(it) },
                categoriesByLabel = immutableMap(source.categoriesByLabel.mapValues { (_, ids) -> immutableList(ids) }),
                stimulusImages = immutableList(source.stimulusImages),
                solutionPartsByLabel = immutableMap(source.solutionPartsByLabel.mapValues { (_, parts) -> immutableList(parts) }),
                stimulusCategoryIds = immutableList(source.stimulusCategoryIds),
            )
            return TypeCqCreate(snapshot)
        }

        fun typeCqEdit(source: GroupEditInput): TypeCqEdit {
            require(source.topicId.isNotBlank()) { "Type_CQ topic ID is required" }
            require(QuestionGroupKey.parse(source.groupKey) != null) { "Type_CQ group key is invalid" }
            val snapshot = source.copy(
                subQuestions = immutableList(source.subQuestions.map { it.copy(solutionParts = immutableList(it.solutionParts)) }),
                ratings = source.ratings?.copy(byLabel = immutableMap(source.ratings.byLabel)),
                boards = source.boards?.let { copyBoards(it) },
                questionTypes = immutableMap(source.questionTypes),
                marksByLabel = immutableMap(source.marksByLabel),
                solutionsByLabel = immutableMap(source.solutionsByLabel.mapValues { (_, parts) -> immutableList(parts) }),
                categoriesByLabel = source.categoriesByLabel?.let { immutableMap(it.mapValues { (_, ids) -> immutableList(ids) }) },
                deletedQuestionIds = Collections.unmodifiableSet(LinkedHashSet(source.deletedQuestionIds)),
                stimulusImages = source.stimulusImages?.let(::immutableList),
                solutionPartsByLabel = source.solutionPartsByLabel?.let { map -> immutableMap(map.mapValues { (_, parts) -> immutableList(parts) }) },
            )
            return TypeCqEdit(snapshot)
        }

        fun chapterCqBundle(
            question: ChapterCqQuestionsEntity,
            stimulus: ChapterCqStimuliEntity?,
            solutionParts: List<ChapterCqSolutionPartsEntity>,
            boards: List<ChapterCqQuestionBoardsEntity>,
            categories: List<ChapterCqQuestionCategoryLinksEntity>,
            stimulusImages: List<ChapterCqStimulusImagesEntity>? = null,
            mustUpdateExisting: Boolean,
            draftOwnerId: String,
        ): ChapterCqBundle {
            require(question.questionId.isNotBlank()) { "Chapter_CQ question ID is required" }
            require(question.chapterId.isNotBlank()) { "Chapter_CQ chapter ID is required" }
            require(draftOwnerId.isNotBlank()) { "Chapter_CQ draft owner is required" }
            require(stimulus == null || stimulus.chapterId == question.chapterId) { "Chapter_CQ stimulus scope mismatch" }
            return ChapterCqBundle(
                question = question,
                stimulus = stimulus,
                solutionParts = immutableList(solutionParts),
                boards = immutableList(boards),
                categories = immutableList(categories),
                stimulusImages = stimulusImages?.let(::immutableList),
                mustUpdateExisting = mustUpdateExisting,
                draftOwnerId = draftOwnerId,
            )
        }

        private fun copyBoards(source: BoardsInput): BoardsInput = source.copy(
            stimulus = immutableList(source.stimulus),
            byLabel = immutableMap(source.byLabel.mapValues { (_, tags) -> immutableList(tags) }),
        )

        private fun <T> immutableList(values: Collection<T>): List<T> =
            Collections.unmodifiableList(ArrayList(values))

        private fun <K, V> immutableMap(values: Map<K, V>): Map<K, V> =
            Collections.unmodifiableMap(LinkedHashMap(values))
    }
}
