package com.questionbank.app.ui.question

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.domain.question.TypeCqQuestionRepository
import com.questionbank.app.media.ImagePipeline
import com.questionbank.app.media.ImageScope
import com.questionbank.app.ui.components.AppHeader

@Composable
fun QuestionDetailScreen(
    topicId: String,
    groupKey: String,
    repository: TypeCqQuestionRepository,
    imagePipeline: ImagePipeline,
    onEdit: () -> Unit,
    onBack: () -> Unit,
) {
    var group by remember(topicId, groupKey) { mutableStateOf<SavedGroup?>(null) }
    var loading by remember(topicId, groupKey) { mutableStateOf(true) }
    LaunchedEffect(topicId, groupKey) {
        loading = true
        group = repository.loadGroup(topicId, groupKey)
        loading = false
    }
    Scaffold(topBar = { AppHeader(title = "প্রশ্নের বিস্তারিত", onBack = onBack) }) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            when {
                loading -> CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally))
                group == null -> Text("প্রশ্নটি আর পাওয়া যাচ্ছে না।", color = MaterialTheme.colorScheme.error)
                else -> {
                    val data = group!!
                    if (data.stimulusText.isNotBlank()) {
                        Text("উদ্দীপক", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
                        Text(data.stimulusText, style = MaterialTheme.typography.bodyLarge)
                    }
                    if (data.referenceText.isNotBlank()) {
                        Text("তথ্যসূত্র", style = MaterialTheme.typography.titleSmall)
                        Text(data.referenceText)
                    }
                    data.stimulusImages.sortedBy { it.position }.forEach { image ->
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            MediaThumbnail(imagePipeline, image.imageId, ImageScope.TYPE_CQ)
                            Column {
                                Text("উদ্দীপক ছবি · ${image.placement}")
                                Text("ক্রম ${image.position + 1}", style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                    data.subQuestions.forEach { question ->
                        Text("${question.label?.letter ?: "প্রশ্ন"} · ${marksText(question.marks)} নম্বর", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
                        Text(question.text, style = MaterialTheme.typography.bodyLarge)
                        if (question.shortAnswer.isNotBlank()) Text("সংক্ষিপ্ত উত্তর: ${question.shortAnswer}")
                        val parts = question.orderedSolutionParts.sortedBy { it.position }
                        if (parts.isNotEmpty()) {
                            Text("সমাধান", style = MaterialTheme.typography.labelLarge)
                            parts.forEach { part ->
                                if (part.partType == "TEXT") Text(part.textContent.orEmpty())
                                else part.imageId?.let { MediaThumbnail(imagePipeline, it, ImageScope.TYPE_CQ) }
                            }
                        }
                        if (question.boards.isNotEmpty()) Text("বোর্ড/সাল: " + question.boards.joinToString { "${it.boardCode} ${it.year}" }, style = MaterialTheme.typography.labelSmall)
                    }
                    if (data.stimulusBoards.isNotEmpty()) Text("উদ্দীপকের বোর্ড/সাল: " + data.stimulusBoards.joinToString { "${it.boardCode} ${it.year}" }, style = MaterialTheme.typography.labelSmall)
                    TextButton(onClick = onEdit, modifier = Modifier.fillMaxWidth()) { Text("সম্পাদনা করুন") }
                }
            }
        }
    }
}
