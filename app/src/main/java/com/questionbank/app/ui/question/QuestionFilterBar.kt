package com.questionbank.app.ui.question

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.questionbank.app.data.local.entity.TypeCqQuestionCategoriesEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionTypesEntity
import com.questionbank.app.domain.question.BoardFilter
import com.questionbank.app.ui.format.toBengali

/** Category, rating and question-type refinements complement the existing board/year chips. */
@Composable
fun QuestionFilterBar(
    filter: BoardFilter,
    categories: List<TypeCqQuestionCategoriesEntity>,
    types: List<TypeCqQuestionTypesEntity>,
    onChange: (BoardFilter) -> Unit,
) {
    var categoryDialog by rememberSaveable { mutableStateOf(false) }
    var ratingDialog by rememberSaveable { mutableStateOf(false) }
    var typeDialog by rememberSaveable { mutableStateOf(false) }
    val categoryName = categories.firstOrNull { it.categoryId == filter.categoryId }?.name ?: "সব"
    val typeName = types.firstOrNull { it.questionTypeId == filter.questionTypeId }?.label ?: "সব"
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 3.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        FilterChip(selected = filter.categoryId != null, onClick = { categoryDialog = true }, label = { Text("ক্যাটাগরি: $categoryName") })
        FilterChip(selected = filter.rating != null, onClick = { ratingDialog = true }, label = { Text("রেটিং: ${filter.rating?.toBengali() ?: "সব"}") })
        FilterChip(selected = filter.questionTypeId != null, onClick = { typeDialog = true }, label = { Text("ধরন: $typeName") })
    }
    if (categoryDialog) AlertDialog(
        onDismissRequest = { categoryDialog = false }, title = { Text("ক্যাটাগরি দিয়ে ছাঁকুন") },
        text = { Column(Modifier.heightIn(max = 380.dp).verticalScroll(rememberScrollState())) {
            FilterOption("সব ক্যাটাগরি", filter.categoryId == null) { categoryDialog = false; onChange(filter.copy(categoryId = null)) }
            categories.filter { it.isArchived == 0L || it.categoryId == filter.categoryId }.forEach { row ->
                FilterOption(row.name, filter.categoryId == row.categoryId) { categoryDialog = false; onChange(filter.copy(categoryId = row.categoryId)) }
            }
        } }, confirmButton = {}, dismissButton = { TextButton(onClick = { categoryDialog = false }) { Text("বন্ধ") } },
    )
    if (ratingDialog) AlertDialog(
        onDismissRequest = { ratingDialog = false }, title = { Text("রেটিং দিয়ে ছাঁকুন") },
        text = { Column { FilterOption("সব রেটিং", filter.rating == null) { ratingDialog = false; onChange(filter.copy(rating = null)) }; (1..5).forEach { value -> FilterOption("রেটিং ${value.toBengali()}", filter.rating == value) { ratingDialog = false; onChange(filter.copy(rating = value)) } } } },
        confirmButton = {}, dismissButton = { TextButton(onClick = { ratingDialog = false }) { Text("বন্ধ") } },
    )
    if (typeDialog) AlertDialog(
        onDismissRequest = { typeDialog = false }, title = { Text("প্রশ্নের ধরন দিয়ে ছাঁকুন") },
        text = { Column(Modifier.heightIn(max = 380.dp).verticalScroll(rememberScrollState())) {
            FilterOption("সব ধরন", filter.questionTypeId == null) { typeDialog = false; onChange(filter.copy(questionTypeId = null)) }
            types.filter { it.isActive == 1L || it.questionTypeId == filter.questionTypeId }.forEach { row ->
                FilterOption(row.label, filter.questionTypeId == row.questionTypeId) { typeDialog = false; onChange(filter.copy(questionTypeId = row.questionTypeId)) }
            }
        } }, confirmButton = {}, dismissButton = { TextButton(onClick = { typeDialog = false }) { Text("বন্ধ") } },
    )
}

@Composable
private fun FilterOption(label: String, selected: Boolean, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
        RadioButton(selected = selected, onClick = null)
        Text(label, color = MaterialTheme.colorScheme.onSurface)
    }
}
