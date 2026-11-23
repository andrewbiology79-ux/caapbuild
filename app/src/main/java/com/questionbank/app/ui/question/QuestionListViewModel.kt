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
import com.questionbank.app.domain.question.BoardsInput
import com.questionbank.app.domain.question.QuestionGroupInput
import com.questionbank.app.domain.question.QuestionStimulusImage
import com.questionbank.app.domain.question.ConceptContentPart
import com.questionbank.app.domain.question.SavedQuestionConcept
import com.questionbank.app.domain.question.QuestionConceptSummary
import com.questionbank.app.domain.question.QuestionSolutionPart
import com.questionbank.app.domain.question.RatingsInput
import com.questionbank.app.domain.question.SubQuestionInput
import com.questionbank.app.domain.question.SaveResult
import com.questionbank.app.domain.question.BoardItem
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.domain.question.SearchOutcome
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
import com.questionbank.app.ui.format.toBengali

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

    val breadcrumb = repository.observeBreadcrumb(topicId)
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

    // These getters read the shared Compose state, so every Type screen sees Copy/Cut/Paste changes immediately.
    val clipboardCount: Int get() = TypeCqGroupClipboard.payload?.groups?.size ?: 0
    val clipboardMode: TypeCqGroupClipboard.Mode get() = TypeCqGroupClipboard.payload?.mode ?: TypeCqGroupClipboard.Mode.COPY

    var searchPending by mutableStateOf(false)
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
                if (query.isBlank() && filter.isEmpty) searchPending = false
                SearchUiState.Idle
            } else {
                val result = when (val outcome = repository.search(topicId, text, f)) {
                    SearchOutcome.NoTerms -> SearchUiState.NoTerms
                    is SearchOutcome.Found -> SearchUiState.Results(outcome.groups)
                    is SearchOutcome.Failed -> SearchUiState.Failed(outcome.reason)
                }
                // Do not clear the pending flag for an older debounce/search result if newer input was typed meanwhile.
                if (query == text && filter == f) searchPending = false
                result
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
        searchPending = false
    }

    fun changeFilter(value: BoardFilter) {
        if (filter != value) {
            filter = value
            searchPending = true
        }
    }

    fun onQueryChange(text: String) {
        if (query != text) {
            query = text
            searchPending = true
        }
    }

    fun deleteGroup(group: SavedGroup) {
        val key = com.questionbank.app.domain.question.QuestionGroupKey.of(group) ?: run {
            deleteMessage = "প্রশ্ন কার্ডটি শনাক্ত করা যায়নি।"
            return
        }
        viewModelScope.launch {
            deleteMessage = if (repository.deleteGroup(topicId, key)) "প্রশ্ন কার্ড মুছে ফেলা হয়েছে। সংরক্ষিত প্রশ্নপত্রের Snapshot থাকবে, তবে মূল Source Link বিচ্ছিন্ন হয়েছে।" else
                "কার্ডটি মুছতে পারেনি। কার্ডটি আর পাওয়া যাচ্ছে না বা ডেটাবেসে সমস্যা হয়েছে।"
        }
    }

    fun deleteGroups(groupKeys: List<String>) {
        val keys = groupKeys.distinct()
        if (keys.isEmpty()) return
        viewModelScope.launch {
            deleteMessage = if (repository.deleteGroups(topicId, keys)) "${keys.size} টি সম্পূর্ণ প্রশ্ন কার্ড মুছে ফেলা হয়েছে। সংরক্ষিত প্রশ্নপত্রের Snapshot থাকবে, তবে মূল Source Link বিচ্ছিন্ন হয়েছে।" else
                "নির্বাচিত কার্ডগুলো মুছতে পারেনি। কোনো কার্ড আর পাওয়া যাচ্ছে না বা ডেটাবেসে সমস্যা হয়েছে।"
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

    fun updateQuestionCategories(questionId: String, categoryIds: List<String>) {
        viewModelScope.launch {
            val ok = repository.updateQuestionCategories(questionId, categoryIds.distinct())
            deleteMessage = if (ok) "প্রশ্নের ক্যাটাগরি সংরক্ষণ হয়েছে।" else "প্রশ্নের ক্যাটাগরি সংরক্ষণ করা যায়নি।"
        }
    }

    fun updateGroupQuestionCategories(groupKey: String, categoryIds: List<String>) {
        viewModelScope.launch {
            val ok = repository.updateGroupQuestionCategories(topicId, groupKey, categoryIds.distinct())
            deleteMessage = if (ok) "প্রশ্ন কার্ডের ক্যাটাগরি সংরক্ষণ হয়েছে।" else "প্রশ্ন কার্ডের ক্যাটাগরি সংরক্ষণ করা যায়নি।"
        }
    }

    fun observeConcept(questionId: String): Flow<SavedQuestionConcept?> = repository.observeConcept(questionId)

    suspend fun persistConcept(questionId: String, parts: List<ConceptContentPart>): Boolean =
        repository.saveConcept(questionId, parts)

    suspend fun loadConceptSummaries(): List<QuestionConceptSummary> = repository.conceptsInTopic(topicId)

    fun stageClipboard(groupKeys: List<String>, mode: TypeCqGroupClipboard.Mode) {
        val keys = groupKeys.distinct().filter(String::isNotBlank)
        if (keys.isEmpty()) {
            deleteMessage = "আগে প্রশ্ন কার্ড নির্বাচন করুন।"
            return
        }
        viewModelScope.launch {
            val loaded = keys.mapNotNull { key -> repository.loadGroup(topicId, key)?.let { key to it } }
            if (loaded.size != keys.size) {
                deleteMessage = "কিছু প্রশ্ন কার্ড আর পাওয়া যাচ্ছে না; Clipboard তৈরি করা যায়নি।"
                return@launch
            }
            TypeCqGroupClipboard.put(
                TypeCqGroupClipboard.Payload(topicId, mode, loaded.map { it.first }, loaded.map { it.second }),
            )
            deleteMessage = "${loaded.size.toBengali()} টি সম্পূর্ণ প্রশ্ন কার্ড ${if (mode == TypeCqGroupClipboard.Mode.CUT) "কাট" else "কপি"} করা হয়েছে।"
        }
    }

    fun pasteClipboard() {
        val payload = TypeCqGroupClipboard.payload
        if (payload == null || payload.groups.isEmpty()) {
            deleteMessage = "Clipboard-এ কোনো প্রশ্ন নেই।"
            return
        }
        viewModelScope.launch {
            if (payload.mode == TypeCqGroupClipboard.Mode.CUT) {
                val moved = repository.moveGroups(payload.sourceTopicId, topicId, payload.sourceGroupKeys)
                if (moved) {
                    TypeCqGroupClipboard.clear()
                    deleteMessage = "${payload.groups.size.toBengali()} টি সম্পূর্ণ প্রশ্ন কার্ড স্থানান্তর হয়েছে।"
                } else {
                    deleteMessage = "কার্ডগুলো স্থানান্তর করা যায়নি। মূল প্রশ্নগুলো অপরিবর্তিত আছে এবং Clipboard রাখা হয়েছে।"
                }
                return@launch
            }
            val createdKeys = mutableListOf<String>()
            var failure: String? = null
            for (group in payload.groups) {
                val subQuestions = group.subQuestions.mapNotNull { question ->
                    val label = question.label ?: return@mapNotNull null
                    SubQuestionInput(
                        label = label, text = question.text, shortAnswer = question.shortAnswer,
                        questionTypeId = question.questionTypeId, marks = question.marks,
                        solutionParts = question.solutionParts,
                    )
                }
                if (subQuestions.isEmpty()) { failure = "Clipboard-এ বৈধ প্রশ্ন পাওয়া যায়নি।"; break }
                val orderedSolutions = group.subQuestions.mapNotNull { question ->
                    question.label?.let { label ->
                        label to question.orderedSolutionParts.map { part ->
                            QuestionSolutionPart(
                                partId = java.util.UUID.randomUUID().toString(),
                                partType = part.partType, position = part.position,
                                textContent = part.textContent, imageId = part.imageId,
                            )
                        }
                    }
                }.filter { (_, parts) -> parts.isNotEmpty() }.toMap()
                val conceptPartsByLabel = group.subQuestions.mapNotNull { question ->
                    question.label?.let { label ->
                        label to question.conceptParts.map { part -> part.copy(partId = java.util.UUID.randomUUID().toString()) }
                    }
                }.toMap()
                val input = QuestionGroupInput(
                    topicId = topicId, stimulusText = group.stimulusText, subQuestions = subQuestions,
                    ratings = RatingsInput(
                        stimulus = group.stimulusRating,
                        byLabel = group.subQuestions.mapNotNull { q -> q.label?.let { it to q.rating } }.toMap(),
                    ),
                    boards = BoardsInput(
                        stimulus = group.stimulusBoards,
                        byLabel = group.subQuestions.mapNotNull { q -> q.label?.let { it to q.boards } }.toMap(),
                    ),
                    referenceText = group.referenceText,
                    categoriesByLabel = group.subQuestions.mapNotNull { q -> q.label?.let { it to q.categoryIds } }.toMap(),
                    stimulusImages = group.stimulusImages.map { QuestionStimulusImage(it.imageId, it.placement, it.position) },
                    solutionPartsByLabel = orderedSolutions,
                    conceptsByLabel = conceptPartsByLabel,
                )
                when (val result = repository.saveGroup(input)) {
                    is SaveResult.Saved -> {
                        val key = result.stimulusId?.let { "s-$it" } ?: result.questionIds.firstOrNull()?.let { "q-$it" }
                        if (key == null) { failure = "নতুন প্রশ্নের পরিচয় পাওয়া যায়নি।"; break }
                        createdKeys += key
                    }
                    else -> {
                        failure = when (result) {
                            is SaveResult.Failed -> result.reason
                            SaveResult.Empty -> "একটি Clipboard কার্ড খালি ছিল।"
                            is SaveResult.MissingQuestionText -> "${result.label.letter} প্রশ্নের লেখা নেই।"
                            is SaveResult.TooLong -> "প্রশ্নের লেখা অনুমোদিত সীমার বেশি।"
                            SaveResult.TopicMissing -> "বর্তমান Type/Topic আর পাওয়া যাচ্ছে না।"
                            else -> "প্রশ্ন পেস্ট করা যায়নি।"
                        }
                        break
                    }
                }
            }
            if (failure != null) {
                if (createdKeys.isNotEmpty()) repository.deleteGroups(topicId, createdKeys)
                deleteMessage = "পেস্ট সম্পন্ন হয়নি; আংশিক কপি সরানোর চেষ্টা করা হয়েছে। $failure"
                return@launch
            }
            // COPY remains available for repeated pastes; CUT takes the dedicated ID-preserving move path above.
            deleteMessage = "${createdKeys.size.toBengali()} টি সম্পূর্ণ প্রশ্ন কার্ড পেস্ট হয়েছে। Clipboard-এ কপি রাখা আছে।"
        }
    }

    /** Paste the clipboard immediately before/after one card and then persist that complete card order. */
    fun pasteClipboardRelative(targetGroupKey: String, after: Boolean) {
        val payload = TypeCqGroupClipboard.payload
        if (payload == null || payload.groups.isEmpty()) {
            deleteMessage = "Clipboard-এ কোনো প্রশ্ন নেই।"
            return
        }
        val currentKeys = groups.value.orEmpty().mapNotNull(com.questionbank.app.domain.question.QuestionGroupKey::of)
        if (targetGroupKey !in currentKeys) {
            deleteMessage = "যে কার্ডের পাশে পেস্ট করতে চান সেটি আর পাওয়া যাচ্ছে না।"
            return
        }
        if (payload.mode == TypeCqGroupClipboard.Mode.CUT && payload.sourceTopicId == topicId && targetGroupKey in payload.sourceGroupKeys) {
            deleteMessage = "কাটা কার্ডের নিজের আগে বা পরে সেটি পেস্ট করা যাবে না।"
            return
        }
        viewModelScope.launch {
            val insertedKeys: List<String>
            if (payload.mode == TypeCqGroupClipboard.Mode.CUT) {
                val moved = repository.moveGroups(payload.sourceTopicId, topicId, payload.sourceGroupKeys)
                if (!moved) {
                    deleteMessage = "কার্ডগুলো স্থানান্তর করা যায়নি; Clipboard অক্ষত আছে।"
                    return@launch
                }
                insertedKeys = payload.sourceGroupKeys
            } else {
                val (created, failure) = saveClipboardCopies(payload)
                if (failure != null) {
                    if (created.isNotEmpty()) repository.deleteGroups(topicId, created)
                    deleteMessage = "পেস্ট সম্পন্ন হয়নি: $failure"
                    return@launch
                }
                insertedKeys = created
            }

            val order = currentKeys.toMutableList()
            if (payload.mode == TypeCqGroupClipboard.Mode.CUT && payload.sourceTopicId == topicId) {
                order.removeAll(payload.sourceGroupKeys.toSet())
            }
            val targetIndex = order.indexOf(targetGroupKey)
            if (targetIndex < 0) {
                deleteMessage = "কার্ডের নতুন অবস্থান নির্ধারণ করা যায়নি; পেস্ট করা কার্ডগুলো তালিকার শেষে আছে।"
                if (payload.mode == TypeCqGroupClipboard.Mode.CUT) TypeCqGroupClipboard.clear()
                return@launch
            }
            order.addAll((targetIndex + if (after) 1 else 0).coerceIn(0, order.size), insertedKeys)
            val reordered = repository.reorderGroups(topicId, order)
            if (!reordered) {
                deleteMessage = "কার্ডগুলো যোগ হয়েছে, তবে নির্দিষ্ট অবস্থান সংরক্ষণ করা যায়নি।"
                if (payload.mode == TypeCqGroupClipboard.Mode.CUT) TypeCqGroupClipboard.clear()
                return@launch
            }
            if (payload.mode == TypeCqGroupClipboard.Mode.CUT) TypeCqGroupClipboard.clear()
            deleteMessage = "${insertedKeys.size.toBengali()} টি সম্পূর্ণ প্রশ্ন কার্ড ${if (after) "নির্বাচিত কার্ডের পরে" else "নির্বাচিত কার্ডের আগে"} পেস্ট হয়েছে।"
        }
    }

    private suspend fun saveClipboardCopies(payload: TypeCqGroupClipboard.Payload): Pair<List<String>, String?> {
        val createdKeys = mutableListOf<String>()
        for (group in payload.groups) {
            val subQuestions = group.subQuestions.mapNotNull { question ->
                val label = question.label ?: return@mapNotNull null
                SubQuestionInput(
                    label = label, text = question.text, shortAnswer = question.shortAnswer,
                    questionTypeId = question.questionTypeId, marks = question.marks,
                    solutionParts = question.solutionParts,
                )
            }
            if (subQuestions.isEmpty()) return createdKeys to "Clipboard-এ বৈধ প্রশ্ন পাওয়া যায়নি।"
            val orderedSolutions = group.subQuestions.mapNotNull { question ->
                question.label?.let { label ->
                    label to question.orderedSolutionParts.map { part ->
                        QuestionSolutionPart(
                            partId = java.util.UUID.randomUUID().toString(),
                            partType = part.partType, position = part.position,
                            textContent = part.textContent, imageId = part.imageId,
                        )
                    }
                }
            }.filter { (_, parts) -> parts.isNotEmpty() }.toMap()
            val conceptPartsByLabel = group.subQuestions.mapNotNull { question ->
                question.label?.let { label ->
                    label to question.conceptParts.map { part -> part.copy(partId = java.util.UUID.randomUUID().toString()) }
                }
            }.toMap()
            val input = QuestionGroupInput(
                topicId = topicId, stimulusText = group.stimulusText, subQuestions = subQuestions,
                ratings = RatingsInput(
                    stimulus = group.stimulusRating,
                    byLabel = group.subQuestions.mapNotNull { q -> q.label?.let { it to q.rating } }.toMap(),
                ),
                boards = BoardsInput(
                    stimulus = group.stimulusBoards,
                    byLabel = group.subQuestions.mapNotNull { q -> q.label?.let { it to q.boards } }.toMap(),
                ),
                referenceText = group.referenceText,
                categoriesByLabel = group.subQuestions.mapNotNull { q -> q.label?.let { it to q.categoryIds } }.toMap(),
                stimulusImages = group.stimulusImages.map { QuestionStimulusImage(it.imageId, it.placement, it.position) },
                solutionPartsByLabel = orderedSolutions,
                conceptsByLabel = conceptPartsByLabel,
            )
            when (val result = repository.saveGroup(input)) {
                is SaveResult.Saved -> {
                    val key = result.stimulusId?.let { "s-$it" } ?: result.questionIds.firstOrNull()?.let { "q-$it" }
                    if (key == null) return createdKeys to "নতুন প্রশ্নের পরিচয় পাওয়া যায়নি।"
                    createdKeys += key
                }
                else -> {
                    val failure = when (result) {
                        is SaveResult.Failed -> result.reason
                        SaveResult.Empty -> "একটি Clipboard কার্ড খালি ছিল।"
                        is SaveResult.MissingQuestionText -> "${result.label.letter} প্রশ্নের লেখা নেই।"
                        is SaveResult.TooLong -> "প্রশ্নের লেখা অনুমোদিত সীমার বেশি।"
                        SaveResult.TopicMissing -> "বর্তমান Type/Topic আর পাওয়া যাচ্ছে না।"
                        else -> "প্রশ্ন পেস্ট করা যায়নি।"
                    }
                    return createdKeys to failure
                }
            }
        }
        return createdKeys to null
    }

    fun clearClipboard() {
        TypeCqGroupClipboard.clear()
        deleteMessage = "Clipboard পরিষ্কার করা হয়েছে।"
    }

    fun clearDeleteMessage() { deleteMessage = "" }

    companion object {
        const val SEARCH_DELAY_MS = 300L

        fun factory(create: () -> QuestionListViewModel) = viewModelFactory { initializer { create() } }
    }
}
