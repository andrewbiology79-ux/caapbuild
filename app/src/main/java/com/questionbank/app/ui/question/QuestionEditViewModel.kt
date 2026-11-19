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
import com.questionbank.app.domain.question.GroupEditInput
import com.questionbank.app.domain.question.QuestionEditRules
import com.questionbank.app.domain.question.RatingsInput
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.domain.question.SubQuestionInput
import com.questionbank.app.domain.question.TypeCqQuestionRepository
import com.questionbank.app.domain.question.UpdateResult
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class EditLoad { LOADING, READY, MISSING }

/** One queued draft write: [text] null means "remove the draft" (the typed text equals the stored text again, or it was discarded). */
private class EditDraftOp(val text: DraftText?)

private data class EditSnapshot(
    val stimulus: String = "",
    val referenceText: String = "",
    val texts: List<String> = List(4) { "" },
    val answers: List<String> = List(4) { "" },
    val ratings: List<Int?> = List(4) { null },
    val stimulusRating: Int? = null,
    val boards: List<List<BoardTag>> = List(4) { emptyList() },
    val stimulusBoards: List<BoardTag> = emptyList(),
    val questionTypeIds: List<String> = CqLabel.entries.map { it.typeId },
    val marks: List<Double> = CqLabel.entries.map { it.marks },
    val solutionTexts: List<List<String>> = List(4) { emptyList() },
)

/**
 * Edit screen of ONE existing card (v0.2.28 core, v0.2.29 drafts). The stored texts are loaded once; what the person types lives
 * in Compose snapshot state (typing never races with the keyboard, same choice as the new-question editor).
 *
 * Edit draft (v0.2.29, part B-2): every change is queued to a writer that runs in [draftScope] (the application scope), NOT in
 * viewModelScope, so leaving the screen or killing the app never cancels the last write. The queue is conflated: only the newest
 * text waits. The draft is stored under `draft:type_cq:edit:<groupKey>`; it exists only while the typed text differs from the
 * stored text. When the edit is opened again the draft is put back on top of the stored text (a draft equal to the stored text is
 * removed instead). Nothing of this touches the saved question: a draft is separate from the question rows.
 *
 * Save is still ONE all-or-nothing transaction ([TypeCqQuestionRepository.updateGroup]) that also removes the draft. The draft
 * writer is stopped first, so no draft write can follow the save; on a refusal or failure the writer is restarted and the typed
 * text is written as a draft again at once. "Discard" stops the writer, removes the draft and leaves.
 */
