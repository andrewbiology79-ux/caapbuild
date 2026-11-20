package com.questionbank.app.ui.question

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import com.questionbank.app.ui.components.AppHeader
import com.questionbank.app.ui.format.toBengali
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalContext
import android.widget.Toast
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.questionbank.app.domain.question.CqLabel
import com.questionbank.app.domain.question.QuestionRules
import com.questionbank.app.domain.question.SaveResult
import com.questionbank.app.domain.question.QuestionSolutionPart
import com.questionbank.app.media.ImagePipeline
import com.questionbank.app.media.ImageScope

private fun resultText(result: SaveResult?): String? = when (result) {
    null, is SaveResult.Saved -> null
    SaveResult.Empty -> "কমপক্ষে একটি প্রশ্নের লেখা দিন।"
    is SaveResult.MissingQuestionText -> "${result.label.letter}) এর উত্তর লেখা আছে, কিন্তু প্রশ্ন খালি। প্রশ্ন লিখুন বা উত্তরটি মুছুন।"
    is SaveResult.TooLong -> "${result.field} অনেক বড় (সর্বোচ্চ ${QuestionRules.MAX_TEXT_LENGTH} অক্ষর)।"
    SaveResult.TopicMissing -> "টপিকটি আর নেই। আপনার লেখা ড্রাফটে আছে; ফিরে গিয়ে আবার চেষ্টা করুন।"
    is SaveResult.Failed -> "সংরক্ষণ করা যায়নি, কিছুই হারায়নি। আপনার লেখা ড্রাফটে আছে; আবার চেষ্টা করুন।"
}

