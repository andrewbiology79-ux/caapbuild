package com.questionbank.app.ui.question

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.domain.question.TypeCqQuestionRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/** [groups] is null until the first database result arrives (loading state). */
class QuestionListViewModel(topicId: String, repository: TypeCqQuestionRepository) : ViewModel() {

    val groups: StateFlow<List<SavedGroup>?> = repository.observeGroups(topicId)
        .map<List<SavedGroup>, List<SavedGroup>?> { it }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val topicName: StateFlow<String?> = repository.observeTopicName(topicId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    companion object {
        fun factory(create: () -> QuestionListViewModel) = viewModelFactory { initializer { create() } }
    }
}
