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
import com.questionbank.app.domain.question.QuestionGroupInput
import com.questionbank.app.domain.question.RatingsInput
import com.questionbank.app.domain.question.SaveResult
import com.questionbank.app.domain.question.SubQuestionInput
import com.questionbank.app.domain.question.TypeCqQuestionRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

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

    private var pending = Channel<DraftText>(Channel.CONFLATED)
    private var writer: Job? = null

    init {
        startWriter()
        viewModelScope.launch {
            val stored = repository.loadDraft(topicId)
            if (stored != null && !stored.isBlank) {
                draft = stored
                restoredFromDraft = true
                draftStatus = DraftStatus.SAVED
            }
            loaded = true
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

    fun setStimulus(value: String) = change(draft.copy(stimulus = value))

    fun setText(index: Int, value: String) =
        change(draft.copy(texts = draft.texts.toMutableList().also { it[index] = value }))

    fun setAnswer(index: Int, value: String) =
        change(draft.copy(answers = draft.answers.toMutableList().also { it[index] = value }))

    /** v0.2.30b: [value] 1-5, or null to clear. */
    fun changeStimulusRating(value: Int?) = change(draft.copy(stimulusRating = value))

    fun changeRating(index: Int, value: Int?) =
        change(draft.copy(ratings = draft.ratings.toMutableList().also { it[index] = value }))

    fun clearAll() = change(DraftText())

    fun dismissResult() {
        result = null
    }

    private fun change(next: DraftText) {
        if (saving || !loaded) return
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
                        subQuestions = CqLabel.entries.mapIndexed { i, label ->
                            SubQuestionInput(label, snapshot.texts[i], snapshot.answers[i])
                        },
                        ratings = RatingsInput(
                            stimulus = snapshot.stimulusRating,
                            byLabel = CqLabel.entries.mapIndexed { i, label -> label to snapshot.ratings[i] }.toMap(),
                        ),
                    )
                )
            }
            if (outcome is SaveResult.Saved) {
                draft = DraftText()
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
        pending.close()
        super.onCleared()
    }

    companion object {
        fun factory(create: () -> QuestionEditorViewModel) = viewModelFactory { initializer { create() } }
    }
}
