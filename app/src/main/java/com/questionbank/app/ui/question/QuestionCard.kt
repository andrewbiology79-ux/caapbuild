package com.questionbank.app.ui.question

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.questionbank.app.data.local.entity.TypeCqQuestionCategoriesEntity
import com.questionbank.app.domain.question.BoardItem
import com.questionbank.app.domain.question.BoardTag
import com.questionbank.app.domain.question.QuestionCardRules
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.domain.question.SavedSubQuestion
import com.questionbank.app.domain.question.groupBoardYears
import com.questionbank.app.ui.format.toBengali
import com.questionbank.app.ui.theme.LocalDarkTheme
import com.questionbank.app.media.ImagePipeline
import com.questionbank.app.media.ImageScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private val LegacyBlue = Color(0xFF3B4FD8)
private val LegacyBorder = Color(0xFFD5D9E2)
private val LegacyMuted = Color(0xFF64748B)

/** One complete stimulus and its sub-questions is rendered as exactly one card. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun QuestionCard(
    number: Int,
    group: SavedGroup,
    boards: List<BoardItem> = emptyList(),
    categories: List<TypeCqQuestionCategoriesEntity> = emptyList(),
    imagePipeline: ImagePipeline? = null,
    selected: Boolean = false,
    onToggleSelected: ((Boolean) -> Unit)? = null,
    onEdit: (() -> Unit)? = null,
    onDelete: (() -> Unit)? = null,
    onCopy: (() -> Unit)? = null,
    onCut: (() -> Unit)? = null,
    onPasteBefore: (() -> Unit)? = null,
    onPasteAfter: (() -> Unit)? = null,
    canPaste: Boolean = false,
    onView: (() -> Unit)? = null,
    onQuestionCategoryChange: ((String, List<String>) -> Unit)? = null,
    onQuestionConcept: ((SavedSubQuestion) -> Unit)? = null,
) {
    var menuOpen by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    if (confirmDelete) AlertDialog(
        onDismissRequest = { confirmDelete = false },
        title = { Text("প্রশ্ন কার্ড মুছবেন?") },
        text = { Text("এই কার্ডের অন্তর্ভুক্ত সব প্রশ্ন, Concept ও সংযুক্ত রেকর্ড মুছে যাবে। আগে তৈরি প্রশ্নপত্রের Snapshot থাকবে, তবে মূল Source Link বিচ্ছিন্ন হবে।") },
        confirmButton = { TextButton(onClick = { confirmDelete = false; onDelete?.invoke() }) { Text("মুছুন") } },
        dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("বাতিল") } },
    )

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.5.dp, if (LocalDarkTheme.current) Color(0xFF6678FF) else LegacyBlue),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().background(LegacyBlue).padding(start = 12.dp, end = 5.dp, top = 3.dp, bottom = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "প্রশ্ন ${number.toBengali()}",
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp,
            )
            if (onToggleSelected != null) {
                Checkbox(
                    checked = selected,
                    onCheckedChange = onToggleSelected,
                    modifier = Modifier.semantics { contentDescription = "প্রশ্ন কার্ড নির্বাচন" },
                    colors = CheckboxDefaults.colors(
                        checkedColor = Color.White,
                        uncheckedColor = Color.White,
                        checkmarkColor = LegacyBlue,
                    ),
                )
            }
            Spacer(Modifier.weight(1f))
            RatingBadge(QuestionCardRules.rating(group))
            if (onEdit != null || onDelete != null || onCopy != null || onCut != null || onPasteBefore != null || onPasteAfter != null || onView != null) {
                Box {
                    Box(
                        modifier = Modifier.size(40.dp).clickable { menuOpen = true }
                            .semantics { contentDescription = "আরও বিকল্প" },
                        contentAlignment = Alignment.Center,
                    ) { Text("⋮", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 22.sp) }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        if (onEdit != null) DropdownMenuItem(text = { Text("প্রশ্ন সম্পাদনা") }, onClick = { menuOpen = false; onEdit() })
                        if (onView != null) DropdownMenuItem(text = { Text("রেফারেন্স দেখুন") }, onClick = { menuOpen = false; onView() })
                        if (onCopy != null) DropdownMenuItem(text = { Text("Copy") }, onClick = { menuOpen = false; onCopy() })
                        if (onCut != null) DropdownMenuItem(text = { Text("Cut") }, onClick = { menuOpen = false; onCut() })
                        if (onPasteAfter != null) DropdownMenuItem(text = { Text("Paste after", color = if (canPaste) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant) }, enabled = canPaste, onClick = { menuOpen = false; onPasteAfter() })
                        if (onPasteBefore != null) DropdownMenuItem(text = { Text("Paste before", color = if (canPaste) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant) }, enabled = canPaste, onClick = { menuOpen = false; onPasteBefore() })
                        if (onDelete != null) DropdownMenuItem(text = { Text("Delete", color = MaterialTheme.colorScheme.error) }, onClick = { menuOpen = false; confirmDelete = true })
                    }
                }
            }
        }

        val paperCategories = remember(group.paperUsages) {
            group.paperUsages.map { it.categoryName.trim() }.filter { it.isNotBlank() }.distinct()
        }
        // Match the legacy Caa layout: only stimulus-level boards appear in this strip;
        // each sub-question's own boards stay beside its individual solution button below.
        val cardBoards = group.stimulusBoards
        if (paperCategories.isNotEmpty() || cardBoards.isNotEmpty()) {
            Column(
                modifier = Modifier.fillMaxWidth().background(Color(0xFFF8FAFC)).padding(horizontal = 12.dp, vertical = 7.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                // Paper-category chips occupy their own full-width horizontal strip; newest usage is supplied first.
                if (paperCategories.isNotEmpty()) PaperCategoryStrip(paperCategories)
                // Board chips use the full card width and flow right-to-left by wrapping from the right edge.
                if (cardBoards.isNotEmpty()) BoardTagsFlow(cardBoards, boards, Modifier.fillMaxWidth())
            }
        }

        val upperImages = group.stimulusImages.filter { it.placement.equals("TOP", true) }.sortedBy { it.position }
        val lowerImages = group.stimulusImages.filterNot { it.placement.equals("TOP", true) }.sortedBy { it.position }
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(9.dp),
        ) {
            upperImages.forEach { image ->
                if (imagePipeline != null) MediaFullImage(imagePipeline, image.imageId, ImageScope.TYPE_CQ)
                else Text("উদ্দীপকের ছবি অনুপলব্ধ", style = MaterialTheme.typography.labelSmall)
            }
            if (group.stimulusText.isNotBlank()) {
                Text("উদ্দীপক", style = MaterialTheme.typography.labelLarge, color = LegacyBlue, fontWeight = FontWeight.Bold)
                RichLatexText(group.stimulusText, Modifier.fillMaxWidth())
            }
            lowerImages.forEach { image ->
                if (imagePipeline != null) MediaFullImage(imagePipeline, image.imageId, ImageScope.TYPE_CQ)
                else Text("উদ্দীপকের ছবি অনুপলব্ধ", style = MaterialTheme.typography.labelSmall)
            }
            // Keep BOTTOM stimulus images immediately after the stimulus, matching the legacy card sequence.
            if (group.referenceText.isNotBlank()) {
                var showReference by remember(group.referenceText) { mutableStateOf(false) }
                TextButton(onClick = { showReference = !showReference }, modifier = Modifier.padding(0.dp)) {
                    Text(if (showReference) "রেফারেন্স লুকান" else "রেফারেন্স দেখুন")
                }
                if (showReference) Text(
                    group.referenceText,
                    modifier = Modifier.fillMaxWidth().background(Color(0xFFF8FAFC), RoundedCornerShape(9.dp)).padding(10.dp),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            group.subQuestions.forEachIndexed { index, question ->
                if (index > 0) androidx.compose.material3.HorizontalDivider(color = Color(0xFFE2E8F0))
                QuestionCardSubQuestion(
                    question = question,
                    boards = boards,
                    categories = categories,
                    imagePipeline = imagePipeline,
                    onCategoryChange = onQuestionCategoryChange,
                    onConcept = onQuestionConcept,
                )
            }
        }
    }
}

@Composable
private fun QuestionCardSubQuestion(
    question: SavedSubQuestion,
    boards: List<BoardItem>,
    categories: List<TypeCqQuestionCategoriesEntity>,
    imagePipeline: ImagePipeline?,
    onCategoryChange: ((String, List<String>) -> Unit)?,
    onConcept: ((SavedSubQuestion) -> Unit)?,
) {
    var showSolution by remember(question.id) { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            Text(
                "${question.label?.letter?.let { "$it." } ?: "প্রশ্ন"}",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF1B1F2A),
            )
            RichLatexText(question.text, Modifier.weight(1f))
        }
        if (question.shortAnswer.isNotBlank()) {
            Text("সংক্ষিপ্ত উত্তর:", style = MaterialTheme.typography.labelMedium, color = LegacyMuted)
            RichLatexText(question.shortAnswer, Modifier.fillMaxWidth())
        }
        val hasSolution = question.orderedSolutionParts.isNotEmpty() || question.solutionParts.any(String::isNotBlank)
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Surface(
                modifier = Modifier.height(30.dp).clickable(enabled = hasSolution) { showSolution = !showSolution },
                shape = RoundedCornerShape(16.dp),
                color = if (hasSolution) Color(0xFFEFF6FF) else Color(0xFFF1F5F9),
                border = BorderStroke(1.dp, if (hasSolution) Color(0xFFBFDBFE) else Color(0xFFE2E8F0)),
            ) {
                Box(Modifier.padding(horizontal = 9.dp), contentAlignment = Alignment.Center) {
                    Text(
                        if (showSolution) "সমাধান লুকাও" else "সমাধান দেখো",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = if (hasSolution) Color(0xFF1D4ED8) else LegacyMuted,
                    )
                }
            }
            if (question.boards.isNotEmpty()) BoardTagsFlow(question.boards, boards, Modifier.weight(1f), rightToLeft = false)
        }
        if (showSolution && hasSolution) {
            Column(
                Modifier.fillMaxWidth().background(Color(0xFFF8FAFC), RoundedCornerShape(9.dp))
                    .border(1.dp, Color(0xFFE2E8F0), RoundedCornerShape(9.dp)).padding(10.dp),
                verticalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                Text("সমাধান:", style = MaterialTheme.typography.labelLarge, color = LegacyBlue, fontWeight = FontWeight.Bold)
                val ordered = question.orderedSolutionParts.sortedBy { it.position }
                if (ordered.isNotEmpty()) {
                    ordered.forEach { part ->
                        if (part.partType == "IMAGE") {
                            val id = part.imageId
                            if (id != null && imagePipeline != null) MediaFullImage(imagePipeline, id, ImageScope.TYPE_CQ)
                            else Text("সমাধানের ছবি অনুপলব্ধ", style = MaterialTheme.typography.labelSmall)
                        } else if (!part.textContent.isNullOrBlank()) RichLatexText(part.textContent, Modifier.fillMaxWidth())
                    }
                } else question.solutionParts.forEach { RichLatexText(it, Modifier.fillMaxWidth()) }
            }
        }
        if (onCategoryChange != null || onConcept != null) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                if (onCategoryChange != null) QuestionCategoryPicker(
                    categories = categories,
                    stateKey = question.id,
                    selectedIds = question.categoryIds,
                    onSelectionChange = { onCategoryChange(question.id, it) },
                    modifier = Modifier.weight(1f),
                )
                if (onConcept != null) TextButton(
                    onClick = { onConcept(question) },
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 9.dp, vertical = 1.dp),
                ) { Text(if (question.conceptParts.isEmpty()) "+ Concept" else "Concept", fontSize = 11.sp, fontWeight = FontWeight.Bold) }
            }
        }
    }
}

@Composable
private fun QuestionCategoryPicker(
    categories: List<TypeCqQuestionCategoriesEntity>,
    stateKey: String,
    selectedIds: List<String>,
    onSelectionChange: (List<String>) -> Unit,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    // Keep rapid multi-select taps in sync while asynchronous Room writes are still in flight.
    var workingSelection by remember(stateKey) { mutableStateOf(selectedIds) }
    androidx.compose.runtime.LaunchedEffect(stateKey, selectedIds) {
        workingSelection = selectedIds
    }
    val selectedNames = categories.filter { it.categoryId in workingSelection }.map { it.name }
    Box(modifier) {
        Text(
            text = if (selectedNames.isEmpty()) "প্রশ্নের ক্যাটাগরি নির্বাচন ▾" else selectedNames.joinToString(" · ") + " ▾",
            modifier = Modifier.fillMaxWidth().background(Color(0xFFEEF2FF), RoundedCornerShape(8.dp))
                .border(1.dp, Color(0xFFC7D2FE), RoundedCornerShape(8.dp)).clickable { expanded = true }
                .padding(horizontal = 9.dp, vertical = 7.dp),
            color = Color(0xFF2A3BB0), fontSize = 10.sp, fontWeight = FontWeight.SemiBold,
            maxLines = 1,
        )
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            if (categories.isEmpty()) {
                DropdownMenuItem(text = { Text("কোনো ক্যাটাগরি নেই") }, onClick = { expanded = false }, enabled = false)
            }
            categories.filter { it.isArchived == 0L }.forEach { category ->
                val checked = category.categoryId in workingSelection
                DropdownMenuItem(
                    text = { Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(checked, onCheckedChange = null); Text(category.name) } },
                    onClick = {
                        val next = if (checked) workingSelection - category.categoryId else workingSelection + category.categoryId
                        workingSelection = next
                        onSelectionChange(next)
                    },
                )
            }
            if (workingSelection.isNotEmpty()) DropdownMenuItem(
                text = { Text("সব ক্যাটাগরি সরান", color = MaterialTheme.colorScheme.error) },
                onClick = { workingSelection = emptyList(); onSelectionChange(emptyList()); expanded = false },
            )
        }
    }
}

/** A horizontally scrollable paper-category strip with a small visible scrollbar when it overflows. */
@Composable
private fun PaperCategoryStrip(categories: List<String>) {
    val scroll = rememberScrollState()
    var viewportWidth by remember { mutableStateOf(0) }
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth().onSizeChanged { viewportWidth = it.width }.horizontalScroll(scroll),
            horizontalArrangement = Arrangement.spacedBy(5.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            categories.forEach { category ->
                Text(
                    category,
                    modifier = Modifier.background(Color(0xFFECFDF5), RoundedCornerShape(7.dp))
                        .border(1.dp, Color(0xFFBBF7D0), RoundedCornerShape(7.dp))
                        .padding(horizontal = 7.dp, vertical = 3.dp),
                    color = Color(0xFF166534), fontSize = 10.sp, fontWeight = FontWeight.Bold,
                    maxLines = 1,
                )
            }
        }
        if (scroll.maxValue > 0 && viewportWidth > 0) {
            Canvas(Modifier.fillMaxWidth().height(3.dp)) {
                val viewport = viewportWidth.toFloat()
                val total = viewport + scroll.maxValue.toFloat()
                val thumbWidth = (size.width * (viewport / total)).coerceAtLeast(22.dp.toPx()).coerceAtMost(size.width)
                val travel = (size.width - thumbWidth).coerceAtLeast(0f)
                val left = if (scroll.maxValue == 0) 0f else travel * (scroll.value.toFloat() / scroll.maxValue.toFloat())
                drawRoundRect(Color(0xFFE2E8F0), cornerRadius = CornerRadius(size.height / 2f))
                drawRoundRect(
                    Color(0xFF64748B),
                    topLeft = Offset(left, 0f),
                    size = Size(thumbWidth, size.height),
                    cornerRadius = CornerRadius(size.height / 2f),
                )
            }
        }
    }
}

