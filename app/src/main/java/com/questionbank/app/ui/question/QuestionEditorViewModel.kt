package com.questionbank.app.ui.question

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.questionbank.app.domain.question.AddBoardResult
import com.questionbank.app.domain.question.BoardItem
import com.questionbank.app.domain.question.BoardTag
import com.questionbank.app.domain.question.BoardsInput
import com.questionbank.app.domain.question.CqLabel
import com.questionbank.app.domain.question.DraftText
import com.questionbank.app.domain.question.QuestionGroupInput
import com.questionbank.app.domain.question.RatingsInput
import com.questionbank.app.domain.question.SaveResult
import com.questionbank.app.domain.question.SubQuestionInput
import com.questionbank.app.domain.question.TypeCqQuestionRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.delay

/** Draft state shown under the title. */
enum class DraftStatus { NONE, WAITING, SAVED }

/**
 * Editor state lives in Compose snapshot state (not a Flow) so typing never races with the keyboard.
 *
 * Draft: every change is queued to a writer that runs in [draftScope] (the application scope), NOT in viewModelScope, so
 * leaving the screen or closing the app never cancels the last write. The queue is conflated: while one write is running
 * only the newest text waits, so typing is never slowed down and no text is lost.
 *
 * Save: the draft writer is stopped first (no draft write can overlap or follow the save), everything is saved in one
 * transaction (the repository removes the draft in that same transaction), and on any failure the writer is restarted and
 * the typed text is written as a draft again at once. The fields are cleared only after SaveResult.Saved.
 */
