package com.questionbank.app.ui.question

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
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
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class EditLoad { LOADING, READY, MISSING }

/** One queued draft write: [text] null means "remove the draft" (the typed text equals the stored text again, or it was discarded). */
private class EditDraftOp(val text: DraftText?)

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
) : ViewModel() {

    var load by mutableStateOf(EditLoad.LOADING)
        private set
    var original by mutableStateOf<SavedGroup?>(null)
        private set
    var stimulus by mutableStateOf("")
        private set
    var texts by mutableStateOf(List(4) { "" })
        private set
    var answers by mutableStateOf(List(4) { "" })
        private set
    /** v0.2.30b: the stimulus rating and the rating of ক..ঘ as typed (1-5 or null = none). Changed with [changeStimulusRating] / [changeRating]. */
    var stimulusRating by mutableStateOf<Int?>(null)
        private set
    var ratings by mutableStateOf(List<Int?>(4) { null })
        private set
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
                for (sub in group.subQuestions) {
                    val label = sub.label ?: continue
                    t[label.sortOrder - 1] = sub.text
                    a[label.sortOrder - 1] = sub.shortAnswer
                    r[label.sortOrder - 1] = sub.rating
                }
                original = group
                stimulus = group.stimulusText
                texts = t
                answers = a
                stimulusRating = group.stimulusRating
                ratings = r
                load = EditLoad.READY
                restoreDraft(group)
                startWriter()
            }
        }
    }

    /** Puts a saved edit draft on top of the stored text. Only the blocks this screen can edit are taken from it. */
    private suspend fun restoreDraft(group: SavedGroup) {
        val stored = repository.loadEditDraft(groupKey) ?: return
        if (group.stimulusId != null) {
            stimulus = stored.stimulus
            stimulusRating = stored.stimulusRating
        }
        val t = texts.toMutableList()
        val a = answers.toMutableList()
        val r = ratings.toMutableList()
        for (label in editableLabels) {
            val i = label.sortOrder - 1
            t[i] = stored.texts[i]
            a[i] = stored.answers[i]
            r[i] = stored.ratings[i]
        }
        texts = t
        answers = a
        ratings = r
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
        DraftText(stimulus = stimulus, texts = texts, answers = answers, stimulusRating = stimulusRating, ratings = ratings)

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
            subQuestions = editableLabels.map { SubQuestionInput(it, texts[it.sortOrder - 1], answers[it.sortOrder - 1]) },
            // The ratings of exactly the blocks this screen shows; the stimulus rating only for a card that has a stimulus.
            ratings = RatingsInput(
                stimulus = if (hasStimulus) stimulusRating else null,
                byLabel = editableLabels.associateWith { ratings[it.sortOrder - 1] },
            ),
        )

    /** True when the typed text differs from what is stored (after the same cleaning a save does). Blanking something counts as a change. */
    val changed: Boolean
        get() {
            val group = original ?: return false
            return QuestionEditRules.check(group, buildInput()) != QuestionEditRules.Checked.NoChange
        }

    fun changeStimulus(value: String) {
        if (saving || finished) return
        stimulus = value
        result = null
        queueDraft()
    }

    fun setText(label: CqLabel, value: String) {
        if (saving || finished) return
        texts = texts.toMutableList().also { it[label.sortOrder - 1] = value }
        result = null
        queueDraft()
    }

    fun setAnswer(label: CqLabel, value: String) {
        if (saving || finished) return
        answers = answers.toMutableList().also { it[label.sortOrder - 1] = value }
        result = null
        queueDraft()
    }

    /** [value] 1-5, or null to clear. Only meaningful for a card with a stimulus (the screen shows the buttons only then). */
    fun changeStimulusRating(value: Int?) {
        if (saving || finished) return
        stimulusRating = value
        result = null
        queueDraft()
    }

    fun changeRating(label: CqLabel, value: Int?) {
        if (saving || finished) return
        ratings = ratings.toMutableList().also { it[label.sortOrder - 1] = value }
        result = null
        queueDraft()
    }

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
