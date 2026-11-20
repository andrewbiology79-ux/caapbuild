package com.questionbank.app.ui.question

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.questionbank.app.domain.question.BoardFilter
import com.questionbank.app.domain.question.BoardItem
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.domain.question.SearchOutcome
import com.questionbank.app.domain.question.SaveResult
import com.questionbank.app.domain.question.TypeCqQuestionRepository
import com.questionbank.app.data.local.entity.TypeCqQuestionCategoriesEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionTypesEntity
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.mapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

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
 * v0.2.28: the search also runs again whenever the rows of the topic change (an edit was saved), without waiting 300 ms.
 */
class QuestionListViewModel(
    private val topicId: String,
    private val repository: TypeCqQuestionRepository,
    categoriesFlow: Flow<List<TypeCqQuestionCategoriesEntity>> = flowOf(emptyList()),
    questionTypesFlow: Flow<List<TypeCqQuestionTypesEntity>> = flowOf(emptyList()),
) : ViewModel() {

    val groups: StateFlow<List<SavedGroup>?> = repository.observeGroups(topicId)
        .map<List<SavedGroup>, List<SavedGroup>?> { it }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val topicName: StateFlow<String?> = repository.observeTopicName(topicId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    /** v0.2.30c-2: the board names for the chips on the cards. */
    val boardCatalog: StateFlow<List<BoardItem>> = repository.observeBoards()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    val categoryCatalog: StateFlow<List<TypeCqQuestionCategoriesEntity>> = categoriesFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    val questionTypeCatalog: StateFlow<List<TypeCqQuestionTypesEntity>> = questionTypesFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    var searchOpen by mutableStateOf(false)
        private set
    var query by mutableStateOf("")
        private set
    /** v0.2.30c-3: the board / year filter of the search. Empty = no filter. Cleared when the search is closed. */
    var filter by mutableStateOf(BoardFilter())
        private set
    var deleteMessage by mutableStateOf("")
        private set

    @OptIn(FlowPreview::class, ExperimentalCoroutinesApi::class)
    val searchState: StateFlow<SearchUiState> = combine(
        snapshotFlow { query }.debounce { text -> if (text.isEmpty()) 0L else SEARCH_DELAY_MS },
        // v0.2.30c-3: a filter change searches at once (no typing to wait for).
        snapshotFlow { filter },
        // v0.2.28: a saved edit changes the topic's rows; the same text is searched again so the result never shows old text.
        repository.observeGroups(topicId),
    ) { text, f, _ -> text to f }
        .mapLatest { (text, f) ->
            if (text.isBlank() && f.isEmpty) {
                SearchUiState.Idle
            } else {
                when (val outcome = repository.search(topicId, text, f)) {
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
        filter = BoardFilter()
    }

    fun changeFilter(value: BoardFilter) {
        filter = value
    }

    fun onQueryChange(text: String) {
        query = text
    }

    fun deleteGroup(group: SavedGroup) {
        val key = com.questionbank.app.domain.question.QuestionGroupKey.of(group) ?: run {
            deleteMessage = "প্রশ্ন কার্ডটি শনাক্ত করা যায়নি।"
            return
        }
        viewModelScope.launch {
            deleteMessage = if (repository.deleteGroup(topicId, key)) "প্রশ্ন কার্ড মুছে ফেলা হয়েছে।" else
                "কার্ডটি মুছতে পারেনি। প্রশ্নটি কোনো সংরক্ষিত প্রশ্নপত্রে ব্যবহৃত হলে তা মুছতে বাধা দেবে।"
        }
    }

    fun deleteGroups(groupKeys: List<String>) {
        val keys = groupKeys.distinct()
        if (keys.isEmpty()) return
        viewModelScope.launch {
            deleteMessage = if (repository.deleteGroups(topicId, keys)) "${keys.size} টি সম্পূর্ণ প্রশ্ন কার্ড মুছে ফেলা হয়েছে।" else
                "নির্বাচিত কার্ডগুলোর কোনোটি সংরক্ষিত প্রশ্নপত্রে ব্যবহৃত বা আর উপলভ্য থাকায় পুরো নির্বাচন মুছে ফেলা যায়নি।"
        }
    }

    fun duplicateGroup(group: SavedGroup) {
        val key = com.questionbank.app.domain.question.QuestionGroupKey.of(group) ?: run {
            deleteMessage = "প্রশ্ন কার্ডটি শনাক্ত করা যায়নি।"
            return
        }
        viewModelScope.launch {
            deleteMessage = when (val result = repository.duplicateGroup(topicId, key)) {
                is SaveResult.Saved -> "প্রশ্ন কার্ডের সম্পূর্ণ কপি তৈরি হয়েছে।"
                else -> "কপি তৈরি করা যায়নি: ${when (result) { is SaveResult.Failed -> result.reason; else -> "তথ্য সংরক্ষণে সমস্যা" }}"
            }
        }
    }

    fun clearDeleteMessage() { deleteMessage = "" }

    companion object {
        const val SEARCH_DELAY_MS = 300L

        fun factory(create: () -> QuestionListViewModel) = viewModelFactory { initializer { create() } }
    }
}