class QuestionEditViewModel(
    private val topicId: String,
    private val groupKey: String,
    private val repository: TypeCqQuestionRepository,
    private val draftScope: CoroutineScope,
    questionTypesFlow: Flow<List<com.questionbank.app.data.local.entity.TypeCqQuestionTypesEntity>> = flowOf(emptyList()),
) : ViewModel() {

    var load by mutableStateOf(EditLoad.LOADING)
        private set
    var original by mutableStateOf<SavedGroup?>(null)
        private set
    var stimulus by mutableStateOf("")
        private set
    var referenceText by mutableStateOf("")
        private set
    var questionTypeIds by mutableStateOf(CqLabel.entries.map { it.typeId })
        private set
    var marks by mutableStateOf(CqLabel.entries.map { it.marks })
        private set
    var solutionTexts by mutableStateOf(List(4) { emptyList<String>() })
        private set
    var editorMode by mutableStateOf(EditorMode.MINIMUM)
        private set
    private val history = EditorHistory(EditSnapshot())
    val canUndo: Boolean get() = history.canUndo
    val canRedo: Boolean get() = history.canRedo
    var texts by mutableStateOf(List(4) { "" })
        private set
    var answers by mutableStateOf(List(4) { "" })
        private set
    /** v0.2.30b: the stimulus rating and the rating of ক..ঘ as typed (1-5 or null = none). Changed with [changeStimulusRating] / [changeRating]. */
    var stimulusRating by mutableStateOf<Int?>(null)
        private set
    var ratings by mutableStateOf(List<Int?>(4) { null })
        private set
    /** v0.2.30c-2: boards and years of the stimulus and of ক..ঘ as typed, in the order chosen. Changed with [changeStimulusBoards] / [changeBoards]. */
    var stimulusBoards by mutableStateOf<List<BoardTag>>(emptyList())
        private set
    var boards by mutableStateOf<List<List<BoardTag>>>(List(4) { emptyList() })
        private set
    /** The board catalog for the picker. */
    val boardCatalog: StateFlow<List<BoardItem>> =
        repository.observeBoards().stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val questionTypeLabels: StateFlow<Map<String, String>> = questionTypesFlow.map { rows -> rows.associate { it.questionTypeId to it.label } }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyMap())
    var saving by mutableStateOf(false)
        private set
    var result by mutableStateOf<UpdateResult?>(null)
        private set
    /** True when the typed text came back from a saved edit draft; stays true until the first new change. */
    var restoredFromDraft by mutableStateOf(false)
        private set
    var draftStatus by mutableStateOf(DraftStatus.NONE)
        private set

    private var pending = Channel<EditDraftOp>(Channel.CONFLATED)
    private var writer: Job? = null
    /** Set after a successful save or a discard: the screen is finished and no draft may be written any more. */
    private var finished = false

    init {
        viewModelScope.launch {
            val group = repository.loadGroup(topicId, groupKey)
            if (group == null) {
                // The card is gone: an old draft for it can never be used again.
                repository.discardEditDraft(groupKey)
                load = EditLoad.MISSING
            } else {
                val t = MutableList(4) { "" }
                val a = MutableList(4) { "" }
                val r = MutableList<Int?>(4) { null }
                val b = MutableList<List<BoardTag>>(4) { emptyList() }
                for (sub in group.subQuestions) {
                    val label = sub.label ?: continue
                    t[label.sortOrder - 1] = sub.text
                    a[label.sortOrder - 1] = sub.shortAnswer
                    r[label.sortOrder - 1] = sub.rating
                    b[label.sortOrder - 1] = sub.boards
                }
                original = group
                stimulus = group.stimulusText
                referenceText = group.referenceText
                texts = t
                answers = a
                stimulusRating = group.stimulusRating
                ratings = r
                stimulusBoards = group.stimulusBoards
                boards = b
                val typeRows = CqLabel.entries.map { label -> group.subQuestions.firstOrNull { it.label == label }?.questionTypeId ?: label.typeId }
                val markRows = CqLabel.entries.map { label -> group.subQuestions.firstOrNull { it.label == label }?.marks ?: label.marks }
                val solutionRows = CqLabel.entries.map { label -> group.subQuestions.firstOrNull { it.label == label }?.solutionParts.orEmpty() }
                questionTypeIds = typeRows
                marks = markRows
                solutionTexts = solutionRows
                load = EditLoad.READY
                restoreDraft(group)
                history.reset(snapshot())
                startWriter()
            }
        }
    }

    /** Puts a saved edit draft on top of the stored text. Only the blocks this screen can edit are taken from it. */
    private suspend fun restoreDraft(group: SavedGroup) {
        val stored = repository.loadEditDraft(groupKey) ?: return
        if (group.stimulusId != null) {
            stimulus = stored.stimulus
            referenceText = stored.referenceText
            stimulusRating = stored.stimulusRating
            stimulusBoards = stored.stimulusBoards
        }
        val t = texts.toMutableList()
        val a = answers.toMutableList()
        val r = ratings.toMutableList()
        val b = boards.toMutableList()
        val qTypes = questionTypeIds.toMutableList()
        val markValues = marks.toMutableList()
        val solutionValues = solutionTexts.toMutableList()
        for (label in editableLabels) {
            val i = label.sortOrder - 1
            t[i] = stored.texts[i]
            a[i] = stored.answers[i]
            r[i] = stored.ratings[i]
            b[i] = stored.boards[i]
            qTypes[i] = stored.questionTypeIds[i]
            markValues[i] = stored.marks[i]
            solutionValues[i] = stored.solutionTexts[i]
        }
        texts = t
        answers = a
        ratings = r
        boards = b
        questionTypeIds = qTypes
        marks = markValues
        solutionTexts = solutionValues
        if (changed) {
            restoredFromDraft = true
            draftStatus = DraftStatus.SAVED
        } else {
            // The draft says the same as the stored question (for example the same text was typed back): nothing to keep.
            repository.discardEditDraft(groupKey)
        }
    }

    private fun startWriter() {
        val queue = Channel<EditDraftOp>(Channel.CONFLATED)
        pending = queue
        writer = draftScope.launch {
            for (op in queue) {
                val text = op.text
                if (text == null) repository.discardEditDraft(groupKey) else repository.saveEditDraft(groupKey, text)
                if (text == currentDraft()) draftStatus = if (text == null) DraftStatus.NONE else DraftStatus.SAVED
            }
        }
    }

    /** The typed text as a draft, or null while it equals the stored text. */
    private fun currentDraft(): DraftText? = if (changed) draftOf() else null

    private fun draftOf(): DraftText =
        DraftText(
            stimulus = stimulus, texts = texts, answers = answers, stimulusRating = stimulusRating, ratings = ratings,
            stimulusBoards = stimulusBoards, boards = boards, referenceText = referenceText,
            questionTypeIds = questionTypeIds, marks = marks, solutionTexts = solutionTexts,
        )

    private fun queueDraft() {
        if (finished || load != EditLoad.READY) return
        restoredFromDraft = false
        draftStatus = DraftStatus.WAITING
        pending.trySend(EditDraftOp(currentDraft()))
    }

    /** True for a card with a stimulus: all four blocks and the stimulus can be edited. A single question edits only its own block. */
    val hasStimulus: Boolean get() = original?.stimulusId != null

    /** The sub-question blocks shown on the screen, in label order. */
    val editableLabels: List<CqLabel>
        get() {
            val group = original ?: return emptyList()
            if (group.stimulusId != null) return CqLabel.entries
            return group.subQuestions.mapNotNull { it.label }
        }

    private fun buildInput(): GroupEditInput =
        GroupEditInput(
            topicId = topicId,
            groupKey = groupKey,
            stimulusText = stimulus,
            subQuestions = editableLabels.map { label ->
                val i = label.sortOrder - 1
                SubQuestionInput(label, texts[i], answers[i], questionTypeIds[i], marks[i], solutionTexts[i])
            },
            // The ratings of exactly the blocks this screen shows; the stimulus rating only for a card that has a stimulus.
            ratings = RatingsInput(
                stimulus = if (hasStimulus) stimulusRating else null,
                byLabel = editableLabels.associateWith { ratings[it.sortOrder - 1] },
            ),
            // The tags of exactly the blocks this screen shows; the stimulus tags only for a card that has a stimulus.
            boards = BoardsInput(
                stimulus = if (hasStimulus) stimulusBoards else emptyList(),
                byLabel = editableLabels.associateWith { boards[it.sortOrder - 1] },
            ),
            referenceText = if (hasStimulus) referenceText else null,
            questionTypes = editableLabels.associateWith { questionTypeIds[it.sortOrder - 1] },
            marksByLabel = editableLabels.associateWith { marks[it.sortOrder - 1] },
            solutionsByLabel = editableLabels.associateWith { solutionTexts[it.sortOrder - 1] },
        )

    private fun snapshot() = EditSnapshot(
        stimulus, referenceText, texts, answers, ratings, stimulusRating, boards, stimulusBoards,
        questionTypeIds, marks, solutionTexts,
    )

    private fun record(group: String) { history.record(snapshot(), group) }

    private fun applySnapshot(value: EditSnapshot) {
        stimulus = value.stimulus; referenceText = value.referenceText; texts = value.texts; answers = value.answers
        ratings = value.ratings; stimulusRating = value.stimulusRating; boards = value.boards; stimulusBoards = value.stimulusBoards
        questionTypeIds = value.questionTypeIds; marks = value.marks; solutionTexts = value.solutionTexts
        result = null
        queueDraft()
    }

    fun setEditorMode(mode: EditorMode) { editorMode = mode }
    fun undo() { if (!saving && !finished) history.undo()?.let(::applySnapshot) }
    fun redo() { if (!saving && !finished) history.redo()?.let(::applySnapshot) }

    /** True when the typed text differs from what is stored (after the same cleaning a save does). Blanking something counts as a change. */
    val changed: Boolean
        get() {
            val group = original ?: return false
            return QuestionEditRules.check(group, buildInput()) != QuestionEditRules.Checked.NoChange
        }

    fun changeStimulus(value: String) {
        if (saving || finished) return
        stimulus = value
        record("stimulus")
        result = null
        queueDraft()
    }

    fun setText(label: CqLabel, value: String) {
        if (saving || finished) return
        texts = texts.toMutableList().also { it[label.sortOrder - 1] = value }
        record("question-${label.sortOrder}")
        result = null
        queueDraft()
    }

    fun setAnswer(label: CqLabel, value: String) {
        if (saving || finished) return
        answers = answers.toMutableList().also { it[label.sortOrder - 1] = value }
        record("answer-${label.sortOrder}")
        result = null
        queueDraft()
    }

    /** [value] 1-5, or null to clear. Only meaningful for a card with a stimulus (the screen shows the buttons only then). */
    fun changeStimulusRating(value: Int?) {
        if (saving || finished) return
        stimulusRating = value
        record("stimulus-rating")
        result = null
        queueDraft()
    }

    fun changeRating(label: CqLabel, value: Int?) {
        if (saving || finished) return
        ratings = ratings.toMutableList().also { it[label.sortOrder - 1] = value }
        record("rating-${label.sortOrder}")
        result = null
        queueDraft()
    }

    /** The full wanted tag list of the stimulus (an empty list clears). Only meaningful for a card with a stimulus. */
    fun changeStimulusBoards(value: List<BoardTag>) {
        if (saving || finished) return
        stimulusBoards = value
        record("stimulus-boards")
        result = null
        queueDraft()
    }

    fun changeBoards(label: CqLabel, value: List<BoardTag>) {
        if (saving || finished) return
        boards = boards.toMutableList().also { it[label.sortOrder - 1] = value }
        record("boards-${label.sortOrder}")
        result = null
        queueDraft()
    }

    fun changeReferenceText(value: String) { if (saving || finished || !hasStimulus) return; referenceText = value; record("reference"); result = null; queueDraft() }
    fun changeQuestionType(label: CqLabel, value: String) { if (saving || finished) return; questionTypeIds = questionTypeIds.toMutableList().also { it[label.sortOrder - 1] = value }; record("type-${label.sortOrder}"); result = null; queueDraft() }
    fun changeMarks(label: CqLabel, value: Double) { if (saving || finished || !value.isFinite() || value <= 0.0) return; marks = marks.toMutableList().also { it[label.sortOrder - 1] = value }; record("marks-${label.sortOrder}"); result = null; queueDraft() }
    fun changeSolutionText(label: CqLabel, part: Int, value: String) { if (saving || finished) return; solutionTexts = solutionTexts.toMutableList().also { rows -> rows[label.sortOrder - 1] = rows[label.sortOrder - 1].toMutableList().also { it[part] = value } }; record("solution-${label.sortOrder}-$part"); result = null; queueDraft() }
    fun addSolutionText(label: CqLabel) { if (saving || finished) return; solutionTexts = solutionTexts.toMutableList().also { rows -> rows[label.sortOrder - 1] = rows[label.sortOrder - 1] + "" }; record("solution-add-${label.sortOrder}"); result = null; queueDraft() }
    fun removeSolutionText(label: CqLabel, part: Int) { if (saving || finished) return; solutionTexts = solutionTexts.toMutableList().also { rows -> rows[label.sortOrder - 1] = rows[label.sortOrder - 1].toMutableList().also { if (part in it.indices) it.removeAt(part) } }; record("solution-remove-${label.sortOrder}"); result = null; queueDraft() }
    fun moveSolutionText(label: CqLabel, from: Int, to: Int) {
        if (saving || finished) return
        val i = label.sortOrder - 1
        val current = solutionTexts[i]
        if (from !in current.indices || to !in current.indices || from == to) return
        val moved = current.toMutableList().also { row -> val item = row.removeAt(from); row.add(to, item) }
        solutionTexts = solutionTexts.toMutableList().also { it[i] = moved }
        record("solution-order-${label.sortOrder}"); result = null; queueDraft()
    }

    suspend fun addBoard(code: String, name: String): AddBoardResult = repository.addCustomBoard(code, name)

    fun save(onSaved: () -> Unit) {
        if (saving || finished || load != EditLoad.READY) return
        saving = true
        result = null
        val input = buildInput()
        val snapshot = draftOf()
        viewModelScope.launch {
            // No draft write may run or follow the save: stop the writer first.
            pending.close()
            writer?.cancelAndJoin()
            // NonCancellable: if the person leaves while saving, the transaction still finishes (it is atomic either way).
            val outcome = withContext(NonCancellable) { repository.updateGroup(input) }
            result = outcome
            if (outcome is UpdateResult.Updated) {
                // The repository removed the draft in the same transaction.
                finished = true
                draftStatus = DraftStatus.NONE
                saving = false
                if (isActive) onSaved()
            } else {
                // Nothing was stored: keep every typed character and write the draft again right now.
                startWriter()
                if (outcome != UpdateResult.NoChange && outcome != UpdateResult.GroupMissing) {
                    withContext(NonCancellable) { repository.saveEditDraft(groupKey, snapshot) }
                    draftStatus = DraftStatus.SAVED
                }
                saving = false
            }
        }
    }

    /** "Discard" (the person chose to throw the typed changes away): stops the writer, removes the draft, then calls [onDone]. */
    fun discard(onDone: () -> Unit) {
        if (saving || finished) return
        finished = true
        viewModelScope.launch {
            pending.close()
            writer?.cancelAndJoin()
            withContext(NonCancellable) { repository.discardEditDraft(groupKey) }
            draftStatus = DraftStatus.NONE
            onDone()
        }
    }

    override fun onCleared() {
        // Let the writer finish the newest queued text, then stop. It runs in the application scope, so it is not cancelled.
        pending.close()
        super.onCleared()
    }

    companion object {
        fun factory(create: () -> QuestionEditViewModel) = viewModelFactory { initializer { create() } }
    }
}