class QuestionEditorViewModel(
    private val topicId: String,
    private val repository: TypeCqQuestionRepository,
    private val draftScope: CoroutineScope,
    questionTypesFlow: Flow<List<com.questionbank.app.data.local.entity.TypeCqQuestionTypesEntity>> = flowOf(emptyList()),
    private val duplicateChecker: suspend (String) -> Boolean = { false },
) : ViewModel() {

    var loaded by mutableStateOf(false)
        private set
    var draft by mutableStateOf(DraftText())
        private set
    var draftStatus by mutableStateOf(DraftStatus.NONE)
        private set
    var saving by mutableStateOf(false)
        private set
    var result by mutableStateOf<SaveResult?>(null)
        private set
    var restoredFromDraft by mutableStateOf(false)
        private set
    var editorMode by mutableStateOf(EditorMode.MINIMUM)
        private set
    var duplicateWarning by mutableStateOf(false)
        private set
    var checkingDuplicate by mutableStateOf(false)
        private set
    private val history = EditorHistory(DraftText())
    private var duplicateJob: Job? = null
    val canUndo: Boolean get() = history.canUndo
    val canRedo: Boolean get() = history.canRedo

    /** v0.2.30c-2: the board catalog for the picker (built-in boards and the custom ones). */
    val boardCatalog: StateFlow<List<BoardItem>> =
        repository.observeBoards().stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val questionTypeLabels: StateFlow<Map<String, String>> = questionTypesFlow.map { rows -> rows.associate { it.questionTypeId to it.label } }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyMap())

    private var pending = Channel<DraftText>(Channel.CONFLATED)
    private var writer: Job? = null

    init {
        startWriter()
        viewModelScope.launch {
            val stored = repository.loadDraft(topicId)
            if (stored != null && !stored.isBlank) {
                draft = stored
                history.reset(stored)
                restoredFromDraft = true
                draftStatus = DraftStatus.SAVED
            }
            loaded = true
            scheduleDuplicateCheck()
        }
    }

    private fun startWriter() {
        val queue = Channel<DraftText>(Channel.CONFLATED)
        pending = queue
        writer = draftScope.launch {
            for (text in queue) {
                repository.saveDraft(topicId, text)
                if (text == draft) draftStatus = if (text.isBlank) DraftStatus.NONE else DraftStatus.SAVED
            }
        }
    }

    fun setStimulus(value: String) = change(draft.copy(stimulus = value), "stimulus")
    fun setReferenceText(value: String) = change(draft.copy(referenceText = value), "reference")
    fun setQuestionType(index: Int, value: String) = change(draft.copy(questionTypeIds = draft.questionTypeIds.toMutableList().also { it[index] = value }), "type-$index")
    fun setMarks(index: Int, value: Double) = change(draft.copy(marks = draft.marks.toMutableList().also { it[index] = value }), "marks-$index")
    fun setSolutionText(index: Int, part: Int, value: String) = change(
        draft.copy(solutionTexts = draft.solutionTexts.toMutableList().also { rows -> rows[index] = rows[index].toMutableList().also { it[part] = value } }),
        "solution-$index-$part",
    )
    fun addSolutionText(index: Int) = change(
        draft.copy(solutionTexts = draft.solutionTexts.toMutableList().also { rows -> rows[index] = rows[index] + "" }),
        "solution-add-$index",
    )
    fun removeSolutionText(index: Int, part: Int) = change(
        draft.copy(solutionTexts = draft.solutionTexts.toMutableList().also { rows -> rows[index] = rows[index].toMutableList().also { it.removeAt(part) } }),
        "solution-remove-$index",
    )
    fun moveSolutionText(index: Int, from: Int, to: Int) {
        val current = draft.solutionTexts[index]
        if (from !in current.indices || to !in current.indices || from == to) return
        val moved = current.toMutableList().also { row -> val item = row.removeAt(from); row.add(to, item) }
        change(draft.copy(solutionTexts = draft.solutionTexts.toMutableList().also { it[index] = moved }), "solution-order-$index")
    }

    fun setText(index: Int, value: String) =
        change(draft.copy(texts = draft.texts.toMutableList().also { it[index] = value }), "question-$index")
            .also { scheduleDuplicateCheck() }

    fun setAnswer(index: Int, value: String) =
        change(draft.copy(answers = draft.answers.toMutableList().also { it[index] = value }), "answer-$index")

    /** v0.2.30b: [value] 1-5, or null to clear. */
    fun changeStimulusRating(value: Int?) = change(draft.copy(stimulusRating = value), "stimulus-rating")

    fun changeRating(index: Int, value: Int?) =
        change(draft.copy(ratings = draft.ratings.toMutableList().also { it[index] = value }), "rating-$index")

    /** v0.2.30c-2: the full wanted tag list of the stimulus / of ক..ঘ (an empty list clears). */
    fun changeStimulusBoards(value: List<BoardTag>) = change(draft.copy(stimulusBoards = value), "stimulus-boards")

    fun changeBoards(index: Int, value: List<BoardTag>) =
        change(draft.copy(boards = draft.boards.toMutableList().also { it[index] = value }), "boards-$index")

    suspend fun addBoard(code: String, name: String): AddBoardResult = repository.addCustomBoard(code, name)

    fun clearAll() = change(DraftText(), "clear")

    @JvmName("applyEditorMode")
    fun setEditorMode(mode: EditorMode) { editorMode = mode }

    fun undo() {
        if (saving || !loaded) return
        history.undo()?.let { applyHistory(it) }
    }

    fun redo() {
        if (saving || !loaded) return
        history.redo()?.let { applyHistory(it) }
    }

    private fun applyHistory(value: DraftText) {
        draft = value
        result = null
        restoredFromDraft = false
        draftStatus = DraftStatus.WAITING
        pending.trySend(value)
        scheduleDuplicateCheck()
    }

    private fun scheduleDuplicateCheck() {
        duplicateJob?.cancel()
        val current = draft.texts.filter { it.isNotBlank() }
        if (current.isEmpty()) {
            duplicateJob = null
            checkingDuplicate = false
            duplicateWarning = false
            return
        }
        checkingDuplicate = true
        val checkJob = viewModelScope.launch {
            val thisJob = coroutineContext[Job]
            try {
                delay(350)
                val found = current.any { text -> duplicateChecker(text) }
                coroutineContext.ensureActive()
                if (duplicateJob === thisJob) duplicateWarning = found
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                if (duplicateJob === thisJob) duplicateWarning = false
            } finally {
                // An older cancelled query must not hide the spinner for a newer query.
                if (duplicateJob === thisJob) checkingDuplicate = false
            }
        }
        duplicateJob = checkJob
    }

    fun dismissResult() {
        result = null
    }

    private fun change(next: DraftText, historyGroup: String) {
        if (saving || !loaded) return
        history.record(next, historyGroup)
        draft = next
        result = null
        restoredFromDraft = false
        draftStatus = DraftStatus.WAITING
        pending.trySend(next)
    }

    fun save(onSaved: () -> Unit) {
        if (saving || !loaded) return
        saving = true
        val snapshot = draft
        viewModelScope.launch {
            pending.close()
            writer?.cancelAndJoin()
            // NonCancellable: if the person leaves the screen while saving, the transaction still finishes (it is atomic either way).
            val outcome = withContext(NonCancellable) {
                repository.saveGroup(
                    QuestionGroupInput(
                        topicId = topicId,
                        stimulusText = snapshot.stimulus,
                        referenceText = snapshot.referenceText,
                        subQuestions = CqLabel.entries.mapIndexed { i, label ->
                            SubQuestionInput(
                                label, snapshot.texts[i], snapshot.answers[i],
                                snapshot.questionTypeIds[i], snapshot.marks[i], snapshot.solutionTexts[i],
                            )
                        },
                        ratings = RatingsInput(
                            stimulus = snapshot.stimulusRating,
                            byLabel = CqLabel.entries.mapIndexed { i, label -> label to snapshot.ratings[i] }.toMap(),
                        ),
                        boards = BoardsInput(
                            stimulus = snapshot.stimulusBoards,
                            byLabel = CqLabel.entries.mapIndexed { i, label -> label to snapshot.boards[i] }.toMap(),
                        ),
                    )
                )
            }
            if (outcome is SaveResult.Saved) {
                draft = DraftText()
                history.reset(draft)
                duplicateWarning = false
                checkingDuplicate = false
                draftStatus = DraftStatus.NONE
                result = outcome
                startWriter()
                saving = false
                if (isActive) onSaved()
            } else {
                // Nothing was stored: keep every typed character and write the draft again right now.
                result = outcome
                startWriter()
                withContext(NonCancellable) { repository.saveDraft(topicId, snapshot) }
                draftStatus = DraftStatus.SAVED
                saving = false
            }
        }
    }

    override fun onCleared() {
        // Let the writer finish the newest queued text, then stop. It runs in the application scope, so it is not cancelled.
        duplicateJob?.cancel()
        pending.close()
        super.onCleared()
    }

    companion object {
        fun factory(create: () -> QuestionEditorViewModel) = viewModelFactory { initializer { create() } }
    }
}
