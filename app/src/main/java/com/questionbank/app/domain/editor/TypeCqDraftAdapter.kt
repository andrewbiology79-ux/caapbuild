package com.questionbank.app.domain.editor

import com.questionbank.app.domain.question.BoardTag
import com.questionbank.app.domain.question.CqLabel
import com.questionbank.app.domain.question.DraftText
import com.questionbank.app.domain.question.QuestionStimulusImage
import com.questionbank.app.domain.question.QuestionSolutionPart

/** Backward-compatible bridge from the original Type_CQ DraftText shape to the canonical shared schema. */
object TypeCqDraftAdapter {
    fun fromLegacy(
        ownerId: String,
        draft: DraftText,
        mode: EditorMode = EditorMode.MINIMUM,
        existingStimulusId: String? = null,
        existingQuestionIds: List<String> = emptyList(),
        previous: EditorSessionDraft? = null,
        /** Preferred over [existingQuestionIds] when the card has only some of ক খ গ ঘ (list positions would not match labels). */
        questionIdsByLabel: Map<String, String>? = null,
    ): EditorSessionDraft {
        val priorByLabel = previous?.questionBlocks?.associateBy { it.label }.orEmpty()
        val blocks = CqLabel.entries.mapIndexed { index, label ->
            val prior = priorByLabel[label.letter]
            val textParts = draft.solutionTexts.getOrNull(index).orEmpty()
            val requestedParts = draft.solutionPartsByLabel?.getOrNull(index)
            val parts = if (requestedParts != null) {
                requestedParts.sortedBy { it.position }.map { part ->
                    EditorSolutionPart(
                        partId = part.partId,
                        kind = if (part.partType == "IMAGE") EditorPartKind.IMAGE else EditorPartKind.TEXT,
                        position = part.position,
                        text = part.textContent,
                        imageId = part.imageId,
                    )
                }
            } else {
                preserveImageParts(prior?.solutionParts.orEmpty(), textParts, "type_cq:$ownerId:${label.letter}")
            }
            EditorQuestionBlockDraft(
                blockId = prior?.blockId ?: "type_cq:$ownerId:${label.letter}",
                questionId = (if (questionIdsByLabel != null) questionIdsByLabel[label.letter] else existingQuestionIds.getOrNull(index)) ?: prior?.questionId,
                label = label.letter,
                questionText = draft.texts.getOrNull(index).orEmpty(),
                shortAnswer = draft.answers.getOrNull(index).orEmpty(),
                rawMarks = draft.marks.getOrNull(index)?.toString() ?: label.marks.toString(),
                questionTypeId = draft.questionTypeIds.getOrNull(index) ?: label.typeId,
                rating = draft.ratings.getOrNull(index),
                boardYears = draft.boards.getOrNull(index).orEmpty().map { EditorBoardYear(it.boardCode, it.year) },
                categoryIds = prior?.categoryIds.orEmpty(),
                solutionParts = parts,
            )
        }
        val previousStimulus = previous?.stimulus ?: EditorStimulusDraft()
        return EditorSessionDraft(
            scope = EditorScope.TYPE_CQ,
            ownerId = ownerId,
            parentId = ownerId,
            hierarchyIds = previous?.hierarchyIds.orEmpty().ifEmpty { listOf(ownerId) },
            existingStimulusId = existingStimulusId ?: previous?.existingStimulusId,
            existingQuestionIds = (questionIdsByLabel?.values?.toList() ?: existingQuestionIds).ifEmpty { previous?.existingQuestionIds.orEmpty() },
            stimulus = previousStimulus.copy(
                text = draft.stimulus,
                referenceText = draft.referenceText,
                rating = draft.stimulusRating,
                boardYears = draft.stimulusBoards.map { EditorBoardYear(it.boardCode, it.year) },
                images = draft.stimulusImages?.map {
                    EditorImageRef(it.imageId, it.placement, it.position)
                } ?: previousStimulus.images,
            ),
            questionBlocks = blocks,
            deletedQuestionIds = previous?.deletedQuestionIds.orEmpty(),
            mode = mode,
            preservedJson = previous?.preservedJson,
        )
    }

    fun toLegacy(draft: EditorSessionDraft): DraftText {
        val rows = draft.questionBlocks.associateBy { it.label }
        return DraftText(
            stimulus = draft.stimulus.text,
            texts = CqLabel.entries.map { rows[it.letter]?.questionText.orEmpty() },
            answers = CqLabel.entries.map { rows[it.letter]?.shortAnswer.orEmpty() },
            stimulusRating = draft.stimulus.rating,
            ratings = CqLabel.entries.map { rows[it.letter]?.rating },
            stimulusBoards = draft.stimulus.boardYears.map { BoardTag(it.boardCode, it.year) },
            boards = CqLabel.entries.map { label -> rows[label.letter]?.boardYears.orEmpty().map { BoardTag(it.boardCode, it.year) } },
            referenceText = draft.stimulus.referenceText,
            questionTypeIds = CqLabel.entries.map { rows[it.letter]?.questionTypeId ?: it.typeId },
            marks = CqLabel.entries.map { label -> rows[label.letter]?.rawMarks?.toDoubleOrNull() ?: label.marks },
            solutionTexts = CqLabel.entries.map { label -> rows[label.letter]?.solutionParts.orEmpty().filter { it.kind == EditorPartKind.TEXT }.sortedBy { it.position }.mapNotNull { it.text } },
            stimulusImages = draft.stimulus.images.sortedBy { it.position }.map { QuestionStimulusImage(it.imageId, it.placement, it.position) },
            solutionPartsByLabel = CqLabel.entries.map { label ->
                rows[label.letter]?.solutionParts.orEmpty().sortedBy { it.position }.map { part ->
                    QuestionSolutionPart(part.partId, part.kind.name, part.position, part.text, part.imageId)
                }
            },
        )
    }

    private fun preserveImageParts(
        old: List<EditorSolutionPart>,
        texts: List<String>,
        stablePrefix: String,
    ): List<EditorSolutionPart> {
        val result = mutableListOf<EditorSolutionPart>()
        var textIndex = 0
        old.sortedBy { it.position }.forEach { part ->
            if (part.kind == EditorPartKind.IMAGE) result += part
            else if (textIndex < texts.size) {
                result += part.copy(text = texts[textIndex], position = result.size.toLong())
                textIndex++
            }
        }
        while (textIndex < texts.size) {
            result += EditorSolutionPart(
                partId = "$stablePrefix:solution:$textIndex",
                kind = EditorPartKind.TEXT,
                position = result.size.toLong(),
                text = texts[textIndex],
            )
            textIndex++
        }
        return result.mapIndexed { index, part -> part.copy(position = index.toLong()) }
    }
}
