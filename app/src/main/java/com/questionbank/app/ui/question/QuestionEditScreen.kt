package com.questionbank.app.ui.question

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.questionbank.app.domain.question.QuestionRules
import com.questionbank.app.domain.question.UpdateResult
import com.questionbank.app.ui.components.AppHeader

private fun editResultText(result: UpdateResult?): String? = when (result) {
    null, UpdateResult.Updated -> null
    UpdateResult.NoChange -> "কোনো পরিবর্তন নেই।"
    is UpdateResult.BlankedQuestion -> "${result.label.letter}) এর প্রশ্ন খালি করা যাবে না। মুছে ফেলার সুবিধা পরের সংস্করণে আসছে; এখন নতুন লেখা দিন।"
    UpdateResult.BlankedStimulus -> "উদ্দীপক খালি করা যাবে না। নতুন লেখা দিন।"
    is UpdateResult.MissingQuestionText -> "${result.label.letter}) এর উত্তর লেখা আছে, কিন্তু প্রশ্ন খালি। প্রশ্ন লিখুন বা উত্তরটি মুছুন।"
    is UpdateResult.TooLong -> "${result.field} অনেক বড় (সর্বোচ্চ ${QuestionRules.MAX_TEXT_LENGTH} অক্ষর)।"
    UpdateResult.GroupMissing -> "প্রশ্নটি আর নেই। ফিরে গিয়ে তালিকা দেখুন।"
    is UpdateResult.Failed -> "সংরক্ষণ করা যায়নি; আগের লেখা অক্ষত আছে। আবার চেষ্টা করুন।"
}

