package com.questionbank.app.ui.question

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.questionbank.app.domain.question.BoardItem
import com.questionbank.app.domain.question.QuestionCardRules
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.ui.format.toBengali
import com.questionbank.app.ui.theme.LocalDarkTheme
import com.questionbank.app.media.ImagePipeline
import com.questionbank.app.media.ImageScope

/**
 * One visual card represents a complete stimulus/question group. The ribbon, rating, selection control,
 * source tags, stimulus images and question solution panels follow the reference CollectionScreen order.
 * Android uses Compose-native controls and Bengali labels, while preserving the source layout hierarchy.
 */
@Composable
fun QuestionCard(
    number: Int,
    group: SavedGroup,
    boards: List<BoardItem> = emptyList(),
    imagePipeline: ImagePipeline? = null,
    selected: Boolean = false,
    onToggleSelected: ((Boolean) -> Unit)? = null,
    onEdit: (() -> Unit)? = null,
    onDelete: (() -> Unit)? = null,
    onCopy: (() -> Unit)? = null,
    onView: (() -> Unit)? = null,
) {
    var menuOpen by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    if (confirmDelete) AlertDialog(
        onDismissRequest = { confirmDelete = false },
        title = { Text("প্রশ্ন কার্ড মুছবেন?") },
        text = { Text("এই কার্ডের অন্তর্ভুক্ত সব প্রশ্ন মুছে যাবে। সার্চের ফলাফলে কিছু প্রশ্ন দেখা গেলেও সম্পূর্ণ গ্রুপটি মুছবে। সংরক্ষিত প্রশ্নপত্রে ব্যবহৃত প্রশ্ন হলে মুছে ফেলা আটকে যেতে পারে।") },
        confirmButton = { TextButton(onClick = { confirmDelete = false; onDelete?.invoke() }) { Text("মুছুন") } },
        dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("বাতিল") } },
    )
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.primary)
                .padding(start = 8.dp, end = 4.dp, top = 3.dp, bottom = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "প্রশ্ন ${number.toBengali()}",
                modifier = Modifier.weight(1f),
                color = MaterialTheme.colorScheme.onPrimary,
                fontWeight = FontWeight.SemiBold,
                fontSize = 14.sp,
            )
            RatingBadge(QuestionCardRules.rating(group))
            if (onToggleSelected != null) {
                Checkbox(checked = selected, onCheckedChange = onToggleSelected)
            }
            if (onEdit != null || onDelete != null || onCopy != null || onView != null) {
                Spacer(Modifier.width(2.dp))
                Box {
                    Box(
                        modifier = Modifier.size(40.dp).clickable { menuOpen = true }
                            .semantics { contentDescription = "আরও বিকল্প" },
                        contentAlignment = Alignment.Center,
                    ) { Text("⋮", color = MaterialTheme.colorScheme.onPrimary, fontWeight = FontWeight.Bold, fontSize = 20.sp) }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        if (onEdit != null) DropdownMenuItem(text = { Text("প্রশ্ন সম্পাদনা") }, onClick = { menuOpen = false; onEdit() })
                        if (onView != null) DropdownMenuItem(text = { Text("বিস্তারিত / রেফারেন্স দেখুন") }, onClick = { menuOpen = false; onView() })
                        if (onCopy != null) DropdownMenuItem(text = { Text("সম্পূর্ণ গ্রুপ কপি") }, onClick = { menuOpen = false; onCopy() })
                        if (onDelete != null) DropdownMenuItem(text = { Text("সম্পূর্ণ গ্রুপ মুছুন", color = MaterialTheme.colorScheme.error) }, onClick = { menuOpen = false; confirmDelete = true })
                    }
                }
            }
        }

        if (group.paperUsages.isNotEmpty()) {
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).background(MaterialTheme.colorScheme.surfaceVariant)
                    .padding(horizontal = 12.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("ব্যবহৃত প্রশ্নপত্র (${group.paperUsages.size.toBengali()})", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                group.paperUsages.forEach { usage ->
                    Text(
                        usage.shortName.ifBlank { usage.title },
                        modifier = Modifier.background(MaterialTheme.colorScheme.secondaryContainer, RoundedCornerShape(7.dp)).padding(horizontal = 7.dp, vertical = 2.dp),
                        color = MaterialTheme.colorScheme.onSecondaryContainer,
                        fontSize = 11.sp,
                    )
                }
            }
        }
        val stimulusTags = group.stimulusBoards
        if (stimulusTags.isNotEmpty()) {
            Row(
                modifier = Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant)
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            ) { TagChipRow(stimulusTags, boards) }
        }

        val upperImages = group.stimulusImages.filter { it.placement.equals("TOP", true) }.sortedBy { it.position }
        val lowerImages = group.stimulusImages.filterNot { it.placement.equals("TOP", true) }.sortedBy { it.position }
        Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            if (upperImages.isNotEmpty()) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    upperImages.forEach { image ->
                        if (imagePipeline != null) MediaThumbnail(imagePipeline, image.imageId, ImageScope.TYPE_CQ)
                        else Text("উদ্দীপক ছবি", style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
            if (group.stimulusText.isNotBlank()) {
                Text("উদ্দীপক", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                Text(group.stimulusText, style = MaterialTheme.typography.bodyLarge)
            }
            if (group.referenceText.isNotBlank()) {
                var showReference by remember(group.referenceText) { mutableStateOf(false) }
                TextButton(onClick = { showReference = !showReference }, modifier = Modifier.padding(0.dp)) {
                    Text(if (showReference) "রেফারেন্স লুকান" else "রেফারেন্স দেখুন")
                }
                if (showReference) {
                    Text(group.referenceText, modifier = Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(8.dp)).padding(10.dp), style = MaterialTheme.typography.bodyMedium)
                }
            }
            if (lowerImages.isNotEmpty()) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    lowerImages.forEach { image ->
                        if (imagePipeline != null) MediaThumbnail(imagePipeline, image.imageId, ImageScope.TYPE_CQ)
                        else Text("উদ্দীপক ছবি", style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
            group.subQuestions.forEachIndexed { index, question ->
                if (index > 0) androidx.compose.material3.HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                QuestionCardSubQuestion(question = question, boards = boards, imagePipeline = imagePipeline)
            }
        }
    }
}

@Composable
private fun QuestionCardSubQuestion(
    question: com.questionbank.app.domain.question.SavedSubQuestion,
    boards: List<BoardItem>,
    imagePipeline: ImagePipeline?,
) {
    var showSolution by remember(question.id) { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                "${question.label?.letter?.let { "$it." } ?: "প্রশ্ন"} · ${marksText(question.marks)} নম্বর",
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
            )
            if (question.boards.isNotEmpty()) Text("বোর্ড/সাল", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (question.boards.isNotEmpty()) TagChipRow(question.boards, boards)
        Text(question.text, style = MaterialTheme.typography.bodyLarge)
        if (question.shortAnswer.isNotBlank()) Text("সংক্ষিপ্ত উত্তর: ${question.shortAnswer}", style = MaterialTheme.typography.bodyMedium)
        val hasSolution = question.orderedSolutionParts.isNotEmpty() || question.solutionParts.any(String::isNotBlank)
        if (hasSolution) {
            TextButton(onClick = { showSolution = !showSolution }, modifier = Modifier.padding(0.dp)) {
                Text(if (showSolution) "সমাধান লুকান" else "সমাধান দেখুন")
            }
            if (showSolution) {
                Column(
                    Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(9.dp)).padding(10.dp),
                    verticalArrangement = Arrangement.spacedBy(7.dp),
                ) {
                    val ordered = question.orderedSolutionParts.sortedBy { it.position }
                    if (ordered.isNotEmpty()) {
                        ordered.forEach { part ->
                            if (part.partType == "IMAGE") {
                                val id = part.imageId
                                if (id != null && imagePipeline != null) MediaThumbnail(imagePipeline, id, ImageScope.TYPE_CQ)
                                else Text("সমাধানের ছবি অনুপলব্ধ", style = MaterialTheme.typography.labelSmall)
                            } else if (!part.textContent.isNullOrBlank()) Text(part.textContent, style = MaterialTheme.typography.bodyMedium)
                        }
                    } else {
                        question.solutionParts.forEach { Text(it, style = MaterialTheme.typography.bodyMedium) }
                    }
                }
            }
        }
    }
}

/** Yellow rating badge (plan 39.4): light #FEF9C3 / #713F12 / #FDE047, dark #422006 / #FDE68A. */
@Composable
internal fun RatingBadge(rating: Int) {
    val dark = LocalDarkTheme.current
    val background = if (dark) Color(0xFF422006) else Color(0xFFFEF9C3)
    val textColor = if (dark) Color(0xFFFDE68A) else Color(0xFF713F12)
    val border = if (dark) Color(0xFF713F12) else Color(0xFFFDE047)
    val shape = RoundedCornerShape(8.dp)
    Text(
        ratingText(rating),
        modifier = Modifier
            .background(background, shape)
            .border(1.dp, border, shape)
            .padding(horizontal = 8.dp, vertical = 2.dp),
        color = textColor,
        fontWeight = FontWeight.SemiBold,
        fontSize = 12.sp,
    )
}