/** Board chips align to the right and wrap to the next line without a horizontal scrollbar. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BoardTagsFlow(
    tags: List<BoardTag>,
    boards: List<BoardItem>,
    modifier: Modifier = Modifier,
    rightToLeft: Boolean = true,
) {
    val content: @Composable () -> Unit = {
        FlowRow(
            modifier = modifier,
            horizontalArrangement = Arrangement.Start,
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            groupBoardYears(tags).forEach { group ->
                val name = boards.firstOrNull { it.code == group.boardCode }?.displayName ?: group.boardCode
                val years = group.years.joinToString(",") { it.toString().takeLast(2) }
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Text(
                        "$name'$years",
                        modifier = Modifier.padding(end = 4.dp).background(Color.White, RoundedCornerShape(6.dp))
                            .border(1.dp, LegacyBorder, RoundedCornerShape(6.dp)).padding(horizontal = 7.dp, vertical = 3.dp),
                        color = Color(0xFF1B1F2A), fontSize = 9.sp, fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
    if (rightToLeft) CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) { content() }
    else content()
}

private sealed interface FullImageState {
    data object Loading : FullImageState
    data object Missing : FullImageState
    data class Ready(val bitmap: Bitmap) : FullImageState
}

/** Full-width, uncropped card image. The stored asset is decoded at its available resolution. */
@Composable
internal fun MediaFullImage(pipeline: ImagePipeline, imageId: String, imageScope: ImageScope) {
    val state by produceState<FullImageState>(FullImageState.Loading, imageId, imageScope) {
        value = withContext(Dispatchers.IO) {
            try {
                val file = pipeline.fileForImage(imageId, imageScope) ?: return@withContext FullImageState.Missing
                val bitmap = BitmapFactory.decodeFile(file.absolutePath)
                if (bitmap == null) FullImageState.Missing else FullImageState.Ready(bitmap)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                FullImageState.Missing
            } catch (_: OutOfMemoryError) {
                FullImageState.Missing
            }
        }
    }
    when (val current = state) {
        FullImageState.Loading -> Box(Modifier.fillMaxWidth().height(80.dp).background(Color(0xFFF8FAFC)))
        FullImageState.Missing -> Text("ছবি অনুপলব্ধ", style = MaterialTheme.typography.labelSmall, color = LegacyMuted)
        is FullImageState.Ready -> Image(
            bitmap = current.bitmap.asImageBitmap(),
            contentDescription = "সংযুক্ত ছবি",
            modifier = Modifier.fillMaxWidth().aspectRatio(current.bitmap.width.toFloat() / current.bitmap.height.toFloat())
                .border(1.dp, LegacyBorder, RoundedCornerShape(8.dp)),
            contentScale = ContentScale.Fit,
        )
    }
}

/** Yellow rating badge matching the legacy Caa card ribbon. */
@Composable
internal fun RatingBadge(rating: Int) {
    val dark = LocalDarkTheme.current
    val background = if (dark) Color(0xFF422006) else Color(0xFFFEF9C3)
    val textColor = if (dark) Color(0xFFFDE68A) else Color(0xFF713F12)
    val border = if (dark) Color(0xFF713F12) else Color(0xFFFDE047)
    val shape = RoundedCornerShape(7.dp)
    Text(
        ratingText(rating),
        modifier = Modifier.background(background, shape).border(1.dp, border, shape)
            .padding(horizontal = 8.dp, vertical = 3.dp),
        color = textColor, fontWeight = FontWeight.Bold, fontSize = 10.sp,
    )
}
