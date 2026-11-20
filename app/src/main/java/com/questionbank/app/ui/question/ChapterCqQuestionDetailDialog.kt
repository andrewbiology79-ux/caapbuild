package com.questionbank.app.ui.question

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.questionbank.app.domain.repository.ChapterCqRepository
import com.questionbank.app.media.ImagePipeline
import com.questionbank.app.media.ImageScope
import kotlinx.coroutines.CancellationException

private data class ChapterCqDetailData(
    val questionText: String,
    val answer: String,
    val stimulusText: String,
    val referenceText: String,
    val marks: Double,
    val rating: Long?,
    val stimulusRating: Long?,
    val images: List<com.questionbank.app.data.local.entity.ChapterCqStimulusImagesEntity>,
    val parts: List<com.questionbank.app.data.local.entity.ChapterCqSolutionPartsEntity>,
    val boards: List<com.questionbank.app.data.local.entity.ChapterCqQuestionBoardsEntity>,
    val categoryNames: List<String>,
)

@Composable
fun ChapterCqQuestionDetailDialog(
    questionId: String,
    repository: ChapterCqRepository,
    imagePipeline: ImagePipeline,
    onDismiss: () -> Unit,
) {
    val categoryCatalog by repository.observeCategories().collectAsState(initial = emptyList())
    var data by remember(questionId) { mutableStateOf<ChapterCqDetailData?>(null) }
    var loading by remember(questionId) { mutableStateOf(true) }
    LaunchedEffect(questionId, categoryCatalog) {
        loading = true
        data = try {
            val question = repository.loadQuestion(questionId)
            if (question == null) null else {
                val stimulus = question.stimulusId?.let { repository.loadStimulus(it) }
                val images = question.stimulusId?.let { repository.loadStimulusImages(it) }.orEmpty()
                val parts = repository.loadSolutionParts(questionId)
                val boards = repository.loadQuestionBoards(questionId)
                val categoryIds = repository.loadQuestionCategories(questionId).map { it.categoryId }.toSet()
                val categoryNames = categoryCatalog.filter { it.categoryId in categoryIds }.map { it.name }
                ChapterCqDetailData(question.questionText, question.shortAnswer, stimulus?.stimulusText.orEmpty(), stimulus?.referenceText.orEmpty(), question.marks, question.rating, stimulus?.rating, images, parts, boards, categoryNames)
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            null
        }
        loading = false
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("প্রশ্নের বিস্তারিত") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (loading) CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally))
                else if (data == null) Text("প্রশ্নটি আর পাওয়া যাচ্ছে না।", color = MaterialTheme.colorScheme.error)
                else {
                    val item = data!!
                    if (item.stimulusText.isNotBlank()) { Text("উদ্দীপক", color = MaterialTheme.colorScheme.primary); Text(item.stimulusText) }
                    if (item.referenceText.isNotBlank()) { Text("তথ্যসূত্র", color = MaterialTheme.colorScheme.primary); Text(item.referenceText) }
                    item.images.sortedBy { it.position }.forEach { image ->
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            MediaThumbnail(imagePipeline, image.imageId, ImageScope.CHAPTER_CQ)
                            Text("উদ্দীপকের ছবি · ${image.placement}")
                        }
                    }
                    Text("প্রশ্ন", color = MaterialTheme.colorScheme.primary)
                    Text(item.questionText)
                    if (item.answer.isNotBlank()) { Text("উত্তর", color = MaterialTheme.colorScheme.primary); Text(item.answer) }
                    if (item.parts.isNotEmpty()) {
                        Text("সমাধান", color = MaterialTheme.colorScheme.primary)
                        item.parts.sortedBy { it.position }.forEach { part ->
                            if (part.partType == "TEXT") Text(part.textContent.orEmpty())
                            else part.imageId?.let { MediaThumbnail(imagePipeline, it, ImageScope.CHAPTER_CQ) }
                        }
                    }
                    if (item.boards.isNotEmpty()) Text("বোর্ড/সাল: " + item.boards.joinToString { "${it.boardCode} ${it.year}" })
                    if (item.categoryNames.isNotEmpty()) Text("ক্যাটাগরি: ${item.categoryNames.joinToString()}")
                    Text("নম্বর: ${item.marks} · রেটিং: ${item.rating ?: item.stimulusRating ?: 3}")
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("বন্ধ করুন") } },
    )
}
