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
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.verticalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.questionbank.app.data.local.entity.TypeCqQuestionCategoriesEntity
import com.questionbank.app.domain.question.BoardItem
import com.questionbank.app.domain.question.BoardTag
import com.questionbank.app.domain.question.QuestionCardRules
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.domain.question.SavedSubQuestion
import com.questionbank.app.media.ImagePipeline
import com.questionbank.app.media.ImageScope
import com.questionbank.app.ui.format.toBengali
import com.questionbank.app.ui.format.toBengaliDigits
import com.questionbank.app.ui.theme.LocalDarkTheme
import com.questionbank.app.ui.theme.TypeCqCardTokens
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private val LegacyRibbon = TypeCqCardTokens.RibbonLight
private val LegacyRibbonDark = TypeCqCardTokens.RibbonDark
private val LegacyMuted = TypeCqCardTokens.Muted

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
    onView: (() -> Unit)? = null,
    onCategoriesChanged: ((List<String>) -> Unit)? = null,
    onConcept: (() -> Unit)? = null,
    onCut: (() -> Unit)? = null,
    onPasteBefore: (() -> Unit)? = null,
    onPasteAfter: (() -> Unit)? = null,
    canPaste: Boolean = true,
) {
    var menuOpen by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var categoryDialog by remember { mutableStateOf(false) }
    var referenceDialog by remember { mutableStateOf(false) }
    val dark = LocalDarkTheme.current
    val ribbon = if (dark) LegacyRibbonDark else LegacyRibbon

    if (confirmDelete) AlertDialog(
        onDismissRequest = { confirmDelete = false },
        title = { Text("প্রশ্ন কার্ড মুছবেন?") },
        text = { Text("এই কার্ডের অন্তর্ভুক্ত সব প্রশ্ন মুছে যাবে। সংরক্ষিত প্রশ্নপত্রে ব্যবহৃত প্রশ্ন থাকলে মুছতে বাধা দিতে পারে।") },
        confirmButton = { TextButton(onClick = { confirmDelete = false; onDelete?.invoke() }) { Text("মুছুন") } },
        dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("বাতিল") } },
    )
    if (categoryDialog) CategoryPickerDialog(
        categories = categories,
        selectedIds = group.stimulusCategoryIds,
        title = if (group.stimulusId == null) "দাগের ক্যাটাগরি" else "উদ্দীপকের ক্যাটাগরি",
        onDismiss = { categoryDialog = false },
        onSave = { onCategoriesChanged?.invoke(it) },
    )
    if (referenceDialog) AlertDialog(
        onDismissRequest = { referenceDialog = false },
        title = { Text("রেফারেন্স") },
        text = {
            if (group.referenceText.isBlank()) Text("কোনো রেফারেন্স লেখা নেই")
            else RichLatexText(group.referenceText, Modifier.fillMaxWidth())
        },
        confirmButton = { TextButton(onClick = { referenceDialog = false }) { Text("বন্ধ") } },
    )

    Card(
        modifier = Modifier.fillMaxWidth(),
        // Match the previous app's QuestionCard: white surface, 1.5px brand-blue outline, rounded-2xl corners.
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        border = BorderStroke(1.5.dp, if (dark) TypeCqCardTokens.BorderDark else TypeCqCardTokens.BorderLight),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().background(ribbon).padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(number.toBengali(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp,
                modifier = Modifier.widthIn(min = 18.dp).padding(start = 2.dp))
            if (onToggleSelected != null) {
                Checkbox(checked = selected, onCheckedChange = onToggleSelected,
                    modifier = Modifier.size(32.dp), colors = androidx.compose.material3.CheckboxDefaults.colors(
                        checkedColor = Color.White, uncheckedColor = Color.White, checkmarkColor = ribbon))
            }
            Row(
                modifier = Modifier.weight(1f).horizontalScroll(rememberScrollState())
                    .clickable(enabled = onCategoriesChanged != null) { categoryDialog = true }
                    .padding(horizontal = 3.dp, vertical = 5.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val names = remember(group.stimulusCategoryIds, categories) {
                    group.stimulusCategoryIds.mapNotNull { id -> categories.firstOrNull { it.categoryId == id }?.name }
                }
                Text(
                    names.joinToString(", ").ifBlank { if (group.stimulusId == null) "দাগের ক্যাটাগরি +" else "উদ্দীপক ক্যাটাগরি +" },
                    color = if (names.isEmpty()) Color(0xFFDCE3FF) else Color.White,
                    fontSize = 11.sp, maxLines = 1, softWrap = false,
                )
            }
            RatingBadge(QuestionCardRules.rating(group), compact = true)
            if (onEdit != null || onDelete != null || onCopy != null || onView != null || onCut != null || onPasteBefore != null || onPasteAfter != null) {
                Box {
                    Box(Modifier.size(30.dp).clickable { menuOpen = true }.semantics { contentDescription = "আরও বিকল্প" }, contentAlignment = Alignment.Center) {
                        Text("⋮", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 19.sp)
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        if (onEdit != null) DropdownMenuItem(text = { Text("প্রশ্ন সম্পাদনা") }, onClick = { menuOpen = false; onEdit() })
                        if (onView != null) DropdownMenuItem(text = { Text("রেফারেন্স দেখুন") }, enabled = group.stimulusId != null,
                            onClick = { menuOpen = false; referenceDialog = true })
                        if (onCopy != null) DropdownMenuItem(text = { Text("সম্পূর্ণ গ্রুপ কপি") }, onClick = { menuOpen = false; onCopy() })
                        if (onCut != null) DropdownMenuItem(text = { Text("Cut") }, onClick = { menuOpen = false; onCut() })
                        if (onPasteBefore != null) DropdownMenuItem(text = { Text("Paste Before") }, enabled = canPaste, onClick = { menuOpen = false; onPasteBefore() })
                        if (onPasteAfter != null) DropdownMenuItem(text = { Text("Paste After") }, enabled = canPaste, onClick = { menuOpen = false; onPasteAfter() })
                        if (onDelete != null) DropdownMenuItem(text = { Text("সম্পূর্ণ গ্রুপ মুছুন", color = MaterialTheme.colorScheme.error) }, onClick = { menuOpen = false; confirmDelete = true })
                    }
                }
            }
        }

        if (group.paperUsages.isNotEmpty()) PaperCategoryChips(group.paperUsages.map { it.categoryName }.distinct())

        val topBoardTags = if (group.stimulusId != null) group.stimulusBoards else group.subQuestions.singleOrNull()?.boards.orEmpty()
        if (topBoardTags.isNotEmpty()) {
            Column(Modifier.fillMaxWidth().background(if (dark) MaterialTheme.colorScheme.surfaceVariant else Color(0xFFF8FAFC))) {
                Box(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 6.dp)) {
                    TypeCqBoardChips(topBoardTags, boards)
                }
                androidx.compose.material3.HorizontalDivider(
                    color = if (dark) Color(0xFF334155) else Color(0xFFE2E8F0), thickness = 1.dp,
                )
            }
        }

        val upperImages = group.stimulusImages.filter { it.placement.equals("TOP", true) }.sortedBy { it.position }
        val lowerImages = group.stimulusImages.filterNot { it.placement.equals("TOP", true) }.sortedBy { it.position }
        Column(Modifier.padding(horizontal = 14.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            upperImages.forEach { image -> if (imagePipeline != null) FullWidthTypeCqImage(imagePipeline, image.imageId) }
            if (group.stimulusText.isNotBlank()) RichLatexText(group.stimulusText, Modifier.fillMaxWidth())
            lowerImages.forEach { image -> if (imagePipeline != null) FullWidthTypeCqImage(imagePipeline, image.imageId) }
            group.subQuestions.forEachIndexed { index, question ->
                if (index > 0) androidx.compose.material3.HorizontalDivider(color = if (dark) Color(0xFF334155) else TypeCqCardTokens.ContentDivider)
                QuestionCardSubQuestion(question, boards, imagePipeline)
            }
            if (onConcept != null) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    OutlinedButton(onClick = onConcept, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 10.dp, vertical = 2.dp),
                        shape = RoundedCornerShape(7.dp), border = BorderStroke(1.dp, if (group.hasConcept) ribbon else MaterialTheme.colorScheme.outlineVariant)) {
                        Text("কনসেপ্ট", color = if (group.hasConcept) ribbon else MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                        if (group.hasConcept) Text(" •", color = ribbon, fontSize = 11.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun PaperCategoryChips(names: List<String>) {
    val scroll = rememberScrollState()
    val dark = LocalDarkTheme.current
    val chipBackground = if (dark) Color(0xFF123B32) else TypeCqCardTokens.PaperChipBackground
    val chipForeground = if (dark) Color(0xFFA7F3D0) else TypeCqCardTokens.PaperChipForeground
    val trackColor = if (dark) Color(0xFF344054) else Color(0xFFD5D9E2)
    val thumbColor = if (dark) Color(0xFF8A9AB8) else Color(0xFF64748B)
    Column(Modifier.fillMaxWidth().background(if (dark) MaterialTheme.colorScheme.surfaceVariant else Color(0xFFF8FAFC))) {
        Row(Modifier.fillMaxWidth().horizontalScroll(scroll).padding(horizontal = 14.dp, vertical = 5.dp),
            horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            names.forEach { name ->
                Text(name, modifier = Modifier.background(chipBackground, RoundedCornerShape(5.dp))
                    .border(1.dp, if (dark) Color(0xFF236B58) else TypeCqCardTokens.PaperChipBorder, RoundedCornerShape(5.dp))
                    .padding(horizontal = 8.dp, vertical = 2.dp), color = chipForeground, fontSize = 10.sp, maxLines = 1)
            }
        }
        androidx.compose.material3.HorizontalDivider(color = if (dark) Color(0xFF334155) else Color(0xFFE2E8F0), thickness = 1.dp)
        if (scroll.maxValue > 0) Canvas(Modifier.fillMaxWidth().padding(horizontal = 9.dp).height(2.dp)) {
            val track = size.width
            drawRoundRect(color = trackColor, size = size, cornerRadius = androidx.compose.ui.geometry.CornerRadius(2f))
            val thumbWidth = (track * size.width / (size.width + scroll.maxValue)).coerceAtLeast(10f)
            val offset = (track - thumbWidth) * scroll.value / scroll.maxValue.toFloat()
            drawRoundRect(color = thumbColor, topLeft = androidx.compose.ui.geometry.Offset(offset, 0f),
                size = androidx.compose.ui.geometry.Size(thumbWidth, size.height), cornerRadius = androidx.compose.ui.geometry.CornerRadius(2f))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TypeCqBoardChips(tags: List<BoardTag>, boards: List<BoardItem>) {
    val map = remember(boards) { boards.associateBy { it.code } }
    val ordered = remember(tags, boards) { orderedTypeCqBoardTags(tags, boards) }
    CompositionLocalProviderCompatRtl {
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(3.dp, Alignment.End),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            ordered.forEach { tag ->
                val code = map[tag.boardCode]?.code ?: tag.boardCode
                Text(
                    "$code ${ (tag.year % 100).toString().toBengaliDigits() }",
                    modifier = Modifier.background(if (LocalDarkTheme.current) Color(0xFF263449) else Color.White, RoundedCornerShape(5.dp))
                        .border(1.dp, if (LocalDarkTheme.current) Color(0xFF5369B4) else TypeCqCardTokens.BoardChipBorder, RoundedCornerShape(5.dp))
                        .padding(horizontal = 5.dp, vertical = 2.dp),
                    color = if (LocalDarkTheme.current) Color(0xFFE2E8F0) else Color(0xFF1B1F2A),
                    fontSize = 10.sp, maxLines = 1, style = MaterialTheme.typography.labelSmall.copy(textDirection = TextDirection.Ltr),
                )
            }
        }
    }
}

@Composable
private fun CompositionLocalProviderCompatRtl(content: @Composable () -> Unit) {
    androidx.compose.runtime.CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) { content() }
}

@Composable
private fun QuestionCardSubQuestion(question: SavedSubQuestion, boards: List<BoardItem>, imagePipeline: ImagePipeline?) {
    var showSolution by remember(question.id) { mutableStateOf(false) }
    val hasSolution = question.orderedSolutionParts.isNotEmpty() || question.solutionParts.any(String::isNotBlank)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "${question.label?.letter?.let { "$it." } ?: "প্রশ্ন"} · ${marksText(question.marks)} নম্বর",
            style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface,
        )
        RichLatexText(question.text, Modifier.fillMaxWidth())
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Button(
                onClick = { if (hasSolution) showSolution = !showSolution },
                enabled = hasSolution,
                modifier = Modifier.height(28.dp),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 10.dp, vertical = 2.dp),
                shape = RoundedCornerShape(8.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (showSolution) (if (LocalDarkTheme.current) TypeCqCardTokens.RibbonDark else TypeCqCardTokens.RibbonLight) else (if (hasSolution) MaterialTheme.colorScheme.surface else Color(0xFFE5E7EB)),
                    contentColor = if (showSolution) Color.White else if (hasSolution) Color(0xFF2A3BB0) else Color(0xFF9CA3AF),
                    disabledContainerColor = Color(0xFFE5E7EB), disabledContentColor = Color(0xFF9CA3AF),
                ),
                border = BorderStroke(1.dp, if (hasSolution) Color(0xFFD5D9E2) else Color(0xFFD1D5DB)),
            ) { Text(if (showSolution) "সমাধান লুকাও" else "সমাধান দেখো", fontSize = 12.sp, maxLines = 1) }
            Box(Modifier.weight(1f)) { if (question.boards.isNotEmpty()) TypeCqBoardChips(question.boards, boards) }
        }
        if (showSolution && hasSolution) {
            Column(Modifier.fillMaxWidth().background(if (LocalDarkTheme.current) TypeCqCardTokens.SolutionPanelDark else TypeCqCardTokens.SolutionPanelLight, RoundedCornerShape(12.dp))
                .border(1.dp, if (LocalDarkTheme.current) TypeCqCardTokens.SolutionPanelBorderDark else TypeCqCardTokens.SolutionPanelBorderLight, RoundedCornerShape(12.dp)).padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(7.dp)) {
                val ordered = question.orderedSolutionParts.sortedBy { it.position }
                if (ordered.isNotEmpty()) ordered.forEach { part ->
                    if (part.partType == "IMAGE") {
                        val id = part.imageId
                        if (id != null && imagePipeline != null) FullWidthTypeCqImage(imagePipeline, id)
                        else Text("সমাধানের ছবি অনুপলব্ধ", style = MaterialTheme.typography.labelSmall)
                    } else if (!part.textContent.isNullOrBlank()) RichLatexText(part.textContent, Modifier.fillMaxWidth())
                } else question.solutionParts.forEach { RichLatexText(it, Modifier.fillMaxWidth()) }
            }
        }
    }
}

@Composable
private fun FullWidthTypeCqImage(pipeline: ImagePipeline, imageId: String) {
    val configuration = LocalConfiguration.current
    val targetWidthPx = (configuration.screenWidthDp * 2.5f).toInt().coerceAtMost(2048).coerceAtLeast(320)
    val bitmap by produceState<Bitmap?>(null, imageId, targetWidthPx) {
        value = withContext(Dispatchers.IO) {
            try {
                val file = pipeline.fileForImage(imageId, ImageScope.TYPE_CQ) ?: return@withContext null
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeFile(file.absolutePath, bounds)
                if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return@withContext null
                var sample = 1
                while (bounds.outWidth / (sample * 2) >= targetWidthPx) sample *= 2
                BitmapFactory.decodeFile(file.absolutePath, BitmapFactory.Options().apply {
                    inSampleSize = sample
                    inPreferredConfig = Bitmap.Config.RGB_565
                })
            } catch (_: Exception) { null } catch (_: OutOfMemoryError) { null }
        }
    }
    if (bitmap == null) {
        Box(Modifier.fillMaxWidth().height(116.dp)
            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(12.dp))
            .border(1.dp, if (LocalDarkTheme.current) Color(0xFF475569) else Color(0xFFD5D9E2), RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
            Text("ছবি অনুপলব্ধ", color = LegacyMuted, fontSize = 12.sp)
        }
    } else {
        val imageShape = RoundedCornerShape(12.dp)
        Image(
            bitmap!!.asImageBitmap(), contentDescription = "উদ্দীপকের ছবি",
            modifier = Modifier.fillMaxWidth().clip(imageShape)
                .background(if (LocalDarkTheme.current) MaterialTheme.colorScheme.surfaceVariant else Color.White)
                .border(1.dp, if (LocalDarkTheme.current) Color(0xFF475569) else Color(0xFFD5D9E2), imageShape),
            contentScale = ContentScale.FillWidth,
        )
    }
}

@Composable
private fun CategoryPickerDialog(
    categories: List<TypeCqQuestionCategoriesEntity>,
    selectedIds: List<String>,
    title: String,
    onDismiss: () -> Unit,
    onSave: (List<String>) -> Unit,
) {
    var selected by remember(selectedIds) { mutableStateOf(selectedIds.toSet()) }
    val active = remember(categories, selectedIds) { categories.filter { it.isArchived == 0L || it.categoryId in selectedIds } }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(Modifier.height(320.dp).verticalScroll(rememberScrollState())) {
                active.forEach { category ->
                    Row(Modifier.fillMaxWidth().clickable {
                        selected = if (category.categoryId in selected) selected - category.categoryId else selected + category.categoryId
                        onSave(active.map { it.categoryId }.filter { it in selected })
                    }, verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = category.categoryId in selected, onCheckedChange = { checked ->
                            selected = if (checked) selected + category.categoryId else selected - category.categoryId
                            onSave(active.map { it.categoryId }.filter { it in selected })
                        })
                        Text(category.name, fontSize = 14.sp)
                    }
                }
                if (active.isEmpty()) Text("কোনো সক্রিয় ক্যাটাগরি নেই।")
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("বন্ধ") } },
    )
}

@Composable
internal fun RatingBadge(rating: Int, compact: Boolean = false) {
    val dark = LocalDarkTheme.current
    val background = if (dark) Color(0xFF422006) else Color(0xFFFEF9C3)
    val textColor = if (dark) Color(0xFFFDE68A) else Color(0xFF713F12)
    val border = if (dark) Color(0xFF713F12) else Color(0xFFFDE047)
    val shape = RoundedCornerShape(6.dp)
    Text(ratingText(rating), modifier = Modifier.background(background, shape).border(1.dp, border, shape)
        .padding(horizontal = if (compact) 5.dp else 8.dp, vertical = 1.dp),
        color = textColor, fontWeight = FontWeight.SemiBold, fontSize = if (compact) 10.sp else 12.sp)
}
