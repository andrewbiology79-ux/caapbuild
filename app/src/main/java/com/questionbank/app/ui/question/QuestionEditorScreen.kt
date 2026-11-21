package com.questionbank.app.ui.question

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.questionbank.app.domain.question.BoardItem
import com.questionbank.app.domain.question.CqLabel
import com.questionbank.app.domain.question.DraftText
import com.questionbank.app.domain.question.QuestionRules
import com.questionbank.app.domain.question.QuestionSolutionPart
import com.questionbank.app.domain.question.SaveResult
import com.questionbank.app.media.ImagePipeline
import com.questionbank.app.media.ImageScope
import com.questionbank.app.ui.format.toBengali

private fun resultText(result: SaveResult?): String? = when (result) {
    null, is SaveResult.Saved -> null
    SaveResult.Empty -> "কমপক্ষে একটি প্রশ্নের লেখা দিন।"
    is SaveResult.MissingQuestionText -> "${result.label.letter}) এর উত্তর লেখা আছে, কিন্তু প্রশ্ন খালি। প্রশ্ন লিখুন বা উত্তরটি মুছুন।"
    is SaveResult.TooLong -> "${result.field} অনেক বড় (সর্বোচ্চ ${QuestionRules.MAX_TEXT_LENGTH} অক্ষর)।"
    SaveResult.TopicMissing -> "টপিকটি আর নেই। আপনার লেখা ড্রাফটে আছে; ফিরে গিয়ে আবার চেষ্টা করুন।"
    is SaveResult.Failed -> "সংরক্ষণ করা যায়নি, কিছুই হারায়নি। আপনার লেখা ড্রাফটে আছে; আবার চেষ্টা করুন।"
}

/** Minimum | Full Editor switch (segmented design, shared with the edit screens). */
@Composable
fun EditorModePicker(mode: EditorMode, enabled: Boolean, onChange: (EditorMode) -> Unit) = EditorModeTabs(mode, enabled, onChange)