@Composable
fun CqBlockLabelAndMarksControls(
    currentLabel: CqLabel,
    marks: Double,
    availableLabels: List<CqLabel>,
    enabled: Boolean,
    onLabel: (CqLabel) -> Unit,
    onMarks: (Double) -> Unit,
    onMarksValidity: (Boolean) -> Unit = {},
) {
    var rawMarks by remember(currentLabel, marks) { mutableStateOf(marks.toString()) }
    var expanded by remember { mutableStateOf(false) }
    LaunchedEffect(marks) {
        if (rawMarks.toDoubleOrNull() != marks) rawMarks = marks.toString()
    }
    LaunchedEffect(rawMarks) {
        val parsed = rawMarks.toDoubleOrNull()
        onMarksValidity(parsed != null && parsed.isFinite() && parsed > 0.0)
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Box {
            Row(
                modifier = Modifier
                    .height(32.dp)
                    .clip(RoundedCornerShape(7.dp))
                    .background(Color(0xFF3B4FD8))
                    .clickable(enabled = enabled) { expanded = true }
                    .padding(horizontal = 9.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(currentLabel.letter, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Text("⌄", color = Color.White, fontSize = 11.sp)
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                availableLabels.forEach { label ->
                    DropdownMenuItem(
                        text = { Text(label.letter) },
                        onClick = { expanded = false; if (label != currentLabel) onLabel(label) },
                    )
                }
            }
        }
        OutlinedTextField(
            value = rawMarks,
            onValueChange = { raw ->
                rawMarks = raw
                raw.toDoubleOrNull()?.takeIf { it.isFinite() && it > 0.0 }?.let(onMarks)
            },
            enabled = enabled,
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            isError = rawMarks.toDoubleOrNull()?.let { !it.isFinite() || it <= 0.0 } ?: true,
            textStyle = TextStyle(fontSize = 12.sp, textAlign = TextAlign.Center, fontWeight = FontWeight.Bold),
            shape = RoundedCornerShape(8.dp),
            modifier = Modifier.width(40.dp).height(40.dp).semantics { contentDescription = "প্রশ্নের নম্বর" },
        )
    }
}

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
    var rawMarks by remember(index) { mutableStateOf(marks.toString()) }
    LaunchedEffect(marks) {
        if (rawMarks.toDoubleOrNull() != marks) rawMarks = marks.toString()
    }
    LaunchedEffect(rawMarks) {
        val parsed = rawMarks.toDoubleOrNull()
        onMarksValidity(parsed != null && parsed.isFinite() && parsed > 0.0)
    }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        var typeExpanded by remember { mutableStateOf(false) }
        Box {
            Row(
                modifier = Modifier
                    .height(34.dp)
                    .clip(RoundedCornerShape(7.dp))
                    .background(Color(0xFF3B4FD8))
                    .clickable(enabled = enabled) { typeExpanded = true }
                    .padding(horizontal = 9.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(labels[typeId] ?: typeId, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                Text("⌄", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
            DropdownMenu(expanded = typeExpanded, onDismissRequest = { typeExpanded = false }) {
                labels.forEach { (id, label) ->
                    DropdownMenuItem(text = { Text(label) }, onClick = { typeExpanded = false; onType(id) })
                }
            }
        }
        OutlinedTextField(
            value = rawMarks,
            onValueChange = { raw ->
                rawMarks = raw
                raw.toDoubleOrNull()?.takeIf { it.isFinite() && it > 0.0 }?.let(onMarks)
            },
            enabled = enabled,
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            isError = rawMarks.toDoubleOrNull()?.let { !it.isFinite() || it <= 0.0 } ?: true,
            textStyle = TextStyle(fontSize = 12.sp, textAlign = TextAlign.Center, fontWeight = FontWeight.Bold),
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier
                .width(48.dp)
                .height(42.dp)
                .semantics { contentDescription = "নম্বর" },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuestionEditorScreen(
    viewModel: QuestionEditorViewModel,
    imagePipeline: ImagePipeline,
    onSaved: (Int) -> Unit,
    onBack: () -> Unit,
) {
    val draft = viewModel.draft
    val boards by viewModel.boardCatalog.collectAsState()
    val typeLabels by viewModel.questionTypeLabels.collectAsState()
    var showDuplicateConfirm by rememberSaveable { mutableStateOf(false) }
    var showPreview by rememberSaveable { mutableStateOf(false) }
    val invalidMarkFields = remember { mutableStateListOf<Int>() }
    var stimulusPreviewOpen by rememberSaveable { mutableStateOf(false) }
    val questionPreviewOpen = remember { mutableStateListOf(false, false, false, false) }
    val solutionPreviewOpen = remember { mutableStateListOf(false, false, false, false) }
    val context = LocalContext.current
    // CAAP opens a new group with only গ and ঘ; the current persisted schema supports one row per label.
    var visibleBlockMask by rememberSaveable { mutableStateOf("23") }
    var pendingBlockRemoval by rememberSaveable { mutableStateOf<Int?>(null) }
    val visibleBlockIndices = visibleBlockMask.mapNotNull { it.digitToIntOrNull() }.filter { it in 0..3 }.distinct().sorted()
    LaunchedEffect(viewModel.loaded) {
        if (viewModel.loaded) {
            val restored = CqLabel.entries.indices.filter { index ->
                draft.texts[index].isNotBlank() || draft.answers[index].isNotBlank() ||
                    draft.solutionTexts[index].any { it.isNotBlank() } ||
                    draft.boards[index].isNotEmpty() || draft.ratings[index] != null ||
                    draft.solutionPartsByLabel?.getOrNull(index)?.isNotEmpty() == true
            }
            visibleBlockMask = (restored.ifEmpty { listOf(2, 3) }).sorted().joinToString("")
        }
    }
    val saveNow: () -> Unit = {
        viewModel.save {
            val n = (viewModel.result as? SaveResult.Saved)?.questionIds?.size ?: 0
            onSaved(n)
        }
    }
    if (showPreview) {
        AlertDialog(
            onDismissRequest = { showPreview = false },
            title = { Text("প্রশ্ন প্রিভিউ") },
            text = {
                Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    draft.stimulus.takeIf { it.isNotBlank() }?.let { Text("উদ্দীপক\n$it") }
                    draft.referenceText.takeIf { it.isNotBlank() }?.let { Text("রেফারেন্স\n$it") }
                    visibleBlockIndices.forEach { i ->
                        val label = CqLabel.entries[i]
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
    pendingBlockRemoval?.let { index ->
        val label = CqLabel.entries[index]
        AlertDialog(
            onDismissRequest = { pendingBlockRemoval = null },
            title = { Text("প্রশ্নটি মুছবেন?") },
            text = { Text("(${label.letter}) প্রশ্নটি মুছে ফেলা হবে।") },
            confirmButton = {
                TextButton(onClick = {
                    if (visibleBlockIndices.size > 1) {
                        viewModel.clearQuestionBlock(index)
                        visibleBlockMask = visibleBlockIndices.filterNot { it == index }.joinToString("")
                        questionPreviewOpen[index] = false
                        solutionPreviewOpen[index] = false
                    }
                    pendingBlockRemoval = null
                }) { Text("মুছুন", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { pendingBlockRemoval = null }) { Text("না") } },
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
            Column {
                AppHeader(
                    title = "প্রশ্ন যোগ করো",
                    onBack = onBack,
                    leadingGlyph = "×",
                    actions = {
                        EditorHeaderActions(
                            canUndo = viewModel.canUndo,
                            canRedo = viewModel.canRedo,
                            canSave = !viewModel.saving && !viewModel.checkingDuplicate && !draft.isBlank && invalidMarkFields.isEmpty(),
                            saving = viewModel.saving,
                            onUndo = viewModel::undo,
                            onRedo = viewModel::redo,
                            onSave = { if (viewModel.duplicateWarning) showDuplicateConfirm = true else saveNow() },
                        )
                    },
                )
                EditorModeBar(
                    viewModel.editorMode,
                    !viewModel.saving && (invalidMarkFields.isEmpty() || viewModel.editorMode == EditorMode.FULL),
                ) { mode -> if (mode == EditorMode.FULL || invalidMarkFields.isEmpty()) viewModel.setEditorMode(mode) }
            }
        },
    ) { innerPadding ->
        if (!viewModel.loaded) {
            Column(modifier = Modifier.fillMaxSize().padding(innerPadding), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            val status = when (viewModel.draftStatus) {
                DraftStatus.NONE -> "লেখা স্বয়ংক্রিয়ভাবে ড্রাফটে সংরক্ষিত হয়। অ্যাপ বন্ধ হলেও হারাবে না।"
                DraftStatus.WAITING -> "ড্রাফটে সংরক্ষণ হচ্ছে…"
                DraftStatus.SAVED -> "ড্রাফট সংরক্ষিত ✓ (এখনো প্রশ্ন হিসেবে সংরক্ষিত হয়নি)"
            }
            EditorDraftStatus(status, isSuccess = viewModel.draftStatus == DraftStatus.SAVED)
            if (invalidMarkFields.isNotEmpty()) Text("নম্বরের ঘরে শূন্যের বেশি বৈধ সংখ্যা দিন।", color = MaterialTheme.colorScheme.error)
            if (viewModel.duplicateWarning) Text("এই টপিকে হুবহু একই লেখা পাওয়া গেছে। সংরক্ষণের আগে যাচাই করুন।", color = MaterialTheme.colorScheme.error)
            if (viewModel.restoredFromDraft) EditorDraftStatus("আগের অসমাপ্ত লেখা ফিরিয়ে আনা হয়েছে।", isSuccess = true)

            EditorPanel {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    Text("ⓘ উদ্দীপক *", modifier = Modifier.weight(1f), color = Color(0xFF2A3BB0), fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                    BoardTagsInlineControl(
                        tags = draft.stimulusBoards,
                        boards = boards,
                        enabled = !viewModel.saving,
                        onChange = viewModel::changeStimulusBoards,
                        onAddBoard = viewModel::addBoard,
                        modifier = Modifier.weight(1.15f),
                    )
                    EditorEyeToggle(stimulusPreviewOpen, enabled = !viewModel.saving) { stimulusPreviewOpen = !stimulusPreviewOpen }
                    EditorRatingSelect(draft.stimulusRating, enabled = !viewModel.saving, onSelect = viewModel::changeStimulusRating)
                }
                StimulusImageAttachments(
                    pipeline = imagePipeline,
                    imageScope = ImageScope.TYPE_CQ,
                    images = draft.stimulusImages.orEmpty(),
                    enabled = !viewModel.saving,
                    onChange = viewModel::setStimulusImages,
                    compact = true,
                )
                if (viewModel.editorMode == EditorMode.FULL) {
                    MathSymbolBar(enabled = !viewModel.saving) { symbol -> viewModel.setStimulus(draft.stimulus + symbol) }
                }
                OutlinedTextField(
                    value = draft.stimulus,
                    onValueChange = viewModel::setStimulus,
                    placeholder = { Text("এখানে উদ্দীপকের বিবরণ ও গাণিতিক সূত্র লিখুন...") },
                    minLines = if (viewModel.editorMode == EditorMode.FULL) 4 else 2,
                    textStyle = TextStyle(fontSize = 17.sp, lineHeight = 26.sp),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth(),
                )
                if (stimulusPreviewOpen) EditorLivePreview("উদ্দীপকের প্রিভিউ", draft.stimulus)
                OutlinedTextField(
                    value = draft.referenceText,
                    onValueChange = viewModel::setReferenceText,
                    placeholder = { Text("যেমন: রেফারেন্স লিখুন") },
                    singleLine = true,
                    textStyle = TextStyle(fontSize = 15.sp),
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            if (viewModel.editorMode == EditorMode.FULL) {
                EditorSectionTitle(
                    "প্রশ্ন তালিকা (${visibleBlockIndices.size.toBengali()}টি প্রশ্ন)",
                    trailing = if (visibleBlockIndices.size > 1) ({
                        TextButton(onClick = {
                            visibleBlockMask = visibleBlockIndices.sorted().joinToString("")
                            Toast.makeText(context, "প্রশ্নগুলো আগে থেকেই ক-খ-গ-ঘ ক্রমে আছে।", Toast.LENGTH_SHORT).show()
                        }, enabled = !viewModel.saving) { Text("ক-খ-গ-ঘ সাজাও", fontSize = 11.sp) }
                    }) else null,
                )
            }
            visibleBlockIndices.forEach { i ->
                val label = CqLabel.entries[i]
                EditorPanel {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        if (viewModel.editorMode == EditorMode.FULL) {
                            CqBlockLabelAndMarksControls(
                                currentLabel = label,
                                marks = draft.marks[i],
                                availableLabels = CqLabel.entries.filter { it.sortOrder - 1 == i || it.sortOrder - 1 !in visibleBlockIndices },
                                enabled = !viewModel.saving,
                                onLabel = { nextLabel ->
                                    val nextIndex = nextLabel.sortOrder - 1
                                    viewModel.moveQuestionBlock(i, nextIndex)
                                    visibleBlockMask = (visibleBlockIndices.filterNot { it == i } + nextIndex).distinct().sorted().joinToString("")
                                    questionPreviewOpen[nextIndex] = questionPreviewOpen[i]
                                    solutionPreviewOpen[nextIndex] = solutionPreviewOpen[i]
                                    questionPreviewOpen[i] = false
                                    solutionPreviewOpen[i] = false
                                    if (invalidMarkFields.remove(i)) invalidMarkFields.add(nextIndex)
                                },
                                onMarks = { viewModel.setMarks(i, it) },
                                onMarksValidity = { valid -> if (valid) invalidMarkFields.remove(i) else if (i !in invalidMarkFields) invalidMarkFields.add(i) },
                            )
                        } else {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(
                                    label.letter,
                                    modifier = Modifier
                                        .background(Color(0xFF3B4FD8), RoundedCornerShape(8.dp))
                                        .padding(horizontal = 12.dp, vertical = 7.dp),
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                )
                                Text("${marksText(draft.marks[i])} নম্বর", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        BoardTagsInlineControl(
                            tags = draft.boards[i],
                            boards = boards,
                            enabled = !viewModel.saving,
                            onChange = { viewModel.changeBoards(i, it) },
                            onAddBoard = viewModel::addBoard,
                            modifier = Modifier.weight(1f),
                        )
                        EditorEyeToggle(questionPreviewOpen[i], enabled = !viewModel.saving) {
                            questionPreviewOpen[i] = !questionPreviewOpen[i]
                        }
                        EditorRatingSelect(draft.ratings[i], enabled = !viewModel.saving) { viewModel.changeRating(i, it) }
                        if (viewModel.editorMode == EditorMode.FULL) {
                            TextButton(
                                onClick = { pendingBlockRemoval = i },
                                enabled = !viewModel.saving && visibleBlockIndices.size > 1,
                            ) { Text("✕", color = MaterialTheme.colorScheme.error) }
                        }
                    }
                    if (viewModel.editorMode == EditorMode.FULL) {
                        MathSymbolBar(enabled = !viewModel.saving) { symbol -> viewModel.setText(i, draft.texts[i] + symbol) }
                    }
                    OutlinedTextField(
                        value = draft.texts[i],
                        onValueChange = { viewModel.setText(i, it) },
                        placeholder = { Text("প্রশ্নের মূল বক্তব্য লিখুন...") },
                        minLines = if (viewModel.editorMode == EditorMode.FULL) 3 else 2,
                        textStyle = TextStyle(fontSize = 17.sp, lineHeight = 26.sp),
                        shape = RoundedCornerShape(16.dp),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    if (questionPreviewOpen[i]) EditorLivePreview("${label.letter}) প্রশ্নের প্রিভিউ", draft.texts[i])
                    if (viewModel.editorMode == EditorMode.FULL) {
                        OutlinedTextField(
                            value = draft.answers[i],
                            onValueChange = { viewModel.setAnswer(i, it) },
                            label = { Text("সংক্ষিপ্ত উত্তর (ঐচ্ছিক)") },
                            minLines = 1,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                    EditorSectionTitle(
                        "সমাধান",
                        trailing = { EditorEyeToggle(solutionPreviewOpen[i], enabled = !viewModel.saving) { solutionPreviewOpen[i] = !solutionPreviewOpen[i] } },
                    )
                    SolutionImageAttachments(
                        pipeline = imagePipeline,
                        imageScope = ImageScope.TYPE_CQ,
                        parts = draft.solutionPartsByLabel?.getOrNull(i) ?: draft.solutionTexts[i].mapIndexed { partIndex, text ->
                            QuestionSolutionPart("type_cq:new:${label.letter}:text:$partIndex", "TEXT", partIndex.toLong(), textContent = text)
                        },
                        enabled = !viewModel.saving,
                        onChange = { viewModel.setSolutionImageParts(i, it) },
                        compact = true,
                    )
                    draft.solutionTexts[i].forEachIndexed { partIndex, part ->
                        if (viewModel.editorMode == EditorMode.FULL) {
                            MathSymbolBar(enabled = !viewModel.saving) { symbol -> viewModel.setSolutionText(i, partIndex, part + symbol) }
                        }
                        OutlinedTextField(
                            value = part,
                            onValueChange = { viewModel.setSolutionText(i, partIndex, it) },
                            placeholder = { Text(if (partIndex == 0) "ধাপে ধাপে সমাধান লিখুন..." else "সমাধানের পরের অংশ লিখুন...") },
                            minLines = if (viewModel.editorMode == EditorMode.FULL) 3 else 2,
                            textStyle = TextStyle(fontSize = 17.sp, lineHeight = 26.sp),
                            shape = RoundedCornerShape(16.dp),
                            modifier = Modifier.fillMaxWidth(),
                        )
                        if (viewModel.editorMode == EditorMode.FULL) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                                TextButton(onClick = { viewModel.moveSolutionText(i, partIndex, partIndex - 1) }, enabled = !viewModel.saving && partIndex > 0) { Text("↑") }
                                TextButton(onClick = { viewModel.moveSolutionText(i, partIndex, partIndex + 1) }, enabled = !viewModel.saving && partIndex < draft.solutionTexts[i].lastIndex) { Text("↓") }
                                TextButton(onClick = { viewModel.removeSolutionText(i, partIndex) }, enabled = !viewModel.saving) { Text("এই অংশ সরান") }
                            }
                        }
                    }
                    if (viewModel.editorMode == EditorMode.FULL) {
                        TextButton(onClick = { viewModel.addSolutionText(i) }, enabled = !viewModel.saving) { Text("+ সমাধানের অংশ যোগ করুন") }
                    }
                    if (solutionPreviewOpen[i]) EditorLivePreview("${label.letter}) সমাধানের প্রিভিউ", draft.solutionTexts[i].filter { it.isNotBlank() }.joinToString("\n"))
                }
            }
            if (viewModel.editorMode == EditorMode.FULL) {
                TextButton(
                    onClick = {
                        val next = CqLabel.entries.indices.firstOrNull { it !in visibleBlockIndices }
                        if (next != null) {
                            viewModel.prepareQuestionBlock(next)
                            visibleBlockMask = (visibleBlockIndices + next).sorted().joinToString("")
                        } else {
                            Toast.makeText(context, "প্রতিটি ধরন (ক/খ/গ/ঘ) এই সংস্করণে একবার করে যোগ করা যায়।", Toast.LENGTH_SHORT).show()
                        }
                    },
                    enabled = !viewModel.saving && visibleBlockIndices.size < CqLabel.entries.size,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("＋ আরও প্রশ্ন যোগ করো") }
                if (visibleBlockIndices.size == CqLabel.entries.size) {
                    Text("এই ডেটা মডেলে ক/খ/গ/ঘ প্রতিটি ধরন একবার করে রাখা যায়।", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                }
            }

            resultText(viewModel.result)?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
            }
            if (viewModel.editorMode == EditorMode.FULL) {
                TextButton(onClick = { showPreview = true }) { Text("প্রিভিউ দেখুন") }
            }

            TextButton(onClick = viewModel::clearAll, enabled = !viewModel.saving && !draft.isBlank) {
                Text("সব লেখা মুছে ফেলুন")
            }
        }
    }
}
