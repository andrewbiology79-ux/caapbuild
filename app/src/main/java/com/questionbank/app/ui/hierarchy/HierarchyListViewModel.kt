package com.questionbank.app.ui.hierarchy

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.questionbank.app.domain.hierarchy.AddResult
import com.questionbank.app.domain.hierarchy.HierarchyItem
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * One ViewModel for the three hierarchy lists (subjects, chapters, topics): they differ only in the flows
 * and in the add function, which come from the repository.
 * [items] is null until the first database result arrives (loading state).
 */
class HierarchyListViewModel(
    itemsFlow: Flow<List<HierarchyItem>>,
    parentFlow: Flow<HierarchyItem?>,
    private val addItem: suspend (String) -> AddResult,
) : ViewModel() {

    val items: StateFlow<List<HierarchyItem>?> = itemsFlow
        .map<List<HierarchyItem>, List<HierarchyItem>?> { it }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val parent: StateFlow<HierarchyItem?> = parentFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    private val _error = MutableStateFlow<AddResult?>(null)
    val error: StateFlow<AddResult?> = _error

    fun add(rawName: String, onAdded: () -> Unit) {
        viewModelScope.launch {
            when (val result = addItem(rawName)) {
                is AddResult.Added -> {
                    _error.value = null
                    onAdded()
                }
                else -> _error.value = result
            }
        }
    }

    fun clearError() {
        _error.value = null
    }

    companion object {
        fun factory(create: () -> HierarchyListViewModel) = viewModelFactory { initializer { create() } }
    }
}
