package com.questionbank.app.ui.hierarchy

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import com.questionbank.app.ui.components.AppHeader
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.questionbank.app.domain.hierarchy.AddResult
import com.questionbank.app.domain.hierarchy.HierarchyItem
import com.questionbank.app.domain.hierarchy.HierarchyName

/** Texts that differ between the subject, chapter and topic lists. */
data class HierarchyLabels(val title: String, val addButton: String, val dialogTitle: String)

private fun errorText(error: AddResult?): String? = when (error) {
    null, is AddResult.Added -> null
    AddResult.Blank -> "নাম খালি রাখা যাবে না।"
    AddResult.TooLong -> "নাম ${HierarchyName.MAX_LENGTH} অক্ষরের বেশি হতে পারবে না।"
    AddResult.Duplicate -> "এই নামে আগেই আছে।"
    AddResult.ParentMissing -> "মূল আইটেমটি আর নেই। ফিরে গিয়ে আবার চেষ্টা করুন।"
    is AddResult.Failed -> "সংরক্ষণ করা যায়নি।"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HierarchyListScreen(
    viewModel: HierarchyListViewModel,
    labels: HierarchyLabels,
    onItemClick: ((HierarchyItem) -> Unit)?,
    onBack: (() -> Unit)?,
) {
    val listState by viewModel.items.collectAsState()
    val parent by viewModel.parent.collectAsState()
    val error by viewModel.error.collectAsState()

    var showDialog by rememberSaveable { mutableStateOf(false) }
    var text by rememberSaveable { mutableStateOf("") }

    Scaffold(
        topBar = {
            val parentName = parent?.name
            AppHeader(
                title = if (parentName.isNullOrEmpty()) labels.title else "$parentName › ${labels.title}",
                onBack = onBack,
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(onClick = {
                text = ""
                viewModel.clearError()
                showDialog = true
            }, containerColor = MaterialTheme.colorScheme.primary, contentColor = MaterialTheme.colorScheme.onPrimary) { Text(labels.addButton) }
        },
    ) { innerPadding ->
        val current = listState
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            when {
                current == null -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                current.isEmpty() -> Text(
                    "এখনো কিছু যোগ করা হয়নি।",
                    modifier = Modifier.align(Alignment.Center).padding(24.dp),
                    style = MaterialTheme.typography.bodyLarge,
                )
                else -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 96.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(current, key = { it.id }) { item ->
                        Card(modifier = Modifier.fillMaxWidth()) {
                            val rowModifier = if (onItemClick != null) {
                                Modifier.fillMaxWidth().clickable { onItemClick(item) }.padding(16.dp)
                            } else {
                                Modifier.fillMaxWidth().padding(16.dp)
                            }
                            Text(item.name, modifier = rowModifier, style = MaterialTheme.typography.titleMedium)
                        }
                    }
                }
            }
        }
    }

    if (showDialog) {
        AlertDialog(
            onDismissRequest = { showDialog = false },
            title = { Text(labels.dialogTitle) },
            text = {
                OutlinedTextField(
                    value = text,
                    onValueChange = {
                        text = it
                        if (error != null) viewModel.clearError()
                    },
                    singleLine = true,
                    isError = error != null,
                    supportingText = { errorText(error)?.let { Text(it) } },
                )
            },
            confirmButton = {
                TextButton(onClick = { viewModel.add(text) { showDialog = false } }) { Text("যোগ করুন") }
            },
            dismissButton = {
                TextButton(onClick = { showDialog = false }) { Text("বাতিল") }
            },
        )
    }
}
