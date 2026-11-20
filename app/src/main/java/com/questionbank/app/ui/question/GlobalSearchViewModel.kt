package com.questionbank.app.ui.question

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.questionbank.app.domain.search.GlobalQuestionHit
import com.questionbank.app.domain.search.GlobalQuestionSearchFilters
import com.questionbank.app.domain.search.GlobalQuestionSearchUseCase
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class GlobalSearchViewModel(private val search: GlobalQuestionSearchUseCase) : ViewModel() {
    var filters by mutableStateOf(GlobalQuestionSearchFilters())
        private set
    var results by mutableStateOf<List<GlobalQuestionHit>>(emptyList())
        private set
    var loading by mutableStateOf(false)
        private set
    var error by mutableStateOf("")
        private set
    private var searchJob: Job? = null
    private var searchGeneration: Long = 0L

    fun updateFilters(next: GlobalQuestionSearchFilters) {
        filters = next
        searchJob?.cancel()
        val generation = ++searchGeneration
        searchJob = viewModelScope.launch {
            delay(if (next.query.isBlank()) 0L else 320L)
            if (generation != searchGeneration) return@launch
            val hasFilter = next.boardCode != null || next.year != null || next.categoryId != null || next.rating != null ||
                next.questionTypeId != null || next.subjectId != null || next.chapterId != null || next.topicId != null
            if (next.query.isBlank() && !hasFilter) {
                results = emptyList()
                loading = false
                error = ""
                return@launch
            }
            loading = true
            error = ""
            try {
                val found = search(next)
                if (generation == searchGeneration) results = found
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                if (generation == searchGeneration) { results = emptyList(); error = failure.message ?: "সার্চ করা যায়নি" }
            } finally {
                if (generation == searchGeneration) loading = false
            }
        }
    }

    fun update(transform: (GlobalQuestionSearchFilters) -> GlobalQuestionSearchFilters) = updateFilters(transform(filters))

    fun clearFilters() = updateFilters(GlobalQuestionSearchFilters(query = filters.query))

    companion object {
        fun factory(create: () -> GlobalSearchViewModel) = viewModelFactory { initializer { create() } }
    }
}
