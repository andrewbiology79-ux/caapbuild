package com.questionbank.app.ui.question

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import com.questionbank.app.ui.components.AppHeader
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
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
fun EditorModePicker(mode: EditorMode, enabled: Boolean, onChange: (EditorMode) -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(onClick = { onChange(EditorMode.MINIMUM) }, enabled = enabled && mode != EditorMode.MINIMUM, modifier = Modifier.weight(1f)) { Text("Minimum") }
        Button(onClick = { onChange(EditorMode.FULL) }, enabled = enabled && mode != EditorMode.FULL, modifier = Modifier.weight(1f)) { Text("Full Editor") }
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
            AppHeader(title = "প্রশ্ন যোগ করুন", onBack = onBack)
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
            Text(status, style = MaterialTheme.typography.bodySmall)
            EditorModePicker(
                viewModel.editorMode,
                !viewModel.saving && (invalidMarkFields.isEmpty() || viewModel.editorMode == EditorMode.FULL),
            ) { mode -> if (mode == EditorMode.FULL || invalidMarkFields.isEmpty()) viewModel.setEditorMode(mode) }
            if (invalidMarkFields.isNotEmpty()) Text("নম্বরের ঘরে শূন্যের বেশি বৈধ সংখ্যা দিন।", color = MaterialTheme.colorScheme.error)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = viewModel::undo, enabled = !viewModel.saving && viewModel.canUndo) { Text("↶ Undo") }
                TextButton(onClick = viewModel::redo, enabled = !viewModel.saving && viewModel.canRedo) { Text("↷ Redo") }
            }
            if (viewModel.duplicateWarning) Text("এই টপিকে হুবহু একই প্রশ্নের লেখা পাওয়া গেছে। সংরক্ষণের আগে যাচাই করুন।", color = MaterialTheme.colorScheme.error)
            if (viewModel.restoredFromDraft) {
                Text("আগের অসমাপ্ত লেখা ফিরিয়ে আনা হয়েছে।", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
            }

            OutlinedTextField(
                value = draft.stimulus,
                onValueChange = viewModel::setStimulus,
                label = { Text("উদ্দীপক (ঐচ্ছিক)") },
                minLines = 3,
                modifier = Modifier.fillMaxWidth(),
            )
            StimulusImageAttachments(
                pipeline = imagePipeline,
                imageScope = ImageScope.TYPE_CQ,
                images = draft.stimulusImages.orEmpty(),
                enabled = !viewModel.saving,
                onChange = viewModel::setStimulusImages,
            )
            // A stimulus rating and its boards are stored only with a stimulus text, so the controls appear when there is one.
            if (draft.stimulus.isNotBlank() || draft.referenceText.isNotBlank()) {
                RatingPicker(
                    title = "উদ্দীপকের রেটিং",
                    selected = draft.stimulusRating,
                    enabled = !viewModel.saving,
                    onSelect = viewModel::changeStimulusRating,
                )
                BoardTagsEditor(
                    title = "উদ্দীপকের বোর্ড ও সাল",
                    tags = draft.stimulusBoards,
                    boards = boards,
                    enabled = !viewModel.saving,
                    onChange = viewModel::changeStimulusBoards,
                    onAddBoard = viewModel::addBoard,
                )
            }

            OutlinedTextField(
                value = draft.referenceText,
                onValueChange = viewModel::setReferenceText,
                label = { Text("রেফারেন্স (ঐচ্ছিক)") },
                minLines = 2,
                modifier = Modifier.fillMaxWidth(),
            )

            CqLabel.entries.forEachIndexed { i, label ->
                Text(
                    "${label.letter}) ${typeLabels[draft.questionTypeIds[i]] ?: label.typeLabel} · ${marksText(draft.marks[i])} নম্বর",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
                if (viewModel.editorMode == EditorMode.FULL) {
                    TypeAndMarksControls(
                        i, draft.questionTypeIds[i], draft.marks[i], typeLabels, !viewModel.saving,
                        onType = { viewModel.setQuestionType(i, it) }, onMarks = { viewModel.setMarks(i, it) },
                        onMarksValidity = { valid -> if (valid) invalidMarkFields.remove(i) else if (i !in invalidMarkFields) invalidMarkFields.add(i) },
                    )
                }
                if (viewModel.editorMode == EditorMode.FULL) {
                    MathSymbolBar(enabled = !viewModel.saving) { symbol -> viewModel.setText(i, draft.texts[i] + symbol) }
                }
                OutlinedTextField(
                    value = draft.texts[i],
                    onValueChange = { viewModel.setText(i, it) },
                    label = { Text("প্রশ্ন") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                )
                // Same for a question: its rating and its boards are stored only with its question text.
                if (draft.texts[i].isNotBlank()) {
                    RatingPicker(
                        title = "${label.letter}) প্রশ্নের রেটিং",
                        selected = draft.ratings[i],
                        enabled = !viewModel.saving,
                        onSelect = { viewModel.changeRating(i, it) },
                    )
                    BoardTagsEditor(
                        title = "${label.letter}) প্রশ্নের বোর্ড ও সাল",
                        tags = draft.boards[i],
                        boards = boards,
                        enabled = !viewModel.saving,
                        onChange = { viewModel.changeBoards(i, it) },
                        onAddBoard = viewModel::addBoard,
                    )
                }
                OutlinedTextField(
                    value = draft.answers[i],
                    onValueChange = { viewModel.setAnswer(i, it) },
                    label = { Text("সংক্ষিপ্ত উত্তর (ঐচ্ছিক)") },
                    minLines = 1,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (viewModel.editorMode == EditorMode.FULL) {
                    draft.solutionTexts[i].forEachIndexed { partIndex, part ->
                        MathSymbolBar(enabled = !viewModel.saving) { symbol -> viewModel.setSolutionText(i, partIndex, part + symbol) }
                        OutlinedTextField(
                            value = part,
                            onValueChange = { viewModel.setSolutionText(i, partIndex, it) },
                            label = { Text("সমাধান ${partIndex + 1}") },
                            minLines = 2,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            TextButton(onClick = { viewModel.moveSolutionText(i, partIndex, partIndex - 1) }, enabled = !viewModel.saving && partIndex > 0) { Text("↑") }
                            TextButton(onClick = { viewModel.moveSolutionText(i, partIndex, partIndex + 1) }, enabled = !viewModel.saving && partIndex < draft.solutionTexts[i].lastIndex) { Text("↓") }
                            TextButton(onClick = { viewModel.removeSolutionText(i, partIndex) }, enabled = !viewModel.saving) { Text("এই অংশ সরান") }
                        }
                    }
                    TextButton(onClick = { viewModel.addSolutionText(i) }, enabled = !viewModel.saving) { Text("+ সমাধানের অংশ যোগ করুন") }
                    val mixedParts = draft.solutionPartsByLabel?.getOrNull(i) ?: draft.solutionTexts[i].mapIndexed { partIndex, text ->
                        QuestionSolutionPart("type_cq:new:${label.letter}:text:$partIndex", "TEXT", partIndex.toLong(), textContent = text)
                    }
                    SolutionImageAttachments(
                        pipeline = imagePipeline,
                        imageScope = ImageScope.TYPE_CQ,
                        parts = mixedParts,
                        enabled = !viewModel.saving,
                        onChange = { viewModel.setSolutionImageParts(i, it) },
                    )
                }
            }

            resultText(viewModel.result)?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
            }
            if (viewModel.editorMode == EditorMode.FULL) {
                TextButton(onClick = { showPreview = true }) { Text("প্রিভিউ দেখুন") }
            }

            Button(
                onClick = { if (viewModel.duplicateWarning) showDuplicateConfirm = true else saveNow() },
                enabled = !viewModel.saving && !viewModel.checkingDuplicate && !draft.isBlank && invalidMarkFields.isEmpty(),
                modifier = Modifier.fillMaxWidth(),
            ) { Text(when { viewModel.saving -> "সংরক্ষণ হচ্ছে…"; viewModel.checkingDuplicate -> "মিল যাচাই হচ্ছে…"; else -> "সংরক্ষণ করুন" }) }

            TextButton(onClick = viewModel::clearAll, enabled = !viewModel.saving && !draft.isBlank) {
                Text("সব লেখা মুছে ফেলুন")
            }
        }
    }
}