@Composable
fun TypeAndMarksControls(
    index: Int,
    typeId: String,
    marks: Double,
    labels: Map<String, String>,
    enabled: Boolean,
    onType: (String) -> Unit,
    onMarks: (Double) -> Unit,
    onMarksValidity: (Boolean) -> Unit = {},
) {
    var expanded by remember { mutableStateOf(false) }
    var rawMarks by remember(index) { mutableStateOf(marks.toString()) }
    LaunchedEffect(marks) {
        if (rawMarks.toDoubleOrNull() != marks) rawMarks = marks.toString()
    }
    LaunchedEffect(rawMarks) {
        val parsed = rawMarks.toDoubleOrNull()
        onMarksValidity(parsed != null && parsed.isFinite() && parsed > 0.0)
    }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("প্রশ্নের ধরন", style = MaterialTheme.typography.labelMedium)
        Box {
            TextButton(onClick = { expanded = true }, enabled = enabled) {
                Text(labels[typeId] ?: typeId)
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                labels.forEach { (id, label) ->
                    DropdownMenuItem(text = { Text(label) }, onClick = { expanded = false; onType(id) })
                }
            }
        }
        OutlinedTextField(
            value = rawMarks,
            onValueChange = { raw ->
                rawMarks = raw
                raw.toDoubleOrNull()?.takeIf { it.isFinite() && it > 0.0 }?.let(onMarks)
            },
            label = { Text("নম্বর") },
            enabled = enabled,
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            isError = rawMarks.toDoubleOrNull()?.let { !it.isFinite() || it <= 0.0 } ?: true,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/* ----------------------------------------------- the editor screen -------------------------------------------------- */

private fun slotHasContent(d: DraftText, i: Int): Boolean =
    d.texts[i].isNotBlank() || d.answers[i].isNotBlank() || d.solutionTexts[i].any { it.isNotBlank() } ||
        d.solutionPartsByLabel?.getOrNull(i)?.any { it.partType == "IMAGE" } == true

private fun contentMask(d: DraftText): Int =
    CqLabel.entries.indices.fold(0) { acc, i -> if (slotHasContent(d, i)) acc or (1 shl i) else acc }

private fun blockPreviewText(d: DraftText, i: Int): String = buildString {
    append(d.texts[i])
    d.answers[i].takeIf { it.isNotBlank() }?.let { append("\n\nউত্তর: ").append(it) }
    d.solutionTexts[i].filter { it.isNotBlank() }.forEachIndexed { n, v -> append("\n\nসমাধান ${n + 1}: ").append(v) }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun QuestionEditorScreen(
    viewModel: QuestionEditorViewModel,
    imagePipeline: ImagePipeline,
    onSaved: (Int) -> Unit,
    onBack: () -> Unit,
    topicName: String? = null,
) {
    val draft = viewModel.draft
    val cs = MaterialTheme.colorScheme
    val boards by viewModel.boardCatalog.collectAsState()
    val typeLabels by viewModel.questionTypeLabels.collectAsState()
    var showDuplicateConfirm by rememberSaveable { mutableStateOf(false) }
    var showPreview by rememberSaveable { mutableStateOf(false) }
    var previewTitle by rememberSaveable { mutableStateOf<String?>(null) }
    var previewBody by rememberSaveable { mutableStateOf("") }
    var shownMask by rememberSaveable { mutableStateOf(0) }
    var topicOpen by rememberSaveable { mutableStateOf(true) }
    val invalidMarkFields = remember { mutableStateListOf<Int>() }
    val full = viewModel.editorMode == EditorMode.FULL
    val busy = viewModel.saving

    val saveNow: () -> Unit = {
        viewModel.save {
            val n = (viewModel.result as? SaveResult.Saved)?.questionIds?.size ?: 0
            onSaved(n)
        }
    }
    val canSave = !busy && !viewModel.checkingDuplicate && !draft.isBlank && invalidMarkFields.isEmpty()

    if (showPreview) {
        AlertDialog(
            onDismissRequest = { showPreview = false },
            title = { Text("প্রশ্ন প্রিভিউ") },
            text = {
                Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    draft.stimulus.takeIf { it.isNotBlank() }?.let { Text("উদ্দীপক\n$it") }
                    draft.referenceText.takeIf { it.isNotBlank() }?.let { Text("রেফারেন্স\n$it") }
                    CqLabel.entries.forEachIndexed { i, label ->
                        if (draft.texts[i].isNotBlank()) {
                            Text("${label.letter}) ${typeLabels[draft.questionTypeIds[i]] ?: label.typeLabel} · ${marksText(draft.marks[i])} নম্বর", fontWeight = FontWeight.Bold)
                            Text(draft.texts[i])
                            draft.answers[i].takeIf { it.isNotBlank() }?.let { Text("উত্তর: $it") }
                            draft.solutionTexts[i].filter { it.isNotBlank() }.forEachIndexed { n, value -> Text("সমাধান ${n + 1}: $value") }
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showPreview = false }) { Text("বন্ধ") } },
        )
    }
    previewTitle?.let { title ->
        AlertDialog(
            onDismissRequest = { previewTitle = null },
            title = { Text(title) },
            text = { Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState())) { Text(previewBody.ifBlank { "এখনো কিছু লেখা হয়নি।" }) } },
            confirmButton = { TextButton(onClick = { previewTitle = null }) { Text("বন্ধ") } },
        )
    }
    if (showDuplicateConfirm) {
        AlertDialog(
            onDismissRequest = { showDuplicateConfirm = false },
            title = { Text("একই লেখা আগে থেকেই আছে") },
            text = { Text("এই টপিকে হুবহু একই প্রশ্নের লেখা পাওয়া গেছে। তবুও কি নতুন প্রশ্নটি সংরক্ষণ করবেন?") },
            confirmButton = { TextButton(onClick = { showDuplicateConfirm = false; saveNow() }) { Text("তবু সংরক্ষণ করো") } },
            dismissButton = { TextButton(onClick = { showDuplicateConfirm = false }) { Text("ফিরে যাও") } },
        )
    }

    Scaffold(
        topBar = {
            EditorTopBar(
                title = "প্রশ্ন সম্পাদনা",
                unsaved = !draft.isBlank,
                canUndo = !busy && viewModel.canUndo,
                canRedo = !busy && viewModel.canRedo,
                saving = busy,
                saveEnabled = canSave,
                onClose = onBack,
                onUndo = viewModel::undo,
                onRedo = viewModel::redo,
                onSave = { if (viewModel.duplicateWarning) showDuplicateConfirm = true else saveNow() },
            )
        },
    ) { innerPadding ->
        if (!viewModel.loaded) {
            Column(modifier = Modifier.fillMaxSize().padding(innerPadding), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }

        // Which of the four label slots (ক..ঘ) have a card. Slots with content always show; the rest follow the add/move/delete buttons.
        val mask = (shownMask or contentMask(draft)).let { if (it == 0) 1 else it }
        val visible = CqLabel.entries.indices.filter { mask and (1 shl it) != 0 }
        val freeSlots = CqLabel.entries.indices.filter { mask and (1 shl it) == 0 }

        val stimulusAdder = rememberStimulusImageAdder(
            pipeline = imagePipeline,
            imageScope = ImageScope.TYPE_CQ,
            images = draft.stimulusImages.orEmpty(),
            enabled = !busy,
            onChange = viewModel::setStimulusImages,
        )

        Column(Modifier.fillMaxSize().padding(innerPadding).imePadding()) {
            Surface(color = cs.surface) {
                Box(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp)) {
                    EditorModeTabs(
                        mode = viewModel.editorMode,
                        enabled = !busy && (invalidMarkFields.isEmpty() || full),
                    ) { mode -> if (mode == EditorMode.FULL || invalidMarkFields.isEmpty()) viewModel.setEditorMode(mode) }
                }
            }
            Column(
                modifier = Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                val status = when (viewModel.draftStatus) {
                    DraftStatus.NONE -> "লেখা স্বয়ংক্রিয়ভাবে ড্রাফটে সংরক্ষিত হয়। অ্যাপ বন্ধ হলেও হারাবে না।"
                    DraftStatus.WAITING -> "ড্রাফটে সংরক্ষণ হচ্ছে…"
                    DraftStatus.SAVED -> "ড্রাফট সংরক্ষিত ✓ (এখনো প্রশ্ন হিসেবে সংরক্ষিত হয়নি)"
                }
                Text(status, style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant)
                if (invalidMarkFields.isNotEmpty()) Text("নম্বরের ঘরে শূন্যের বেশি বৈধ সংখ্যা দিন।", color = cs.error)
                if (viewModel.duplicateWarning) Text("এই টপিকে হুবহু একই প্রশ্নের লেখা পাওয়া গেছে। সংরক্ষণের আগে যাচাই করুন।", color = cs.error)
                if (viewModel.restoredFromDraft) Text("আগের অসমাপ্ত লেখা ফিরিয়ে আনা হয়েছে।", style = MaterialTheme.typography.bodyMedium, color = cs.primary)

                // --- topic (Full Editor): the subject/chapter/topic of this editor session, read only ---
                if (full && !topicName.isNullOrBlank()) {
                    EdCard {
                        Row(
                            Modifier.fillMaxWidth().clickable { topicOpen = !topicOpen },
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            EdIconGlyph(EdIcon.LAYERS, cs.primary, Modifier.size(26.dp))
                            Text("টপিক", color = cs.primary, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                            EdIconGlyph(EdIcon.CHEVRON, cs.primary, Modifier.size(22.dp).rotate(if (topicOpen) 180f else 0f))
                        }
                        if (topicOpen) {
                            Text(topicName, style = MaterialTheme.typography.labelLarge, color = cs.onSurfaceVariant)
                            Text("নতুন প্রশ্ন এই টপিকেই সংরক্ষিত হবে।", style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant)
                        }
                    }
                }

                // --- stimulus card ---
                EdCard {
                    FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(Modifier.height(44.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Box(Modifier.size(28.dp).border(2.dp, cs.primary, CircleShape), contentAlignment = Alignment.Center) {
                                Text("?", color = cs.primary, fontWeight = FontWeight.Bold)
                            }
                            Text("উদ্দীপক", color = cs.primary, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                        }
                        EdBoardPill(draft.stimulusBoards, boards, !busy, viewModel::changeStimulusBoards, viewModel::addBoard)
                        EdIconButton(EdIcon.EYE, "উদ্দীপকের প্রিভিউ", {
                            previewTitle = "উদ্দীপক"
                            previewBody = listOf(draft.stimulus, draft.referenceText).filter { it.isNotBlank() }.joinToString("\n\n")
                        })
                        EdRatingPill(draft.stimulusRating, !busy, viewModel::changeStimulusRating)
                        EdIconButton(EdIcon.IMAGE_ADD, "উদ্দীপকে ছবি যোগ করুন", { stimulusAdder.pick(null) }, enabled = !busy && !stimulusAdder.importing, dashed = true)
                    }
                    EdTagChips(draft.stimulusBoards, boards, !busy, viewModel::changeStimulusBoards)
                    EdStimulusImages(imagePipeline, ImageScope.TYPE_CQ, draft.stimulusImages.orEmpty(), !busy, stimulusAdder, viewModel::setStimulusImages)
                    EdTextArea(
                        value = draft.stimulus,
                        onValueChange = viewModel::setStimulus,
                        enabled = !busy,
                        placeholder = "উদ্দীপক লিখুন (ঐচ্ছিক)",
                        showMathBar = full,
                    )
                    if ((draft.stimulusRating != null || draft.stimulusBoards.isNotEmpty()) && draft.stimulus.isBlank() && draft.referenceText.isBlank()) {
                        EdHint("উদ্দীপকের লেখা না থাকলে এর রেটিং ও বোর্ড সংরক্ষণ হয় না।")
                    }
                    OutlinedTextField(
                        value = draft.referenceText,
                        onValueChange = viewModel::setReferenceText,
                        placeholder = { Text("রেফারেন্স (ঐচ্ছিক)") },
                        shape = RoundedCornerShape(16.dp),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                // --- question list ---
                Text("প্রশ্ন তালিকা (${visible.size.toBengali()}টি প্রশ্ন)", fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                visible.forEach { i ->
                    key(i) {
                        QuestionBlockCard(
                            viewModel = viewModel,
                            index = i,
                            full = full,
                            boards = boards,
                            typeLabels = typeLabels,
                            pipeline = imagePipeline,
                            canDelete = visible.size > 1,
                            labelOptions = if (full) freeSlots.map { it to CqLabel.entries[it].letter } else emptyList(),
                            onMove = { to ->
                                viewModel.swapBlocks(i, to)
                                shownMask = (mask and (1 shl i).inv()) or (1 shl to)
                            },
                            onDelete = {
                                viewModel.clearBlock(i)
                                shownMask = mask and (1 shl i).inv()
                            },
                            onPreview = { title, body -> previewTitle = title; previewBody = body },
                            onMarksValidity = { valid -> if (valid) invalidMarkFields.remove(i) else if (i !in invalidMarkFields) invalidMarkFields.add(i) },
                        )
                    }
                }

                val nextFree = freeSlots.firstOrNull()
                val addShape = RoundedCornerShape(20.dp)
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(58.dp)
                        .clip(addShape)
                        .dashedBorder(if (nextFree != null && !busy) cs.primary else cs.outline, radius = 20.dp, width = 2.dp)
                        .clickable(enabled = nextFree != null && !busy) { shownMask = mask or (1 shl nextFree!!) },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        if (nextFree != null) "+ আরও প্রশ্ন যোগ করো" else "চারটি প্রশ্নই যোগ করা হয়েছে",
                        color = if (nextFree != null && !busy) cs.primary else cs.onSurfaceVariant,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 16.sp,
                    )
                }

                resultText(viewModel.result)?.let { Text(it, color = cs.error, style = MaterialTheme.typography.bodyMedium) }
                if (full) TextButton(onClick = { showPreview = true }) { Text("প্রিভিউ দেখুন") }
                TextButton(onClick = viewModel::clearAll, enabled = !busy && !draft.isBlank) { Text("সব লেখা মুছে ফেলুন") }
            }
        }
    }
}

/** One question card (ক / খ / গ / ঘ): label, marks, board, preview, rating, text, solution parts and short answer. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun QuestionBlockCard(
    viewModel: QuestionEditorViewModel,
    index: Int,
    full: Boolean,
    boards: List<BoardItem>,
    typeLabels: Map<String, String>,
    pipeline: ImagePipeline,
    canDelete: Boolean,
    labelOptions: List<Pair<Int, String>>,
    onMove: (Int) -> Unit,
    onDelete: () -> Unit,
    onPreview: (String, String) -> Unit,
    onMarksValidity: (Boolean) -> Unit,
) {
    val label = CqLabel.entries[index]
    val draft = viewModel.draft
    val busy = viewModel.saving
    val cs = MaterialTheme.colorScheme
    val parts = (draft.solutionPartsByLabel?.getOrNull(index) ?: draft.solutionTexts[index].mapIndexed { partIndex, text ->
        QuestionSolutionPart("type_cq:new:${label.letter}:text:$partIndex", "TEXT", partIndex.toLong(), textContent = text)
    }).sortedBy { it.position }
    val solutionAdder = rememberSolutionImageAdder(pipeline, ImageScope.TYPE_CQ, parts, !busy) { viewModel.setSolutionImageParts(index, it) }
    val textParts = draft.solutionTexts[index]

    EdCard {
        FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            EdLabelChip(label.letter, labelOptions, !busy, onMove)
            if (full) {
                EdMarksField(index, draft.marks[index], !busy, { viewModel.setMarks(index, it) }, onMarksValidity)
                EdTypePill(draft.questionTypeIds[index], typeLabels, !busy) { viewModel.setQuestionType(index, it) }
            } else {
                Row(Modifier.height(44.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("${marksText(draft.marks[index])} নম্বর", color = cs.primary, fontWeight = FontWeight.SemiBold)
                }
            }
            EdBoardPill(draft.boards[index], boards, !busy, { viewModel.changeBoards(index, it) }, viewModel::addBoard)
            EdIconButton(EdIcon.EYE, "${label.letter}) প্রশ্নের প্রিভিউ", { onPreview("${label.letter}) প্রশ্ন", blockPreviewText(draft, index)) })
            EdRatingPill(draft.ratings[index], !busy) { viewModel.changeRating(index, it) }
            if (full) EdIconButton(EdIcon.TRASH, "${label.letter}) প্রশ্ন মুছুন", onDelete, enabled = !busy && canDelete, tintOverride = Color(0xFFE11D2E))
        }
        EdTagChips(draft.boards[index], boards, !busy) { viewModel.changeBoards(index, it) }
        EdTextArea(
            value = draft.texts[index],
            onValueChange = { viewModel.setText(index, it) },
            enabled = !busy,
            placeholder = "প্রশ্ন লিখুন",
            showMathBar = full,
        )
        if ((draft.ratings[index] != null || draft.boards[index].isNotEmpty()) && draft.texts[index].isBlank()) {
            EdHint("প্রশ্নের লেখা না থাকলে এর রেটিং ও বোর্ড সংরক্ষণ হয় না।")
        }
        HorizontalDivider(color = cs.outlineVariant)

        // --- solution ---
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Text("সমাধান", color = cs.primary, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                EdIconButton(EdIcon.EYE, "সমাধানের প্রিভিউ", {
                    onPreview("${label.letter}) সমাধান", textParts.filter { it.isNotBlank() }.joinToString("\n\n"))
                })
                EdIconButton(EdIcon.IMAGE_ADD, "সমাধানে ছবি যোগ করুন", { solutionAdder.pick(null) }, enabled = !busy && !solutionAdder.importing, dashed = true)
            }
        }
        // With no part yet, one empty box is shown; the first key stays the same once the part exists, so typing keeps its focus.
        val placeholder = parts.isEmpty()
        val shownParts = if (placeholder) listOf(QuestionSolutionPart("first-text", "TEXT", 0L, textContent = "")) else parts
        var textIndex = 0
        shownParts.forEachIndexed { order, part ->
            val isFirstText = part.partType != "IMAGE" && textIndex == 0
            key(if (isFirstText) "first-text" else part.partId) {
                if (part.partType == "IMAGE") {
                    part.imageId?.let { imageId ->
                        EdThumbnail(
                            pipeline = pipeline,
                            imageId = imageId,
                            imageScope = ImageScope.TYPE_CQ,
                            enabled = !busy && !solutionAdder.importing,
                            onReplace = { solutionAdder.pick(part.partId) },
                            onRemove = { viewModel.setSolutionImageParts(index, parts.filterNot { it.partId == part.partId }.mapIndexed { i, row -> row.copy(position = i.toLong()) }) },
                        ) {
                            TextButton(enabled = !busy && order > 0, onClick = { viewModel.setSolutionImageParts(index, moveSolutionPart(parts, part.partId, -1)) }) { Text("←") }
                            TextButton(enabled = !busy && order < parts.lastIndex, onClick = { viewModel.setSolutionImageParts(index, moveSolutionPart(parts, part.partId, 1)) }) { Text("→") }
                        }
                    }
                } else {
                    val t = textIndex
                    EdTextArea(
                        value = textParts.getOrElse(t) { "" },
                        onValueChange = {
                            if (placeholder) viewModel.addSolutionText(index)
                            viewModel.setSolutionText(index, t, it)
                        },
                        enabled = !busy,
                        placeholder = "সমাধান লিখুন",
                        showMathBar = full,
                    )
                    if (textParts.size > 1) {
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                            TextButton(onClick = { viewModel.moveSolutionText(index, t, t - 1) }, enabled = !busy && t > 0) { Text("↑") }
                            TextButton(onClick = { viewModel.moveSolutionText(index, t, t + 1) }, enabled = !busy && t < textParts.lastIndex) { Text("↓") }
                            TextButton(onClick = { viewModel.removeSolutionText(index, t) }, enabled = !busy) { Text("এই অংশ সরান") }
                        }
                    }
                }
            }
            if (part.partType != "IMAGE") textIndex++
        }
        if (solutionAdder.error.isNotBlank()) Text(solutionAdder.error, color = cs.error, style = MaterialTheme.typography.bodySmall)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)) {
            EdIconButton(EdIcon.IMAGE_ADD, "সমাধানে ছবি যোগ করুন", { solutionAdder.pick(null) }, enabled = !busy && !solutionAdder.importing, dashed = true)
            EdIconButton(EdIcon.PLUS_BOX, "সমাধানের আরেকটি অংশ যোগ করুন", { viewModel.addSolutionText(index) }, enabled = !busy, dashed = true)
        }

        // --- short answer ---
        HorizontalDivider(color = cs.outlineVariant)
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Text("সংক্ষিপ্ত উত্তর (ঐচ্ছিক)", fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            EdIconButton(EdIcon.EYE, "সংক্ষিপ্ত উত্তরের প্রিভিউ", { onPreview("${label.letter}) সংক্ষিপ্ত উত্তর", draft.answers[index]) })
        }
        OutlinedTextField(
            value = draft.answers[index],
            onValueChange = { viewModel.setAnswer(index, it) },
            enabled = !busy,
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
