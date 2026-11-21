package com.questionbank.app.ui.question

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.questionbank.app.data.local.dao.ChapterCqQuestionCardDb
import com.questionbank.app.domain.question.BoardItem
import com.questionbank.app.domain.question.BoardTag
import com.questionbank.app.domain.question.QuestionSolutionPart
import com.questionbank.app.domain.question.QuestionStimulusImage
import com.questionbank.app.domain.question.PaperUsage
import com.questionbank.app.media.ImagePipeline
import com.questionbank.app.media.ImageScope
import com.questionbank.app.ui.format.toBengali

/** The Chapter CQ equivalent of the Type CQ stimulus/question group card. */
internal data class ChapterCqQuestionPresentation(
    val row: ChapterCqQuestionCardDb,
    val boards: List<BoardTag> = emptyList(),
    val solutionParts: List<QuestionSolutionPart> = emptyList(),
    val paperUsages: List<PaperUsage> = emptyList(),
)

internal data class ChapterCqStimulusPresentation(
    val boards: List<BoardTag> = emptyList(),
    val images: List<QuestionStimulusImage> = emptyList(),
)

internal data class ChapterCqQuestionGroupPresentation(
    val key: String,
    val stimulusId: String?,
    val stimulusText: String,
    val stimulusRating: Int?,
    /** Calculated from all persisted questions, before any search filtering. */
    val fallbackRating: Int,
    val referenceText: String,
    val stimulus: ChapterCqStimulusPresentation,
    val questions: List<ChapterCqQuestionPresentation>,
    /** Complete source membership; must survive a search-filtered visible subset for safe group deletion. */
    val allQuestionIds: List<String>,
    val paperUsages: List<PaperUsage>,
) {
    val rating: Int get() = (stimulusRating ?: fallbackRating).coerceIn(1, 5)
}

