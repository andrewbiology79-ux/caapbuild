package com.questionbank.app.ui.hierarchy

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.questionbank.app.domain.hierarchy.AddResult
import com.questionbank.app.domain.hierarchy.EditResult
import com.questionbank.app.domain.hierarchy.HierarchyRow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** What is wrong with a name typed into the add or rename dialog. */
enum class HierarchyProblem { BLANK, TOO_LONG, DUPLICATE, NOT_FOUND, FAILED }

/**
 * One ViewModel for the three hierarchy lists (subjects, chapters, topics): they differ only in the flows
 * and in the four functions, which come from the repository.
 * [items] is null until the first database result arrives (loading state).
 * [ancestors] are the names above this list, nearest last (chapter list: [subject]; topic list: [subject, chapter]).
 */
class HierarchyListViewModel(
    rowsFlow: Flow<List<HierarchyRow>>,
    ancestorsFlow: Flow<List<String>>,
    private val addItem: suspend (String) -> AddResult,
    private val renameItem: suspend (String, String) -> EditResult,
    private val deleteItem: suspend (String) -> EditResult,
    private val reorderItems: suspend (List<String>) -> EditResult,
) : ViewModel() {

    val items: StateFlow<List<HierarchyRow>?> = rowsFlow
        .map<List<HierarchyRow>, List<HierarchyRow>?> { it }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val ancestors: StateFlow<List<String>> = ancestorsFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _problem = MutableStateFlow<HierarchyProblem?>(null)
    /** Shown inside the open add / rename dialog. */
    val problem: StateFlow<HierarchyProblem?> = _problem

    private val _message = MutableStateFlow<String?>(null)
    /** One-line notice for the snackbar (a delete or reorder that did not happen). */
    val message: StateFlow<String?> = _message

    fun add(rawName: String, onAdded: () -> Unit) {
        viewModelScope.launch {
            val result = addItem(rawName)
            if (result is AddResult.Added) {
                _problem.value = null
                onAdded()
            } else {
                _problem.value = when (result) {
                    AddResult.Blank -> HierarchyProblem.BLANK
                    AddResult.TooLong -> HierarchyProblem.TOO_LONG
                    AddResult.Duplicate -> HierarchyProblem.DUPLICATE
                    AddResult.ParentMissing -> HierarchyProblem.NOT_FOUND
                    else -> HierarchyProblem.FAILED
                }
            }
        }
    }

    fun rename(id: String, rawName: String, onRenamed: () -> Unit) {
        viewModelScope.launch {
            val result = renameItem(id, rawName)
            if (result == EditResult.Done) {
                _problem.value = null
                onRenamed()
            } else {
                _problem.value = when (result) {
                    EditResult.Blank -> HierarchyProblem.BLANK
                    EditResult.TooLong -> HierarchyProblem.TOO_LONG
                    EditResult.Duplicate -> HierarchyProblem.DUPLICATE
                    EditResult.NotFound -> HierarchyProblem.NOT_FOUND
                    else -> HierarchyProblem.FAILED
                }
            }
        }
    }

    fun delete(id: String) {
        viewModelScope.launch {
            when (deleteItem(id)) {
                EditResult.Done, EditResult.NotFound -> Unit // the list updates itself; a vanished item needs no message
                is EditResult.NotEmpty -> _message.value = "এখন আর খালি নয়, তাই মুছে ফেলা হয়নি।"
                else -> _message.value = "মুছে ফেলা যায়নি।"
            }
        }
    }

    /** [onFinished] runs in every case: the screen leaves reorder mode and shows the database order again. */
    fun reorder(orderedIds: List<String>, onFinished: () -> Unit) {
        viewModelScope.launch {
            when (reorderItems(orderedIds)) {
                EditResult.Done -> Unit
                EditResult.NotFound -> _message.value = "তালিকা বদলে গেছে, ক্রম সংরক্ষণ হয়নি। আবার চেষ্টা করুন।"
                else -> _message.value = "ক্রম সংরক্ষণ করা যায়নি।"
            }
            onFinished()
        }
    }

    fun clearProblem() {
        _problem.value = null
    }

    fun clearMessage() {
        _message.value = null
    }

    companion object {
        fun factory(create: () -> HierarchyListViewModel) = viewModelFactory { initializer { create() } }
    }
}