/** Edit screen of one existing card (v0.2.28; automatic edit draft v0.2.29; rating buttons v0.2.30b; board + year picker v0.2.30c-2). Full screen like the new-question editor. */
@Composable
fun QuestionEditScreen(
    viewModel: QuestionEditViewModel,
    onSaved: () -> Unit,
    onBack: () -> Unit,
) {
    var askDiscard by rememberSaveable { mutableStateOf(false) }
    var showPreview by rememberSaveable { mutableStateOf(false) }
    val invalidMarkFields = remember { mutableStateListOf<Int>() }
    val catalog by viewModel.boardCatalog.collectAsState()
    val typeLabels by viewModel.questionTypeLabels.collectAsState()
    val needsAsk = viewModel.load == EditLoad.READY && viewModel.changed && !viewModel.saving
    val tryBack: () -> Unit = {
        if (needsAsk) {
            askDiscard = true
        } else {
            onBack()
        }
    }
    BackHandler(enabled = needsAsk) { askDiscard = true }

    if (showPreview) {
        AlertDialog(
            onDismissRequest = { showPreview = false },
            title = { Text("প্রশ্ন প্রিভিউ") },
            text = {
                Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (viewModel.hasStimulus && viewModel.stimulus.isNotBlank()) Text("উদ্দীপক\n${viewModel.stimulus}")
                    if (viewModel.hasStimulus && viewModel.referenceText.isNotBlank()) Text("রেফারেন্স\n${viewModel.referenceText}")
                    viewModel.editableLabels.forEach { label ->
                        val i = label.sortOrder - 1
                        Text("${label.letter}) ${typeLabels[viewModel.questionTypeIds[i]] ?: label.typeLabel} · ${marksText(viewModel.marks[i])} নম্বর", fontWeight = FontWeight.Bold)
                        Text(viewModel.texts[i])
                        viewModel.answers[i].takeIf { it.isNotBlank() }?.let { Text("উত্তর: $it") }
                        viewModel.solutionTexts[i].filter { it.isNotBlank() }.forEachIndexed { n, value -> Text("সমাধান ${n + 1}: $value") }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showPreview = false }) { Text("বন্ধ") } },
        )
    }
    if (askDiscard) {
        AlertDialog(
            onDismissRequest = { askDiscard = false },
            title = { Text("পরিবর্তন সংরক্ষিত হয়নি") },
            text = { Text("এখন বের হলে আপনার করা পরিবর্তন ও তার ড্রাফট ফেলে দেওয়া হবে। প্রশ্নটি আগের মতোই থাকবে।") },
            confirmButton = {
                TextButton(onClick = {
                    askDiscard = false
                    viewModel.discard(onBack)
                }) { Text("ফেলে দিন") }
            },
            dismissButton = { TextButton(onClick = { askDiscard = false }) { Text("সম্পাদনা চালিয়ে যান") } },
        )
    }

    Scaffold(topBar = { AppHeader(title = "প্রশ্ন সম্পাদনা", onBack = tryBack) }) { innerPadding ->
        when (viewModel.load) {
            EditLoad.LOADING -> Column(
                modifier = Modifier.fillMaxSize().padding(innerPadding),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) { CircularProgressIndicator() }

            EditLoad.MISSING -> Column(
                modifier = Modifier.fillMaxSize().padding(innerPadding).padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text("প্রশ্নটি পাওয়া যায়নি।", style = MaterialTheme.typography.bodyLarge)
                TextButton(onClick = onBack) { Text("ফিরে যান") }
            }

            EditLoad.READY -> Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .imePadding()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                val status = when (viewModel.draftStatus) {
                    DraftStatus.NONE -> "পরিবর্তন সংরক্ষণ না করা পর্যন্ত প্রশ্নটি আগের মতোই থাকে। আপনার লেখা স্বয়ংক্রিয়ভাবে ড্রাফটে রাখা হয়; অ্যাপ বন্ধ হলেও হারাবে না।"
                    DraftStatus.WAITING -> "ড্রাফটে সংরক্ষণ হচ্ছে…"
                    DraftStatus.SAVED -> "ড্রাফট সংরক্ষিত ✓ (প্রশ্নটি এখনো আগের মতোই আছে)"
                }
                Text(status, style = MaterialTheme.typography.bodySmall)
                if (viewModel.restoredFromDraft) {
                    Text(
                        "আগের অসমাপ্ত সম্পাদনা ফিরিয়ে আনা হয়েছে।",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
                EditorModePicker(viewModel.editorMode, !viewModel.saving && (invalidMarkFields.isEmpty() || viewModel.editorMode == EditorMode.FULL)) { mode ->
                    if (mode == EditorMode.FULL || invalidMarkFields.isEmpty()) viewModel.setEditorMode(mode)
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = viewModel::undo, enabled = !viewModel.saving && viewModel.canUndo) { Text("↶ Undo") }
                    TextButton(onClick = viewModel::redo, enabled = !viewModel.saving && viewModel.canRedo) { Text("↷ Redo") }
                }
                if (viewModel.hasStimulus) {
                    OutlinedTextField(
                        value = viewModel.stimulus,
                        onValueChange = viewModel::changeStimulus,
                        label = { Text("উদ্দীপক") },
                        minLines = 3,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    RatingPicker(
                        title = "উদ্দীপকের রেটিং",
                        selected = viewModel.stimulusRating,
                        enabled = !viewModel.saving,
                        onSelect = viewModel::changeStimulusRating,
                    )
                    BoardTagsEditor(
                        title = "উদ্দীপকের বোর্ড ও সাল",
                        tags = viewModel.stimulusBoards,
                        boards = catalog,
                        enabled = !viewModel.saving,
                        onChange = viewModel::changeStimulusBoards,
                        onAddBoard = viewModel::addBoard,
                    )
                    OutlinedTextField(
                        value = viewModel.referenceText,
                        onValueChange = viewModel::changeReferenceText,
                        label = { Text("রেফারেন্স (ঐচ্ছিক)") },
                        minLines = 2,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                viewModel.editableLabels.forEach { label ->
                    val i = label.sortOrder - 1
                    Text(
                        "${label.letter}) ${typeLabels[viewModel.questionTypeIds[i]] ?: typeLabels[label.typeId] ?: label.typeLabel} · ${marksText(viewModel.marks[i])} নম্বর",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                    if (viewModel.editorMode == EditorMode.FULL) {
                        TypeAndMarksControls(
                            i, viewModel.questionTypeIds[i], viewModel.marks[i], typeLabels, !viewModel.saving,
                            onType = { viewModel.changeQuestionType(label, it) },
                            onMarks = { viewModel.changeMarks(label, it) },
                            onMarksValidity = { valid -> if (valid) invalidMarkFields.remove(i) else if (i !in invalidMarkFields) invalidMarkFields.add(i) },
                        )
                    }
                    if (viewModel.editorMode == EditorMode.FULL) {
                        MathSymbolBar(enabled = !viewModel.saving) { symbol -> viewModel.setText(label, viewModel.texts[i] + symbol) }
                    }
                    OutlinedTextField(
                        value = viewModel.texts[i],
                        onValueChange = { viewModel.setText(label, it) },
                        label = { Text("প্রশ্ন") },
                        minLines = 2,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    // The rating and the boards of a block are stored only with its question text.
                    if (viewModel.texts[i].isNotBlank()) {
                        RatingPicker(
                            title = "${label.letter}) প্রশ্নের রেটিং",
                            selected = viewModel.ratings[i],
                            enabled = !viewModel.saving,
                            onSelect = { viewModel.changeRating(label, it) },
                        )
                        BoardTagsEditor(
                            title = "${label.letter}) প্রশ্নের বোর্ড ও সাল",
                            tags = viewModel.boards[i],
                            boards = catalog,
                            enabled = !viewModel.saving,
                            onChange = { viewModel.changeBoards(label, it) },
                            onAddBoard = viewModel::addBoard,
                        )
                    }
                    OutlinedTextField(
                        value = viewModel.answers[i],
                        onValueChange = { viewModel.setAnswer(label, it) },
                        label = { Text("সংক্ষিপ্ত উত্তর (ঐচ্ছিক)") },
                        minLines = 1,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    if (viewModel.editorMode == EditorMode.FULL) {
                        viewModel.solutionTexts[i].forEachIndexed { partIndex, part ->
                            MathSymbolBar(enabled = !viewModel.saving) { symbol -> viewModel.changeSolutionText(label, partIndex, part + symbol) }
                            OutlinedTextField(
                                value = part,
                                onValueChange = { viewModel.changeSolutionText(label, partIndex, it) },
                                label = { Text("সমাধান ${partIndex + 1}") },
                                minLines = 2,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                TextButton(onClick = { viewModel.moveSolutionText(label, partIndex, partIndex - 1) }, enabled = !viewModel.saving && partIndex > 0) { Text("↑") }
                                TextButton(onClick = { viewModel.moveSolutionText(label, partIndex, partIndex + 1) }, enabled = !viewModel.saving && partIndex < viewModel.solutionTexts[i].lastIndex) { Text("↓") }
                                TextButton(onClick = { viewModel.removeSolutionText(label, partIndex) }, enabled = !viewModel.saving) { Text("এই অংশ সরান") }
                            }
                        }
                        TextButton(onClick = { viewModel.addSolutionText(label) }, enabled = !viewModel.saving) {
                            Text("+ সমাধানের অংশ যোগ করুন")
                        }
                    }
                }

                editResultText(viewModel.result)?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
                }
                if (viewModel.editorMode == EditorMode.FULL) {
                    TextButton(onClick = { showPreview = true }) { Text("প্রিভিউ দেখুন") }
                }

                Button(
                    onClick = { viewModel.save(onSaved) },
                    enabled = !viewModel.saving && viewModel.changed && invalidMarkFields.isEmpty(),
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (viewModel.saving) "সংরক্ষণ হচ্ছে…" else "পরিবর্তন সংরক্ষণ করুন") }
            }
        }
    }
}
