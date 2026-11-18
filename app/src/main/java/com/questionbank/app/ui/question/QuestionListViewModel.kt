package com.questionbank.app.ui.question

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.domain.question.SearchOutcome
import com.questionbank.app.domain.question.TypeCqQuestionRepository
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.mapLatest
import kotlinx.coroutines.flow.stateIn

/** What the search shows. [Idle] = the search text is empty, so the normal list is shown. */
sealed interface SearchUiState {
    data object Idle : SearchUiState
    /** The text has no usable word (for example only punctuation). */
    data object NoTerms : SearchUiState
    data class Results(val groups: List<SavedGroup>) : SearchUiState
    data class Failed(val reason: String) : SearchUiState
}

/**
 * [groups] is null until the first database result arrives (loading state).
 *
 * Search (v0.2.27): the typed text lives in Compose snapshot state (typing never races with the keyboard, same choice as the
 * editor). A search starts 300 ms after the last key; a newer text cancels an older search. While the text is empty nothing is
 * searched and the normal list shows. Search state lives in this ViewModel, so it survives rotation and a visit to the editor.
 */
class QuestionListViewModel(private val topicId: String, private val repository: TypeCqQuestionRepository) : ViewModel() {

    val groups: StateFlow<List<SavedGroup>?> = repository.observeGroups(topicId)
        .map<List<SavedGroup>, List<SavedGroup>?> { it }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val topicName: StateFlow<String?> = repository.observeTopicName(topicId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    var searchOpen by mutableStateOf(false)
        private set
    var query by mutableStateOf("")
        private set

    @OptIn(FlowPreview::class, ExperimentalCoroutinesApi::class)
    val searchState: StateFlow<SearchUiState> = snapshotFlow { query }
        .debounce { text -> if (text.isEmpty()) 0L else SEARCH_DELAY_MS }
        .mapLatest { text ->
            if (text.isBlank()) {
                SearchUiState.Idle
            } else {
                when (val outcome = repository.search(topicId, text)) {
                    SearchOutcome.NoTerms -> SearchUiState.NoTerms
                    is SearchOutcome.Found -> SearchUiState.Results(outcome.groups)
                    is SearchOutcome.Failed -> SearchUiState.Failed(outcome.reason)
                }
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SearchUiState.Idle)

    fun openSearch() {
        searchOpen = true
    }

    fun closeSearch() {
        searchOpen = false
        query = ""
    }

    fun setQuery(text: String) {
        query = text
    }

    companion object {
        const val SEARCH_DELAY_MS = 300L

        fun factory(create: () -> QuestionListViewModel) = viewModelFactory { initializer { create() } }
    }
}
