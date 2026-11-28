package com.questionbank.app.ui.question

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.toggleableState
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.questionbank.app.data.local.entity.TypeCqQuestionCategoriesEntity
import com.questionbank.app.domain.question.BoardItem
import com.questionbank.app.domain.question.QuestionCardRules
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.media.ImagePipeline
import com.questionbank.app.media.ImageScope
import com.questionbank.app.ui.format.toBengali
import com.questionbank.app.ui.theme.LocalDarkTheme
import com.questionbank.app.ui.theme.QuestionCardPalette

/** One visual card represents a complete stimulus/question group. */
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
    categories: List<TypeCqQuestionCategoriesEntity> = emptyList(),
    onSetStimulusCategories: ((List<String>, (Boolean) -> Unit) -> Unit)? = null,
) {
    val dark = LocalDarkTheme.current
    var menuOpen by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var showReference by remember(group.referenceText) { mutableStateOf(false) }
    val categoryTargetKey = group.stimulusId ?: group.subQuestions.singleOrNull()?.id.orEmpty()
    val storedCategoryIds = if (group.stimulusId != null) {
        group.stimulusCategoryIds
    } else {
        group.subQuestions.singleOrNull()?.categoryIds.orEmpty()
    }
    var selectedCategoryIds by remember(categoryTargetKey) { mutableStateOf(storedCategoryIds) }
    var lastPersistedCategoryIds by remember(categoryTargetKey) { mutableStateOf(storedCategoryIds) }
    LaunchedEffect(storedCategoryIds) {
        if (storedCategoryIds != lastPersistedCategoryIds) {
            lastPersistedCategoryIds = storedCategoryIds
            selectedCategoryIds = storedCategoryIds
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("প্রশ্ন কার্ড মুছবেন?") },
            text = { Text("এই কার্ডের অন্তর্ভুক্ত সব প্রশ্ন মুছে যাবে। সার্চের ফলাফলে কিছু প্রশ্ন দেখা গেলেও সম্পূর্ণ গ্রুপটি মুছবে। সংরক্ষিত প্রশ্নপত্রে ব্যবহৃত প্রশ্ন হলে মুছে ফেলা আটকে যেতে পারে।") },
            confirmButton = { TextButton(onClick = { confirmDelete = false; onDelete?.invoke() }) { Text("মুছুন") } },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("বাতিল") } },
        )
    }
    if (showReference) {
        AlertDialog(
            onDismissRequest = { showReference = false },
            text = {
                if (group.referenceText.isBlank()) {
                    Text("কোনো রেফারেন্স লেখা নেই")
                } else {
                    RichLatexText(
                        group.referenceText,
                        Modifier.fillMaxWidth(),
                        color = if (dark) QuestionCardPalette.DarkBoardText else QuestionCardPalette.LightBoardText,
                    )
                }
            },
            confirmButton = { TextButton(onClick = { showReference = false }) { Text("বন্ধ") } },
        )
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        border = BorderStroke(1.5.dp, if (dark) QuestionCardPalette.DarkCardBorder else QuestionCardPalette.LightCardBorder),
    ) {
        Column(Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier.fillMaxWidth()
                    .height(36.dp)
                    .background(QuestionCardPalette.Ribbon)
                    .padding(start = 8.dp, end = 5.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "প্রশ্ন ${number.toBengali()}",
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp,
                    maxLines = 1,
                )
                if (onToggleSelected != null) {
                    Spacer(Modifier.width(3.dp))
                    Box(
                        modifier = Modifier.size(width = 44.dp, height = 36.dp)
                            .clickable { onToggleSelected(!selected) }
                            .semantics {
                                role = Role.Checkbox
                                toggleableState = if (selected) ToggleableState.On else ToggleableState.Off
                                contentDescription = "প্রশ্ন নির্বাচন"
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        Box(
                            Modifier.size(20.dp)
                                .background(
                                    color = if (selected) Color.White else Color.Transparent,
                                    shape = RoundedCornerShape(4.dp),
                                )
                                .border(2.dp, Color.White, RoundedCornerShape(4.dp)),
                            contentAlignment = Alignment.Center,
                        ) {
                            if (selected) {
                                Text("✓", color = QuestionCardPalette.Ribbon, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                            }
                        }
                    }
                }
                StimulusCategoryDropdown(
                    categories = categories,
                    selectedIds = selectedCategoryIds,
                    enabled = onSetStimulusCategories != null,
                    modifier = Modifier.weight(1f),
                    onToggle = { categoryId ->
                        val next = if (categoryId in selectedCategoryIds) {
                            selectedCategoryIds - categoryId
                        } else {
                            selectedCategoryIds + categoryId
                        }
                        selectedCategoryIds = next
                        onSetStimulusCategories?.invoke(next) { saved ->
                            if (saved) {
                                lastPersistedCategoryIds = next
                            } else if (selectedCategoryIds == next) {
                                // Do not roll back a newer tap while its serialized save is still pending.
                                selectedCategoryIds = lastPersistedCategoryIds
                            }
                        }
                    },
                )
                Spacer(Modifier.width(4.dp))
                TypeCqRatingBadge(QuestionCardRules.rating(group))
                if (onEdit != null || onDelete != null || onCopy != null || group.stimulusId != null) {
                    Spacer(Modifier.width(5.dp))
                    Box {
                        Box(
                            modifier = Modifier.size(width = 44.dp, height = 36.dp)
                                .clickable { menuOpen = true }
                                .semantics {
                                    role = Role.Button
                                    contentDescription = "আরও বিকল্প"
                                },
                            contentAlignment = Alignment.Center,
                        ) {
                            Text("⋮", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 20.sp)
                        }
                        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                            if (onEdit != null) {
                                DropdownMenuItem(text = { Text("প্রশ্ন সম্পাদনা") }, onClick = { menuOpen = false; onEdit() })
                            }
                            DropdownMenuItem(
                                text = { Text("রেফারেন্স দেখুন") },
                                onClick = { menuOpen = false; showReference = true },
                                enabled = group.stimulusId != null,
                            )
                            if (onCopy != null) {
                                DropdownMenuItem(text = { Text("সম্পূর্ণ গ্রুপ কপি") }, onClick = { menuOpen = false; onCopy() })
                            }
                            if (onDelete != null) {
                                DropdownMenuItem(
                                    text = { Text("সম্পূর্ণ গ্রুপ মুছুন", color = MaterialTheme.colorScheme.error) },
                                    onClick = { menuOpen = false; confirmDelete = true },
                                )
                            }
                        }
                    }
                }
            }

            val topTags = cardTopTags(group)
            if (group.paperUsages.isNotEmpty() || topTags.isNotEmpty()) {
                val metadataDivider = MaterialTheme.colorScheme.outlineVariant
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Row(
                        modifier = Modifier.fillMaxWidth()
                            .background(if (dark) QuestionCardPalette.DarkPaperRow else QuestionCardPalette.LightPaperRow)
                            .drawBehind {
                                drawLine(
                                    color = metadataDivider,
                                    start = Offset(0f, size.height),
                                    end = Offset(size.width, size.height),
                                    strokeWidth = 1.dp.toPx(),
                                )
                            }
                            .padding(horizontal = 10.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.Top,
                    ) {
                        when {
                            group.paperUsages.isNotEmpty() && topTags.isNotEmpty() -> {
                                PaperCategoryChipRow(group.paperUsages, Modifier.weight(1f))
                                Spacer(Modifier.width(8.dp))
                                TagChipRow(topTags, boards, Modifier.weight(1f))
                            }
                            group.paperUsages.isNotEmpty() -> PaperCategoryChipRow(group.paperUsages, Modifier.weight(1f))
                            else -> TagChipRow(topTags, boards, Modifier.fillMaxWidth())
                        }
                    }
                }
            }

            val upperImages = group.stimulusImages.filter { it.placement.equals("TOP", true) }.sortedBy { it.position }
            val lowerImages = group.stimulusImages.filterNot { it.placement.equals("TOP", true) }.sortedBy { it.position }
            Column(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (upperImages.isNotEmpty()) {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        upperImages.forEach { image ->
                            if (imagePipeline != null) {
                                StimulusImageFrame(imagePipeline, image.imageId, dark)
                            } else {
                                StimulusImageUnavailableFrame(dark)
                            }
                        }
                    }
                }
                if (group.stimulusText.isNotBlank()) {
                    RichLatexText(
                        group.stimulusText,
                        Modifier.fillMaxWidth(),
                        color = if (dark) QuestionCardPalette.DarkBoardText else QuestionCardPalette.LightBoardText,
                    )
                }
                if (lowerImages.isNotEmpty()) {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        lowerImages.forEach { image ->
                            if (imagePipeline != null) {
                                StimulusImageFrame(imagePipeline, image.imageId, dark)
                            } else {
                                StimulusImageUnavailableFrame(dark)
                            }
                        }
                    }
                }
                if (group.subQuestions.isNotEmpty()) {
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        // The legacy card has one separator above the sub-question section, not between every sub-question.
                        androidx.compose.material3.HorizontalDivider(
                            color = if (dark) QuestionCardPalette.DarkQuestionDivider else QuestionCardPalette.LightQuestionDivider,
                        )
                        group.subQuestions.forEach { question ->
                            QuestionCardSubQuestion(
                                question = question,
                                boards = boards,
                                imagePipeline = imagePipeline,
                                showQuestionBoards = group.stimulusId != null,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StimulusCategoryDropdown(
    categories: List<TypeCqQuestionCategoriesEntity>,
    selectedIds: List<String>,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    onToggle: (String) -> Unit,
) {
    val scrollState = rememberScrollState()
    var expanded by remember { mutableStateOf(false) }
    val names = selectedIds.mapNotNull { id -> categories.firstOrNull { it.categoryId == id }?.name }
    val label = names.joinToString(", ")
    val visibleOptions = categories.filter { it.isArchived == 0L || it.categoryId in selectedIds }

    Box(modifier.height(32.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth().fillMaxHeight()
                .clip(RoundedCornerShape(6.dp))
                .background(Color.White.copy(alpha = 0.13f))
                .clickable(enabled = enabled) { expanded = true }
                .padding(start = 7.dp, end = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = label.ifBlank { "উদ্দীপক ক্যাটাগরি" },
                modifier = Modifier.weight(1f).horizontalScroll(scrollState),
                color = if (label.isBlank()) Color.White.copy(alpha = 0.68f) else Color.White,
                fontSize = 10.sp,
                maxLines = 1,
                softWrap = false,
            )
            Text("▾", color = Color.White.copy(alpha = 0.9f), fontSize = 13.sp)
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            if (visibleOptions.isEmpty()) {
                DropdownMenuItem(
                    text = { Text("এখনো কোনো ক্যাটাগরি নেই") },
                    onClick = {},
                    enabled = false,
                )
            }
            visibleOptions.forEach { category ->
                val checked = category.categoryId in selectedIds
                // An archived category cannot be newly selected, but an existing link may be removed.
                val itemEnabled = enabled && (category.isArchived == 0L || checked)
                DropdownMenuItem(
                    text = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            androidx.compose.material3.Checkbox(
                                checked = checked,
                                enabled = itemEnabled,
                                onCheckedChange = null,
                            )
                            Text(
                                if (category.isArchived != 0L) "${category.name} (আর্কাইভড)" else category.name,
                                color = if (itemEnabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    },
                    onClick = { if (itemEnabled) onToggle(category.categoryId) },
                    enabled = itemEnabled,
                )
            }
        }
    }
}

@Composable
private fun PaperCategoryChipRow(usages: List<com.questionbank.app.domain.question.PaperUsage>, modifier: Modifier = Modifier) {
    val dark = LocalDarkTheme.current
    val scrollState = rememberScrollState()
    Column(modifier = modifier) {
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(scrollState),
            horizontalArrangement = Arrangement.spacedBy(5.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            usages.forEach { usage ->
                val chipShape = RoundedCornerShape(6.dp)
                val chipColor = if (dark) QuestionCardPalette.DarkPaperChipText else QuestionCardPalette.LightPaperChipText
                Row(
                    modifier = Modifier
                        .clip(chipShape)
                        .background(if (dark) QuestionCardPalette.DarkPaperChip else QuestionCardPalette.LightPaperChip)
                        .border(
                            1.dp,
                            if (dark) QuestionCardPalette.DarkPaperChipBorder else QuestionCardPalette.LightPaperChipBorder,
                            chipShape,
                        )
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                    horizontalArrangement = Arrangement.spacedBy(3.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    AwardMark(chipColor)
                    Text(
                        usage.categoryName,
                        color = chipColor,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                    )
                }
            }
        }
        if (scrollState.maxValue > 0) Spacer(
            Modifier.fillMaxWidth().height(2.dp).drawBehind {
                val maxScroll = scrollState.maxValue
                val viewport = scrollState.viewportSize
                if (maxScroll > 0 && viewport > 0 && size.width > 0f) {
                    val centerY = size.height / 2f
                    val trackWidth = size.width
                    val thumbWidth = (trackWidth * viewport.toFloat() / (viewport + maxScroll))
                        .coerceAtLeast(16.dp.toPx())
                        .coerceAtMost(trackWidth)
                    val progress = (scrollState.value.toFloat() / maxScroll).coerceIn(0f, 1f)
                    val thumbStart = (trackWidth - thumbWidth) * progress
                    val trackColor = if (dark) QuestionCardPalette.DarkPaperChipBorder else QuestionCardPalette.LightPaperChipBorder
                    val thumbColor = if (dark) QuestionCardPalette.DarkPaperChipText else QuestionCardPalette.LightPaperChipText
                    drawLine(trackColor, Offset(0f, centerY), Offset(trackWidth, centerY), 1.dp.toPx(), cap = StrokeCap.Round)
                    drawLine(thumbColor, Offset(thumbStart, centerY), Offset(thumbStart + thumbWidth, centerY), 1.dp.toPx(), cap = StrokeCap.Round)
                }
            },
        )
    }
}

@Composable
private fun EyeMark(color: Color) {
    Canvas(Modifier.size(width = 12.dp, height = 9.dp)) {
        val eye = Path().apply {
            moveTo(size.width * 0.08f, size.height * 0.5f)
            cubicTo(size.width * 0.28f, size.height * 0.05f, size.width * 0.72f, size.height * 0.05f, size.width * 0.92f, size.height * 0.5f)
            cubicTo(size.width * 0.72f, size.height * 0.95f, size.width * 0.28f, size.height * 0.95f, size.width * 0.08f, size.height * 0.5f)
            close()
        }
        drawPath(eye, color = color, style = Stroke(width = 1.dp.toPx()))
        drawCircle(color = color, radius = 1.4.dp.toPx(), center = Offset(size.width / 2f, size.height / 2f))
    }
}

@Composable
private fun AwardMark(color: Color) {
    Canvas(Modifier.size(12.dp)) {
        val stroke = 1.dp.toPx()
        val center = Offset(size.width / 2f, size.height * 0.34f)
        val radius = size.minDimension * 0.25f
        drawCircle(color = color, radius = radius, center = center, style = Stroke(width = stroke))
        val ribbons = Path().apply {
            moveTo(center.x - radius * 0.62f, center.y + radius * 0.72f)
            lineTo(center.x - radius * 0.95f, size.height * 0.94f)
            lineTo(center.x, size.height * 0.77f)
            lineTo(center.x + radius * 0.95f, size.height * 0.94f)
            lineTo(center.x + radius * 0.62f, center.y + radius * 0.72f)
        }
        drawPath(ribbons, color = color, style = Stroke(width = stroke))
    }
}

@Composable
private fun StimulusImageFrame(imagePipeline: ImagePipeline, imageId: String, dark: Boolean) {
    val shape = RoundedCornerShape(12.dp)
    Box(
        Modifier.fillMaxWidth()
            .clip(shape)
            .background(if (dark) QuestionCardPalette.DarkBoardBackground else QuestionCardPalette.LightBoardBackground)
            .border(
                1.dp,
                if (dark) QuestionCardPalette.DarkBoardBorder else QuestionCardPalette.LightBoardBorder,
                shape,
            ),
    ) {
        MediaFullWidthImage(imagePipeline, imageId, ImageScope.TYPE_CQ)
    }
}

@Composable
private fun StimulusImageUnavailableFrame(dark: Boolean) {
    val shape = RoundedCornerShape(12.dp)
    Box(
        Modifier.fillMaxWidth()
            .height(96.dp)
            .clip(shape)
            .background(if (dark) QuestionCardPalette.DarkBoardBackground else QuestionCardPalette.LightBoardBackground)
            .border(
                1.dp,
                if (dark) QuestionCardPalette.DarkBoardBorder else QuestionCardPalette.LightBoardBorder,
                shape,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Text("ছবি অনুপলব্ধ", style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun QuestionCardSubQuestion(
    question: com.questionbank.app.domain.question.SavedSubQuestion,
    boards: List<BoardItem>,
    imagePipeline: ImagePipeline?,
    showQuestionBoards: Boolean,
) {
    val dark = LocalDarkTheme.current
    var showSolution by remember(question.id) { mutableStateOf(false) }
    val hasSolution = question.orderedSolutionParts.isNotEmpty() || question.solutionParts.any(String::isNotBlank)
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Text(
            "${question.label?.letter?.let { "$it." } ?: "প্রশ্ন"} · ${marksText(question.marks)} নম্বর",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
            color = if (dark) QuestionCardPalette.DarkBoardText else QuestionCardPalette.LightBoardText,
        )
        RichLatexText(
            question.text,
            Modifier.fillMaxWidth(),
            color = if (dark) QuestionCardPalette.DarkBoardText else QuestionCardPalette.LightBoardText,
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val buttonShape = RoundedCornerShape(8.dp)
            Box(
                modifier = Modifier.height(28.dp)
                    .background(
                        color = when {
                            !hasSolution -> if (dark) QuestionCardPalette.DarkDisabledSolution else QuestionCardPalette.LightDisabledSolution
                            dark -> QuestionCardPalette.DarkSolutionButton
                            else -> QuestionCardPalette.LightSolutionButton
                        },
                        shape = buttonShape,
                    )
                    .border(
                        1.dp,
                        if (dark) QuestionCardPalette.DarkSolutionBorder else QuestionCardPalette.LightSolutionBorder,
                        buttonShape,
                    )
                    .clickable(enabled = hasSolution) { showSolution = !showSolution }
                    .semantics {
                        role = Role.Button
                        contentDescription = if (showSolution) "সমাধান লুকাও" else "সমাধান দেখো"
                    }
                    .padding(horizontal = 10.dp, vertical = 4.dp),
                contentAlignment = Alignment.Center,
            ) {
                val solutionTextColor = when {
                    !hasSolution -> if (dark) QuestionCardPalette.DarkMuted else QuestionCardPalette.LightMuted
                    dark -> QuestionCardPalette.DarkSolutionText
                    else -> QuestionCardPalette.LightSolutionText
                }
                Row(
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    EyeMark(solutionTextColor)
                    Text(
                        if (showSolution) "সমাধান লুকাও" else "সমাধান দেখো",
                        color = solutionTextColor,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                    )
                }
            }
            if (showQuestionBoards && question.boards.isNotEmpty()) {
                Box(Modifier.weight(1f)) {
                    TagChipRow(question.boards, boards, Modifier.fillMaxWidth())
                }
            } else {
                Spacer(Modifier.weight(1f))
            }
        }
        if (showSolution && hasSolution) {
            Column(
                Modifier.fillMaxWidth()
                    .background(
                        if (dark) QuestionCardPalette.DarkSolutionPanel else QuestionCardPalette.LightSolutionPanel,
                        RoundedCornerShape(9.dp),
                    )
                    .border(
                        1.dp,
                        if (dark) QuestionCardPalette.DarkSolutionPanelBorder else QuestionCardPalette.LightSolutionPanelBorder,
                        RoundedCornerShape(9.dp),
                    )
                    .padding(10.dp),
                verticalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                val ordered = question.orderedSolutionParts.sortedBy { it.position }
                if (ordered.isNotEmpty()) {
                    ordered.forEach { part ->
                        if (part.partType == "IMAGE") {
                            val id = part.imageId
                            if (id != null && imagePipeline != null) {
                                MediaThumbnail(imagePipeline, id, ImageScope.TYPE_CQ)
                            } else {
                                Text("সমাধানের ছবি অনুপলব্ধ", style = MaterialTheme.typography.labelSmall)
                            }
                        } else if (!part.textContent.isNullOrBlank()) {
                            RichLatexText(
                                part.textContent,
                                Modifier.fillMaxWidth(),
                                color = if (dark) QuestionCardPalette.DarkBoardText else QuestionCardPalette.LightBoardText,
                            )
                        }
                    }
                } else {
                    question.solutionParts.forEach {
                        RichLatexText(
                            it,
                            Modifier.fillMaxWidth(),
                            color = if (dark) QuestionCardPalette.DarkBoardText else QuestionCardPalette.LightBoardText,
                        )
                    }
                }
            }
        }
    }
}

/** Shared compact badge retains the existing text format for Chapter CQ. */
@Composable
internal fun RatingBadge(rating: Int) {
    RatingBadgeContent(ratingText(rating))
}

/** Type CQ uses the five-star label shown in the legacy Collection card. */
@Composable
private fun TypeCqRatingBadge(rating: Int) {
    RatingBadgeContent(typeCqRatingText(rating))
}

@Composable
private fun RatingBadgeContent(label: String) {
    val dark = LocalDarkTheme.current
    val shape = RoundedCornerShape(6.dp)
    Text(
        label,
        modifier = Modifier
            .background(
                if (dark) QuestionCardPalette.DarkRatingBackground else QuestionCardPalette.LightRatingBackground,
                shape,
            )
            .border(
                1.dp,
                if (dark) QuestionCardPalette.DarkRatingBorder else QuestionCardPalette.LightRatingBorder,
                shape,
            )
            .padding(horizontal = 6.dp, vertical = 1.dp),
        color = if (dark) QuestionCardPalette.DarkRatingText else QuestionCardPalette.LightRatingText,
        fontWeight = FontWeight.SemiBold,
        fontSize = 10.sp,
        maxLines = 1,
    )
}
