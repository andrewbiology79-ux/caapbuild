package com.questionbank.app.domain.editor

/** Single observable state shape for both editor scopes. UI-only state is deliberately kept outside the saved rows. */
data class EditorSessionState(
    val draft: EditorSessionDraft,
    val isLoading: Boolean = false,
    val isSaving: Boolean = false,
    val isDirty: Boolean = false,
    val duplicateWarning: Boolean = false,
    val validationErrors: Map<String, String> = emptyMap(),
    val scrollToField: String? = null,
    val saveError: String? = null,
    val saveCompleted: Boolean = false,
)

sealed interface EditorSessionEvent {
    data class SetMode(val mode: EditorMode) : EditorSessionEvent
    data class SetStimulusText(val value: String) : EditorSessionEvent
    data class SetReferenceText(val value: String) : EditorSessionEvent
    data class SetStimulusRating(val value: Int?) : EditorSessionEvent
    data class SetBlocks(val blocks: List<EditorQuestionBlockDraft>) : EditorSessionEvent
    data class UpdateBlock(val blockId: String, val transform: (EditorQuestionBlockDraft) -> EditorQuestionBlockDraft) : EditorSessionEvent
    data class AddBlock(val block: EditorQuestionBlockDraft, val index: Int? = null) : EditorSessionEvent
    data class RemoveBlock(val blockId: String) : EditorSessionEvent
    data class MoveBlock(val from: Int, val to: Int) : EditorSessionEvent
    data class SetValidationErrors(val errors: Map<String, String>) : EditorSessionEvent
    data object RequestScrollToFirstError : EditorSessionEvent
    data class SetDuplicateWarning(val visible: Boolean) : EditorSessionEvent
    data object SaveStarted : EditorSessionEvent
    data object SaveSucceeded : EditorSessionEvent
    data class SaveFailed(val message: String) : EditorSessionEvent
    data object ResetDirty : EditorSessionEvent
    data class SetLoading(val loading: Boolean) : EditorSessionEvent
}

/** Pure reducer: all draft changes are immutable and hidden fields remain on the draft object. */
object EditorSessionReducer {
    fun reduce(state: EditorSessionState, event: EditorSessionEvent): EditorSessionState {
        // SaveFailed must pass while saving, otherwise a failed save leaves isSaving=true forever.
        val allowedWhileSaving = event is EditorSessionEvent.SaveSucceeded ||
            event is EditorSessionEvent.SaveFailed ||
            event == EditorSessionEvent.ResetDirty
        if (state.isSaving && !allowedWhileSaving) return state
        return when (event) {
            is EditorSessionEvent.SetMode -> state.copy(draft = state.draft.copy(mode = event.mode), saveError = null)
            is EditorSessionEvent.SetStimulusText -> changed(state, state.draft.copy(stimulus = state.draft.stimulus.copy(text = event.value)))
            is EditorSessionEvent.SetReferenceText -> changed(state, state.draft.copy(stimulus = state.draft.stimulus.copy(referenceText = event.value)))
            is EditorSessionEvent.SetStimulusRating -> changed(state, state.draft.copy(stimulus = state.draft.stimulus.copy(rating = event.value)))
            is EditorSessionEvent.SetBlocks -> changed(state, state.draft.copy(questionBlocks = event.blocks))
            is EditorSessionEvent.UpdateBlock -> {
                if (state.draft.questionBlocks.none { it.blockId == event.blockId }) state
                else changed(state, state.draft.copy(questionBlocks = state.draft.questionBlocks.map { if (it.blockId == event.blockId) event.transform(it) else it }))
            }
            is EditorSessionEvent.AddBlock -> {
                if (state.draft.questionBlocks.any { it.blockId == event.block.blockId }) state
                else {
                    val rows = state.draft.questionBlocks.toMutableList()
                    val index = (event.index ?: rows.size).coerceIn(0, rows.size)
                    rows.add(index, event.block)
                    changed(state, state.draft.copy(questionBlocks = rows))
                }
            }
            is EditorSessionEvent.RemoveBlock -> {
                val row = state.draft.questionBlocks.firstOrNull { it.blockId == event.blockId } ?: return state
                val rows = state.draft.questionBlocks.filterNot { it.blockId == event.blockId }
                val deleted = row.questionId?.let { state.draft.deletedQuestionIds + it } ?: state.draft.deletedQuestionIds
                changed(state, state.draft.copy(questionBlocks = rows, deletedQuestionIds = deleted))
            }
            is EditorSessionEvent.MoveBlock -> {
                val rows = state.draft.questionBlocks.toMutableList()
                if (event.from !in rows.indices || event.to !in rows.indices || event.from == event.to) state
                else {
                    val moving = rows.removeAt(event.from)
                    rows.add(event.to, moving)
                    changed(state, state.draft.copy(questionBlocks = rows))
                }
            }
            is EditorSessionEvent.SetValidationErrors -> state.copy(
                validationErrors = event.errors,
                scrollToField = event.errors.keys.firstOrNull(),
            )
            EditorSessionEvent.RequestScrollToFirstError -> state.copy(scrollToField = state.validationErrors.keys.firstOrNull())
            is EditorSessionEvent.SetDuplicateWarning -> state.copy(duplicateWarning = event.visible)
            EditorSessionEvent.SaveStarted -> if (state.isSaving) state else state.copy(isSaving = true, saveError = null, saveCompleted = false)
            EditorSessionEvent.SaveSucceeded -> state.copy(isSaving = false, isDirty = false, validationErrors = emptyMap(), scrollToField = null, saveError = null, saveCompleted = true)
            is EditorSessionEvent.SaveFailed -> state.copy(isSaving = false, isDirty = true, saveError = event.message, saveCompleted = false)
            EditorSessionEvent.ResetDirty -> state.copy(isDirty = false, validationErrors = emptyMap(), scrollToField = null, saveError = null, saveCompleted = false)
            is EditorSessionEvent.SetLoading -> state.copy(isLoading = event.loading)
        }
    }

    private fun changed(state: EditorSessionState, draft: EditorSessionDraft) = state.copy(
        draft = draft,
        isDirty = true,
        validationErrors = emptyMap(),
        scrollToField = null,
        saveError = null,
        saveCompleted = false,
    )
}

/** Bounded command history for immutable session drafts; editing after undo truncates the redo branch. */
class EditorSessionHistory(initial: EditorSessionDraft, private val capacity: Int = 80) {
    private val entries = mutableListOf(initial)
    private var cursor = 0
    val canUndo: Boolean get() = cursor > 0
    val canRedo: Boolean get() = cursor < entries.lastIndex

    fun record(value: EditorSessionDraft) {
        if (entries[cursor] == value) return
        while (entries.lastIndex > cursor) entries.removeAt(entries.lastIndex)
        entries.add(value)
        if (entries.size > capacity.coerceAtLeast(2)) entries.removeAt(0)
        cursor = entries.lastIndex
    }

    fun undo(): EditorSessionDraft? = if (!canUndo) null else entries[--cursor]
    fun redo(): EditorSessionDraft? = if (!canRedo) null else entries[++cursor]
    fun reset(value: EditorSessionDraft) { entries.clear(); entries.add(value); cursor = 0 }
}
