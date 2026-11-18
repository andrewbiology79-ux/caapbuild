package com.questionbank.app.ui.question

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.questionbank.app.ui.components.AppHeader
import com.questionbank.app.ui.format.toBengali
import com.questionbank.app.ui.format.toBengaliDigits
import com.questionbank.app.domain.question.SavedGroup

internal fun marksText(marks: Double): String =
    (if (marks % 1.0 == 0.0) marks.toInt().toString() else marks.toString()).toBengaliDigits()

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuestionListScreen(
    viewModel: QuestionListViewModel,
    savedCount: Int,
    onSavedShown: () -> Unit,
    onAdd: () -> Unit,
    onBack: () -> Unit,
) {
    val groups by viewModel.groups.collectAsState()
    val topicName by viewModel.topicName.collectAsState()
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(savedCount) {
        if (savedCount > 0) {
            snackbar.showSnackbar("${savedCount.toBengali()} টি প্রশ্ন সংরক্ষিত হয়েছে ✓")
            onSavedShown()
        }
    }

    Scaffold(
        topBar = {
            AppHeader(
                title = if (topicName.isNullOrEmpty()) "প্রশ্ন" else "$topicName › প্রশ্ন",
                onBack = onBack,
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
        floatingActionButton = { ExtendedFloatingActionButton(onClick = onAdd, containerColor = MaterialTheme.colorScheme.primary, contentColor = MaterialTheme.colorScheme.onPrimary) { Text("+ প্রশ্ন যোগ করুন") } },
    ) { innerPadding ->
        val current = groups
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            when {
                current == null -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                current.isEmpty() -> Text(
                    "এই টপিকে এখনো কোনো প্রশ্ন নেই।",
                    modifier = Modifier.align(Alignment.Center).padding(24.dp),
                    style = MaterialTheme.typography.bodyLarge,
                )
                else -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 96.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    item(key = "count") {
                        Text(
                            "মোট ${current.sumOf { it.subQuestions.size }.toBengali()} টি প্রশ্ন",
                            style = MaterialTheme.typography.labelLarge,
                        )
                    }
                    items(current, key = { it.stimulusId ?: it.subQuestions.first().id }) { group ->
                        GroupCard(group)
                    }
                }
            }
        }
    }
}

@Composable
private fun GroupCard(group: SavedGroup) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (group.stimulusText.isNotEmpty()) {
                Text("উদ্দীপক", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                Text(group.stimulusText, style = MaterialTheme.typography.bodyLarge)
            }
            group.subQuestions.forEach { q ->
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    val head = (q.label?.let { "${it.letter}) ${it.typeLabel}" } ?: "প্রশ্ন") + " · ${marksText(q.marks)} নম্বর"
                    Text(head, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                    Text(q.text, style = MaterialTheme.typography.bodyLarge)
                    if (q.shortAnswer.isNotEmpty()) {
                        Text("উত্তর: ${q.shortAnswer}", style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }
    }
}
