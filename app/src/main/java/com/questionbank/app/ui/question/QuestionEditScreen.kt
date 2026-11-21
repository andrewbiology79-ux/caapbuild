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
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.unit.sp
import com.questionbank.app.domain.question.QuestionRules
import com.questionbank.app.domain.question.QuestionSolutionPart
import com.questionbank.app.domain.question.UpdateResult
import com.questionbank.app.media.ImagePipeline
import com.questionbank.app.media.ImageScope

private fun editResultText(result: UpdateResult?): String? = when (result) {
    null, UpdateResult.Updated -> null
    UpdateResult.NoChange -> "কোনো পরিবর্তন নেই।"
    is UpdateResult.BlankedQuestion -> "${result.label.letter}) এর প্রশ্ন খালি রাখা যাবে না। নতুন লেখা দিন; উদ্দীপক-গ্রুপে ব্লক সরাতে ‘এই প্রশ্নটি মুছুন’ ব্যবহার করুন।"
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
    imagePipeline: ImagePipeline,
    onSaved: () -> Unit,
    onBack: () -> Unit,
    onManageCategories: () -> Unit,
) {
    var askDiscard by rememberSaveable { mutableStateOf(false) }
    var stimulusPreviewOpen by rememberSaveable { mutableStateOf(false) }
    var pendingDeleteLabel by remember { mutableStateOf<com.questionbank.app.domain.question.CqLabel?>(null) }
    val invalidMarkFields = remember { mutableStateListOf<Int>() }
    val catalog by viewModel.boardCatalog.collectAsState()
    val typeLabels by viewModel.questionTypeLabels.collectAsState()
    val categories by viewModel.categoryCatalog.collectAsState()
    val needsAsk = viewModel.load == EditLoad.READY && viewModel.changed && !viewModel.saving
    val tryBack: () -> Unit = {
        if (needsAsk) {
            askDiscard = true
        } else {
            onBack()
        }
    }
    BackHandler(enabled = needsAsk) { askDiscard = true }

    pendingDeleteLabel?.let { label ->
        AlertDialog(
            onDismissRequest = { pendingDeleteLabel = null },
            title = { Text("প্রশ্ন মুছে ফেলবেন?") },
            text = { Text("${label.letter}) প্রশ্নটি সংরক্ষণ করলে এই উদ্দীপক-গ্রুপ থেকে মুছে যাবে। অন্য প্রশ্নগুলো অক্ষত থাকবে।") },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.deleteQuestion(label)
                    pendingDeleteLabel = null
                }) { Text("মুছে দিন") }
            },
            dismissButton = { TextButton(onClick = { pendingDeleteLabel = null }) { Text("বাতিল") } },
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

    Scaffold(topBar = {
        EditorTopBar(
            title = "প্রশ্ন সম্পাদনা",
            unsaved = viewModel.changed,
            canUndo = !viewModel.saving && viewModel.canUndo,
            canRedo = !viewModel.saving && viewModel.canRedo,
            saving = viewModel.saving,
            saveEnabled = !viewModel.saving && viewModel.changed && invalidMarkFields.isEmpty(),
            onClose = tryBack,
            onUndo = viewModel::undo,
            onRedo = viewModel::redo,
            onSave = { viewModel.save(onSaved) },
        )
    }) { innerPadding ->
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
                if (viewModel.deletedQuestionLabels.isNotEmpty()) {
                    Text(
                        "সংরক্ষণের পর মুছে যাবে: ${viewModel.deletedQuestionLabels.joinToString { it.letter }}",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    viewModel.deletedQuestionLabels.forEach { label ->
                        TextButton(onClick = { viewModel.restoreDeletedQuestion(label) }, enabled = !viewModel.saving) {
                            Text("${label.letter}) মুছে ফেলা বাতিল")
                        }
                    }
                }
                if (viewModel.hasStimulus) {
                    val stimulusAdder = rememberStimulusImageAdder(
                        pipeline = imagePipeline,
                        imageScope = ImageScope.TYPE_CQ,
                        images = viewModel.stimulusImages,
                        enabled = !viewModel.saving,
                        onChange = viewModel::changeStimulusImages,
                    )
                    EdCard {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text("উদ্দীপক *", color = MaterialTheme.colorScheme.primary, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                            EdBoardPill(viewModel.stimulusBoards, catalog, !viewModel.saving, viewModel::changeStimulusBoards, viewModel::addBoard)
                            EdIconButton(
                                EdIcon.EYE, "উদ্দীপকের প্রিভিউ", { stimulusPreviewOpen = !stimulusPreviewOpen },
                                enabled = !viewModel.saving, selected = stimulusPreviewOpen,
                            )
                            EdRatingPill(viewModel.stimulusRating, !viewModel.saving, viewModel::changeStimulusRating)
                            EdIconButton(
                                EdIcon.IMAGE_ADD, "উদ্দীপকে ছবি যোগ করুন", { stimulusAdder.pick(null) },
                                enabled = !viewModel.saving && !stimulusAdder.importing, dashed = true,
                            )
                        }
                    }
                    EdTagChips(viewModel.stimulusBoards, catalog, !viewModel.saving, viewModel::changeStimulusBoards)
                    EdTextArea(
                        value = viewModel.stimulus,
                        onValueChange = viewModel::changeStimulus,
                        enabled = !viewModel.saving,
                        placeholder = "উদ্দীপক লিখুন",
                        minHeight = if (viewModel.editorMode == EditorMode.FULL) 150.dp else 88.dp,
                        showMathBar = viewModel.editorMode == EditorMode.FULL,
                        previewTitle = "লাইভ প্রিভিউ (KaTeX)",
                        externalPreviewOpen = stimulusPreviewOpen,
                        showPreviewToggle = false,
                    )
                    EdStimulusImages(
                        pipeline = imagePipeline,
                        imageScope = ImageScope.TYPE_CQ,
                        images = viewModel.stimulusImages,
                        enabled = !viewModel.saving,
                        adder = stimulusAdder,
                        onChange = viewModel::changeStimulusImages,
                    )
                    OutlinedTextField(
                        value = viewModel.referenceText,
                        onValueChange = viewModel::changeReferenceText,
                        label = { Text("রেফারেন্স (ঐচ্ছিক)") },
                        minLines = 1,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    }
                }
                viewModel.editableLabels.forEach { label ->
                    val i = label.sortOrder - 1
                    var questionPreviewOpen by rememberSaveable(label.letter) { mutableStateOf(false) }
                    var answerPreviewOpen by rememberSaveable(label.letter) { mutableStateOf(false) }
                    var solutionPreviewOpen by rememberSaveable(label.letter) { mutableStateOf(false) }
                    val solutionStartAdder = rememberSolutionImageAdder(
                        pipeline = imagePipeline,
                        imageScope = ImageScope.TYPE_CQ,
                        parts = viewModel.solutionPartsByLabel[i],
                        enabled = !viewModel.saving,
                        onChange = { viewModel.changeSolutionImageParts(label, it) },
                        insertAtStart = true,
                    )
                    val solutionEndAdder = rememberSolutionImageAdder(
                        pipeline = imagePipeline,
                        imageScope = ImageScope.TYPE_CQ,
                        parts = viewModel.solutionPartsByLabel[i],
                        enabled = !viewModel.saving,
                        onChange = { viewModel.changeSolutionImageParts(label, it) },
                    )
                    EdCard {
                    // Match the legacy editor's single non-wrapping control row:
                    // label + marks on the left; Board, Preview, Rating and (Full) Delete on the right.
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                            EdLabelChip(label.letter, emptyList(), enabled = false, onPick = {}, compact = viewModel.editorMode == EditorMode.FULL)
                            if (viewModel.editorMode == EditorMode.FULL) {
                                EdMarksField(
                                    index = i,
                                    marks = viewModel.marks[i],
                                    enabled = !viewModel.saving,
                                    onMarks = { viewModel.changeMarks(label, it) },
                                    onValidity = { valid -> if (valid) invalidMarkFields.remove(i) else if (i !in invalidMarkFields) invalidMarkFields.add(i) },
                                )
                            } else {
                                Text("${marksText(viewModel.marks[i])} নম্বর", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                            EdBoardPill(viewModel.boards[i], catalog, !viewModel.saving, { viewModel.changeBoards(label, it) }, viewModel::addBoard)
                            EdIconButton(
                                EdIcon.EYE, "${label.letter}) প্রশ্নের প্রিভিউ", { questionPreviewOpen = !questionPreviewOpen },
                                enabled = !viewModel.saving, selected = questionPreviewOpen,
                            )
                            EdRatingPill(viewModel.ratings[i], !viewModel.saving) { viewModel.changeRating(label, it) }
                            if (viewModel.hasStimulus && viewModel.original?.subQuestions?.any { it.label == label } == true && viewModel.editorMode == EditorMode.FULL) {
                                EdIconButton(
                                    EdIcon.TRASH, "${label.letter}) প্রশ্ন মুছুন", { pendingDeleteLabel = label },
                                    enabled = !viewModel.saving && viewModel.canDeleteQuestion(label),
                                    tintOverride = MaterialTheme.colorScheme.error,
                                )
                            }
                        }
                    }
                    EdTagChips(viewModel.boards[i], catalog, !viewModel.saving) { viewModel.changeBoards(label, it) }
                    // Keep this app-specific question-category selector, but do not split the legacy button row.
                    if (viewModel.editorMode == EditorMode.FULL) {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("প্রশ্নের ধরন", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            EdTypePill(viewModel.questionTypeIds[i], typeLabels, !viewModel.saving) { viewModel.changeQuestionType(label, it) }
                        }
                    }
                    EdTextArea(
                        value = viewModel.texts[i],
                        onValueChange = { viewModel.setText(label, it) },
                        enabled = !viewModel.saving,
                        placeholder = "${label.letter}) প্রশ্ন লিখুন",
                        minHeight = if (viewModel.editorMode == EditorMode.FULL) 112.dp else 88.dp,
                        showMathBar = viewModel.editorMode == EditorMode.FULL,
                        previewTitle = "${label.letter}) প্রশ্নের প্রিভিউ (KaTeX)",
                        externalPreviewOpen = questionPreviewOpen,
                        showPreviewToggle = false,
                    )
                    // The rating and the boards of a block are stored only with its question text.
                    if (viewModel.texts[i].isNotBlank()) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text("${label.letter}) ক্যাটাগরি", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                            TextButton(onClick = onManageCategories, enabled = !viewModel.saving) { Text("ক্যাটাগরি পরিচালনা") }
                        }
                        val selectedCategoryIds = viewModel.categoryIdsByLabel[i]
                        val availableCategories = categories.filter { it.isArchived == 0L || it.categoryId in selectedCategoryIds }
                        if (availableCategories.isEmpty()) {
                            Text("কোনো ক্যাটাগরি নেই। রেফারেন্স থেকে ক্যাটাগরি যোগ করুন।", style = MaterialTheme.typography.bodySmall)
                        }
                        availableCategories.forEach { category ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Checkbox(
                                    checked = category.categoryId in selectedCategoryIds,
                                    enabled = !viewModel.saving && (category.isArchived == 0L || category.categoryId in selectedCategoryIds),
                                    onCheckedChange = { checked -> viewModel.changeCategory(label, category.categoryId, checked) },
                                )
                                Text(if (category.isArchived != 0L) "${category.name} (আর্কাইভড—আগের লিংক রাখা হয়েছে)" else category.name)
                            }
                        }
                    }
                    // Solution is available in both modes; its core controls remain identical.
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("সমাধান", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                            EdIconButton(
                                EdIcon.EYE, "${label.letter}) সমাধানের প্রিভিউ", { solutionPreviewOpen = !solutionPreviewOpen },
                                enabled = !viewModel.saving, selected = solutionPreviewOpen,
                            )
                            EdIconButton(
                                EdIcon.IMAGE_ADD, "${label.letter}) সমাধানের শুরুতে ছবি যোগ করুন", { solutionStartAdder.pick(null) },
                                enabled = !viewModel.saving && !solutionStartAdder.importing, dashed = true,
                            )
                        }
                    }
                    val solutionTextValues = viewModel.solutionTexts[i]
                    val solutionParts = viewModel.solutionPartsByLabel[i].sortedBy { it.position }
                    val needsInitialText = solutionParts.none { it.partType != "IMAGE" }
                    val visibleSolutionParts = if (needsInitialText) solutionParts + QuestionSolutionPart(
                        "edit-solution-first-text-${label.letter}", "TEXT", solutionParts.size.toLong(), textContent = "",
                    ) else solutionParts
                    var solutionTextIndex = 0
                    visibleSolutionParts.forEachIndexed { partOrder, part ->
                        if (part.partType == "IMAGE" && part.imageId != null) {
                            EdThumbnail(
                                pipeline = imagePipeline,
                                imageId = part.imageId,
                                imageScope = ImageScope.TYPE_CQ,
                                enabled = !viewModel.saving && !solutionStartAdder.importing,
                                onReplace = { solutionStartAdder.pick(part.partId) },
                                onRemove = {
                                    viewModel.changeSolutionImageParts(
                                        label,
                                        solutionParts.filterNot { it.partId == part.partId }.mapIndexed { index, row -> row.copy(position = index.toLong()) },
                                    )
                                },
                            ) {
                                TextButton(
                                    onClick = { viewModel.changeSolutionImageParts(label, moveSolutionPart(solutionParts, part.partId, -1)) },
                                    enabled = !viewModel.saving && partOrder > 0,
                                ) { Text("←") }
                                TextButton(
                                    onClick = { viewModel.changeSolutionImageParts(label, moveSolutionPart(solutionParts, part.partId, 1)) },
                                    enabled = !viewModel.saving && partOrder < solutionParts.lastIndex,
                                ) { Text("→") }
                            }
                        } else {
                            val partIndex = solutionTextIndex++
                            EdTextArea(
                                value = solutionTextValues.getOrElse(partIndex) { part.textContent.orEmpty() },
                                onValueChange = { next ->
                                    if (viewModel.solutionTexts[i].isEmpty()) viewModel.addSolutionText(label)
                                    viewModel.changeSolutionText(label, partIndex, next)
                                },
                                enabled = !viewModel.saving,
                                placeholder = "সমাধান ${partIndex + 1} লিখুন",
                                minHeight = if (viewModel.editorMode == EditorMode.FULL) 112.dp else 88.dp,
                                showMathBar = viewModel.editorMode == EditorMode.FULL,
                                previewTitle = "সমাধান ${partIndex + 1} প্রিভিউ (KaTeX)",
                                showPreviewToggle = false,
                            )
                            if (solutionTextValues.size > 1) {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    TextButton(onClick = { viewModel.moveSolutionText(label, partIndex, partIndex - 1) }, enabled = !viewModel.saving && partIndex > 0) { Text("↑") }
                                    TextButton(onClick = { viewModel.moveSolutionText(label, partIndex, partIndex + 1) }, enabled = !viewModel.saving && partIndex < solutionTextValues.lastIndex) { Text("↓") }
                                    TextButton(onClick = { viewModel.removeSolutionText(label, partIndex) }, enabled = !viewModel.saving) { Text("এই অংশ সরান") }
                                }
                            }
                        }
                    }
                    if (solutionPreviewOpen) {
                        EdInlinePreviewCard(
                            title = "${label.letter}) সমাধানের প্রিভিউ (KaTeX)",
                            text = solutionTextValues.filter { it.isNotBlank() }.joinToString("\n\n"),
                        )
                    }
                    if (solutionStartAdder.error.isNotBlank()) Text(solutionStartAdder.error, color = MaterialTheme.colorScheme.error)
                    if (solutionEndAdder.error.isNotBlank()) Text(solutionEndAdder.error, color = MaterialTheme.colorScheme.error)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)) {
                        EdIconButton(
                            EdIcon.IMAGE_ADD, "${label.letter}) সমাধানের শেষে ছবি যোগ করুন", { solutionEndAdder.pick(null) },
                            enabled = !viewModel.saving && !solutionEndAdder.importing, dashed = true,
                        )
                        EdIconButton(
                            EdIcon.PLUS_BOX, "${label.letter}) সমাধানের আরেকটি অংশ যোগ করুন", { viewModel.addSolutionText(label) },
                            enabled = !viewModel.saving, dashed = true,
                        )
                    }

                    // The short-answer field is a Full Editor extra and follows the solution.
                    if (viewModel.editorMode == EditorMode.FULL) {
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("সংক্ষিপ্ত উত্তর (ঐচ্ছিক)", style = MaterialTheme.typography.labelLarge)
                            EdIconButton(
                                EdIcon.EYE, "${label.letter}) সংক্ষিপ্ত উত্তরের প্রিভিউ", { answerPreviewOpen = !answerPreviewOpen },
                                enabled = !viewModel.saving, selected = answerPreviewOpen,
                            )
                        }
                        EdTextArea(
                            value = viewModel.answers[i],
                            onValueChange = { viewModel.setAnswer(label, it) },
                            enabled = !viewModel.saving,
                            minHeight = 76.dp,
                            placeholder = "সংক্ষিপ্ত উত্তর (ঐচ্ছিক)",
                            showMathBar = true,
                            previewTitle = "${label.letter}) সংক্ষিপ্ত উত্তরের প্রিভিউ (KaTeX)",
                            externalPreviewOpen = answerPreviewOpen,
                            showPreviewToggle = false,
                        )
                        if (answerPreviewOpen) {
                            EdInlinePreviewCard(
                                title = "${label.letter}) সংক্ষিপ্ত উত্তরের প্রিভিউ (KaTeX)",
                                text = viewModel.answers[i],
                            )
                        }
                    }
                    }
                }

                editResultText(viewModel.result)?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}