@Composable
internal fun ChapterCqQuestionGroupCard(
    number: Int,
    group: ChapterCqQuestionGroupPresentation,
    visibleQuestionIds: List<String>,
    selectedQuestionIds: Set<String>,
    boards: List<BoardItem>,
    imagePipeline: ImagePipeline,
    onSelectionChange: (Boolean) -> Unit,
    onEdit: (String) -> Unit,
    onView: (String) -> Unit,
    onCopy: (String) -> Unit,
    onAddToGroup: (String) -> Unit,
    onDelete: (List<String>) -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    val allSelected = visibleQuestionIds.isNotEmpty() && visibleQuestionIds.all { it in selectedQuestionIds }
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.primary)
                .padding(start = 10.dp, end = 4.dp, top = 2.dp, bottom = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text("প্রশ্ন ${number.toBengali()}", modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onPrimary, style = MaterialTheme.typography.labelLarge)
            RatingBadge(group.rating)
            Checkbox(checked = allSelected, onCheckedChange = onSelectionChange)
            androidx.compose.foundation.layout.Box {
                TextButton(onClick = { menuOpen = true }) { Text("⋮", color = MaterialTheme.colorScheme.onPrimary, fontSize = 20.sp) }
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    val first = visibleQuestionIds.firstOrNull() ?: group.questions.firstOrNull()?.row?.questionId
                    if (first != null) {
                        DropdownMenuItem(text = { Text("প্রশ্ন সম্পাদনা") }, onClick = { menuOpen = false; onEdit(first) })
                        DropdownMenuItem(text = { Text("বিস্তারিত / রেফারেন্স দেখুন") }, onClick = { menuOpen = false; onView(first) })
                        DropdownMenuItem(text = { Text("প্রশ্ন কপি") }, onClick = { menuOpen = false; onCopy(first) })
                        val stimulusId = group.stimulusId
                        if (!stimulusId.isNullOrBlank() && group.questions.size < 4) {
                            DropdownMenuItem(text = { Text("এই উদ্দীপকে প্রশ্ন যোগ") }, onClick = { menuOpen = false; onAddToGroup(stimulusId) })
                        }
                    }
                    DropdownMenuItem(text = { Text("সম্পূর্ণ গ্রুপ মুছুন", color = MaterialTheme.colorScheme.error) }, onClick = {
                        menuOpen = false
                        // Always delete the complete persisted group, not a search-filtered subset.
                        onDelete(group.allQuestionIds)
                    })
                }
            }
        }

        if (group.paperUsages.isNotEmpty()) {
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).background(MaterialTheme.colorScheme.surfaceVariant).padding(horizontal = 12.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("ব্যবহৃত প্রশ্নপত্র (${group.paperUsages.size.toBengali()})", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                group.paperUsages.forEach { usage ->
                    Text(
                        usage.shortName.ifBlank { usage.title },
                        Modifier.background(MaterialTheme.colorScheme.secondaryContainer, RoundedCornerShape(7.dp)).padding(horizontal = 7.dp, vertical = 2.dp),
                        color = MaterialTheme.colorScheme.onSecondaryContainer,
                        fontSize = 11.sp,
                    )
                }
            }
        }
        if (group.stimulus.boards.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant).padding(horizontal = 12.dp, vertical = 6.dp)) {
                TagChipRow(group.stimulus.boards, boards)
            }
        }

        Column(Modifier.padding(horizontal = 12.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            val upper = group.stimulus.images.filter { it.placement.equals("TOP", true) }.sortedBy { it.position }
            val lower = group.stimulus.images.filterNot { it.placement.equals("TOP", true) }.sortedBy { it.position }
            if (upper.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                upper.forEach { MediaThumbnail(imagePipeline, it.imageId, ImageScope.CHAPTER_CQ) }
            }
            if (group.stimulusText.isNotBlank()) {
                Text("উদ্দীপক", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
                RichLatexText(group.stimulusText, Modifier.fillMaxWidth())
            }
            if (group.referenceText.isNotBlank()) {
                var showReference by remember(group.referenceText) { mutableStateOf(false) }
                TextButton(onClick = { showReference = !showReference }) { Text(if (showReference) "রেফারেন্স লুকান" else "রেফারেন্স দেখুন") }
                if (showReference) Text(
                    group.referenceText,
                    Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(8.dp)).padding(10.dp),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            if (lower.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                lower.forEach { MediaThumbnail(imagePipeline, it.imageId, ImageScope.CHAPTER_CQ) }
            }

            group.questions.forEachIndexed { index, item ->
                if (index > 0) androidx.compose.material3.HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                val q = item.row
                Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("${q.label}. · ${marksText(q.marks)} নম্বর", modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
                        Text("রেটিং ${(q.rating?.toInt() ?: group.stimulusRating ?: group.fallbackRating).coerceIn(1, 5)}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (item.boards.isNotEmpty()) TagChipRow(item.boards, boards)
                    RichLatexText(q.questionText, Modifier.fillMaxWidth())
                    if (q.shortAnswer.isNotBlank()) { Text("সংক্ষিপ্ত উত্তর:", style = MaterialTheme.typography.bodyMedium); RichLatexText(q.shortAnswer, Modifier.fillMaxWidth()) }
                    if (item.solutionParts.isNotEmpty()) {
                        var showSolution by remember(q.questionId) { mutableStateOf(false) }
                        TextButton(onClick = { showSolution = !showSolution }) { Text(if (showSolution) "সমাধান লুকান" else "সমাধান দেখুন") }
                        if (showSolution) Column(
                            Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(9.dp)).padding(10.dp),
                            verticalArrangement = Arrangement.spacedBy(7.dp),
                        ) {
                            item.solutionParts.sortedBy { it.position }.forEach { part ->
                                if (part.partType == "IMAGE") part.imageId?.let { MediaThumbnail(imagePipeline, it, ImageScope.CHAPTER_CQ) }
                                else part.textContent?.takeIf { it.isNotBlank() }?.let { RichLatexText(it, Modifier.fillMaxWidth()) }
                            }
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        TextButton(onClick = { onView(q.questionId) }) { Text("বিস্তারিত") }
                        TextButton(onClick = { onEdit(q.questionId) }) { Text("সম্পাদনা") }
                        TextButton(onClick = { onCopy(q.questionId) }) { Text("কপি") }
                    }
                }
            }
        }
    }
}
