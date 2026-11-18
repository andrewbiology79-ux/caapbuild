package com.questionbank.app.ui.question

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.questionbank.app.domain.question.CqLabel
import com.questionbank.app.domain.question.GroupEditInput
import com.questionbank.app.domain.question.QuestionEditRules
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.domain.question.SubQuestionInput
import com.questionbank.app.domain.question.TypeCqQuestionRepository
import com.questionbank.app.domain.question.UpdateResult
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class EditLoad { LOADING, READY, MISSING }

/**
 * Edit screen of ONE existing card (v0.2.28, part B-1). The stored texts are loaded once; what the person types lives in Compose
 * snapshot state (typing never races with the keyboard, same choice as the new-question editor).
 *
 * There is NO draft in this package (edit drafts come with v0.2.29): the typed changes live only while the screen is open, and
 * leaving with unsaved changes asks first ([changed]). Nothing is written until Save, and Save is one all-or-nothing transaction
 * ([TypeCqQuestionRepository.updateGroup]), so a saved question can never be half changed.
 */
class QuestionEditViewModel(
    private val topicId: String,
    private val groupKey: String,
    private val repository: TypeCqQuestionRepository,
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
    var saving by mutableStateOf(false)
        private set
    var result by mutableStateOf<UpdateResult?>(null)
        private set

    init {
        viewModelScope.launch {
            val group = repository.loadGroup(topicId, groupKey)
            if (group == null) {
                load = EditLoad.MISSING
            } else {
                val t = MutableList(4) { "" }
                val a = MutableList(4) { "" }
                for (sub in group.subQuestions) {
                    val label = sub.label ?: continue
                    t[label.sortOrder - 1] = sub.text
                    a[label.sortOrder - 1] = sub.shortAnswer
                }
                original = group
                stimulus = group.stimulusText
                texts = t
                answers = a
                load = EditLoad.READY
            }
        }
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
        )

    /** True when the typed text differs from what is stored (after the same cleaning a save does). Blanking something counts as a change. */
    val changed: Boolean
        get() {
            val group = original ?: return false
            return QuestionEditRules.check(group, buildInput()) != QuestionEditRules.Checked.NoChange
        }

    fun setStimulus(value: String) {
        if (saving) return
        stimulus = value
        result = null
    }

    fun setText(label: CqLabel, value: String) {
        if (saving) return
        texts = texts.toMutableList().also { it[label.sortOrder - 1] = value }
        result = null
    }

    fun setAnswer(label: CqLabel, value: String) {
        if (saving) return
        answers = answers.toMutableList().also { it[label.sortOrder - 1] = value }
        result = null
    }

    fun save(onSaved: () -> Unit) {
        if (saving || load != EditLoad.READY) return
        saving = true
        result = null
        val input = buildInput()
        viewModelScope.launch {
            // NonCancellable: if the person leaves while saving, the transaction still finishes (it is atomic either way).
            val outcome = withContext(NonCancellable) { repository.updateGroup(input) }
            saving = false
            result = outcome
            if (outcome is UpdateResult.Updated && isActive) onSaved()
        }
    }

    companion object {
        fun factory(create: () -> QuestionEditViewModel) = viewModelFactory { initializer { create() } }
    }
}
