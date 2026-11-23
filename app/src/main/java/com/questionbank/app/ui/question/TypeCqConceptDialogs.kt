package com.questionbank.app.ui.question

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.questionbank.app.domain.question.ConceptContentPart
import com.questionbank.app.domain.question.QuestionConceptSummary
import com.questionbank.app.media.ImagePipeline
import com.questionbank.app.media.ImageScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.util.UUID

@Composable
internal fun TypeCqConceptEditorDialog(
    questionId: String,
    questionText: String,
    viewModel: QuestionListViewModel,
    imagePipeline: ImagePipeline,
    onDismiss: () -> Unit,
) {
    var initialParts by remember(questionId) { mutableStateOf<List<ConceptContentPart>?>(null) }
    var loadError by remember(questionId) { mutableStateOf("") }
    LaunchedEffect(questionId) {
        try {
            initialParts = viewModel.observeConcept(questionId).first()?.parts.orEmpty().sortedBy { it.position }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            loadError = failure.message ?: "Concept লোড করা যায়নি।"
            initialParts = emptyList()
        }
    }
    val loaded = initialParts
    if (loaded == null) {
        ConceptLoadingWindow(questionText = questionText, error = loadError, onDismiss = onDismiss)
    } else {
        TypeCqConceptComposerWindow(
            questionText = questionText,
            initialParts = loaded,
            imagePipeline = imagePipeline,
            onDismiss = onDismiss,
            onSave = { updated -> viewModel.persistConcept(questionId, updated) },
        )
    }
}

/** Full-screen Concept preview/editor shared by create and edit flows. */
@Composable
internal fun TypeCqConceptComposerWindow(
    questionText: String,
    initialParts: List<ConceptContentPart>,
    imagePipeline: ImagePipeline,
    onDismiss: () -> Unit,
    onSave: suspend (List<ConceptContentPart>) -> Boolean,
    title: String = "Concept",
    /** Keep accepted images alive when the parent editor only stages them in a recoverable draft. */
    deferAcceptedImagesToParentDraft: Boolean = false,
) {
    val scope = rememberCoroutineScope()
    var parts by remember(initialParts) { mutableStateOf(initialParts.sortedBy { it.position }) }
    var originalParts by remember(initialParts) { mutableStateOf(initialParts.sortedBy { it.position }) }
    var importedImageIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var showDiscardConfirmation by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var importing by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var mode by remember { mutableStateOf(EditorMode.MINIMUM) }

    suspend fun cleanupImportedImages() {
        importedImageIds.forEach { imageId ->
            runCatching { imagePipeline.deleteImage(imageId, ImageScope.TYPE_CQ) }
        }
        importedImageIds = emptySet()
    }

    fun requestDismiss() {
        if (saving || importing) return
        if (parts == originalParts) {
            scope.launch { cleanupImportedImages(); onDismiss() }
        } else showDiscardConfirmation = true
    }

    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null && !importing && !saving && editing) {
            scope.launch {
                importing = true
                error = ""
                try {
                    val id = imagePipeline.importImage(uri, ImageScope.TYPE_CQ)
                    importedImageIds = importedImageIds + id
                    parts = (parts + ConceptContentPart(UUID.randomUUID().toString(), "IMAGE", parts.size.toLong(), imageId = id))
                        .mapIndexed { index, part -> part.copy(position = index.toLong()) }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    error = failure.message ?: "ছবি যোগ করা যায়নি।"
                } finally {
                    importing = false
                }
            }
        }
    }

    if (showDiscardConfirmation) AlertDialog(
        onDismissRequest = { showDiscardConfirmation = false },
        title = { Text("পরিবর্তন বাতিল করবেন?") },
        text = { Text("Concept-এ সংরক্ষণ না করা পরিবর্তন রয়েছে। বন্ধ করলে সেগুলো বাতিল হবে।") },
        confirmButton = {
            TextButton(onClick = {
                showDiscardConfirmation = false
                scope.launch { cleanupImportedImages(); onDismiss() }
            }) { Text("পরিবর্তন বাতিল করুন") }
        },
        dismissButton = { TextButton(onClick = { showDiscardConfirmation = false }) { Text("সম্পাদনা চালিয়ে যান") } },
    )

    Dialog(onDismissRequest = { requestDismiss() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            shape = RectangleShape,
            color = MaterialTheme.colorScheme.surface,
        ) {
            Column(
                Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        Text(questionText, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                    TextButton(enabled = !saving && !importing, onClick = { requestDismiss() }) { Text("বন্ধ") }
                }
                if (!editing) {
                    if (parts.isEmpty()) {
                        Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Text("এখনো কোনো Concept যোগ করা হয়নি।", color = MaterialTheme.colorScheme.onSurfaceVariant)
                                OutlinedButton(onClick = { editing = true }) { Text("＋ Concept যোগ করুন") }
                            }
                        }
                    } else {
                        LazyColumn(
                            modifier = Modifier.weight(1f).fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            itemsIndexed(parts, key = { _, part -> part.partId }) { index, part ->
                                if (part.partType == "IMAGE") {
                                    part.imageId?.let { MediaFullImage(imagePipeline, it, ImageScope.TYPE_CQ) }
                                        ?: Text("ছবিটি পাওয়া যায়নি।", color = MaterialTheme.colorScheme.error)
                                } else if (!part.textContent.isNullOrBlank()) {
                                    RichLatexText(part.textContent, Modifier.fillMaxWidth())
                                }
                            }
                        }
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                            OutlinedButton(onClick = { editing = true }) { Text("Edit") }
                        }
                    }
                } else {
                    EditorModeTabs(mode = mode, enabled = !saving && !importing, onChange = { mode = it })
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        EdIconButton(
                            EdIcon.PLUS_BOX, "লেখা যোগ করুন",
                            onClick = {
                                parts = (parts + ConceptContentPart(UUID.randomUUID().toString(), "TEXT", parts.size.toLong(), textContent = ""))
                                    .mapIndexed { index, part -> part.copy(position = index.toLong()) }
                            },
                            enabled = !saving && !importing,
                            dashed = true,
                        )
                        EdIconButton(
                            EdIcon.IMAGE_ADD, "ছবি যোগ করুন",
                            onClick = { imagePicker.launch(arrayOf("image/*")) },
                            enabled = !saving && !importing,
                            dashed = true,
                        )
                        Spacer(Modifier.weight(1f))
                        if (importing) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                    }
                    if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    HorizontalDivider()
                    if (parts.isEmpty()) {
                        Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                            Text("Concept-এর লেখা বা ছবি যোগ করুন।", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    } else {
                        LazyColumn(
                            modifier = Modifier.weight(1f).fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            itemsIndexed(parts, key = { _, part -> part.partId }) { index, part ->
                                Surface(
                                    modifier = Modifier.fillMaxWidth(),
                                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.42f),
                                    shape = RoundedCornerShape(12.dp),
                                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                                ) {
                                    Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Text(if (part.partType == "IMAGE") "ছবি ${index + 1}" else "লেখা ${index + 1}", fontWeight = FontWeight.SemiBold)
                                            Spacer(Modifier.weight(1f))
                                            TextButton(enabled = !saving && index > 0, onClick = {
                                                val next = parts.toMutableList().apply { add(index - 1, removeAt(index)) }
                                                parts = next.mapIndexed { i, value -> value.copy(position = i.toLong()) }
                                            }) { Text("↑") }
                                            TextButton(enabled = !saving && index < parts.lastIndex, onClick = {
                                                val next = parts.toMutableList().apply { add(index + 1, removeAt(index)) }
                                                parts = next.mapIndexed { i, value -> value.copy(position = i.toLong()) }
                                            }) { Text("↓") }
                                            TextButton(enabled = !saving, onClick = {
                                                parts = parts.filterNot { it.partId == part.partId }
                                                    .mapIndexed { i, value -> value.copy(position = i.toLong()) }
                                            }) { Text("সরান", color = MaterialTheme.colorScheme.error) }
                                        }
                                        if (part.partType == "IMAGE") {
                                            part.imageId?.let { MediaFullImage(imagePipeline, it, ImageScope.TYPE_CQ) }
                                                ?: Text("ছবিটি পাওয়া যায়নি।", color = MaterialTheme.colorScheme.error)
                                        } else {
                                            EdTextArea(
                                                value = part.textContent.orEmpty(),
                                                onValueChange = { updated -> parts = parts.map { if (it.partId == part.partId) it.copy(textContent = updated) else it } },
                                                enabled = !saving,
                                                minHeight = if (mode == EditorMode.FULL) 170.dp else 112.dp,
                                                placeholder = "Concept লিখুন… LaTeX-ও ব্যবহার করতে পারবেন",
                                                showMathBar = mode == EditorMode.FULL,
                                                showPreviewToggle = true,
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                    HorizontalDivider()
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
                        TextButton(enabled = !saving && !importing, onClick = {
                            if (originalParts.isNotEmpty()) {
                                parts = originalParts
                                scope.launch { cleanupImportedImages() }
                                editing = false
                            } else requestDismiss()
                        }) { Text("বাতিল") }
                        OutlinedButton(enabled = !saving && !importing, onClick = {
                            scope.launch {
                                saving = true
                                error = ""
                                val normalized = parts.mapIndexed { index, part -> part.copy(position = index.toLong()) }
                                try {
                                    if (onSave(normalized)) {
                                        originalParts = normalized
                                        parts = normalized
                                        if (deferAcceptedImagesToParentDraft) {
                                            val acceptedImageIds = normalized.filter { it.partType == "IMAGE" }.mapNotNull { it.imageId }.toSet()
                                            (importedImageIds - acceptedImageIds).forEach { imageId ->
                                                runCatching { imagePipeline.deleteImage(imageId, ImageScope.TYPE_CQ) }
                                            }
                                            // The parent draft now owns these accepted image IDs. Do not delete them on window close.
                                            importedImageIds = emptySet()
                                        } else {
                                            // For an existing DB question, the reference count protects accepted images;
                                            // unused images imported in this editing session are collected here.
                                            cleanupImportedImages()
                                        }
                                        editing = false
                                    } else error = "Concept সংরক্ষণ করা যায়নি। ছবির তথ্য বা প্রশ্নটি আবার যাচাই করুন।"
                                } catch (cancelled: CancellationException) {
                                    throw cancelled
                                } catch (failure: Exception) {
                                    error = failure.message ?: "Concept সংরক্ষণ করা যায়নি।"
                                } finally {
                                    saving = false
                                }
                            }
                        }) {
                            if (saving) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                            else Text("সংরক্ষণ করুন")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ConceptLoadingWindow(questionText: String, error: String, onDismiss: () -> Unit) {
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize(), shape = RectangleShape, color = MaterialTheme.colorScheme.surface) {
            Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                if (error.isBlank()) CircularProgressIndicator() else Text(error, color = MaterialTheme.colorScheme.error)
                Text(questionText, style = MaterialTheme.typography.bodySmall, maxLines = 2)
                TextButton(onClick = onDismiss) { Text("বন্ধ") }
            }
        }
    }
}

@Composable
internal fun TypeCqConceptQuestionPickerDialog(
    questions: List<com.questionbank.app.domain.question.SavedSubQuestion>,
    onSelect: (com.questionbank.app.domain.question.SavedSubQuestion) -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("কোন প্রশ্নের Concept?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                questions.forEach { question ->
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    ) {
                        TextButton(
                            onClick = { onSelect(question) },
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 7.dp),
                        ) {
                            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text("${question.label?.letter ?: "প্রশ্ন"} · ${if (question.conceptParts.isEmpty()) "Concept যোগ করুন" else "Concept সম্পাদনা করুন"}", fontWeight = FontWeight.Bold)
                                Text(question.text, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("বন্ধ") } },
    )
}

@Composable
internal fun TypeCqConceptSummaryDialog(
    concepts: List<QuestionConceptSummary>,
    onOpen: (String, String) -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("এই Type-এর সব Concept (${concepts.size})") },
        text = {
            if (concepts.isEmpty()) {
                Text("এই Type-এ এখনো কোনো Concept সংরক্ষিত নেই।")
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxWidth().heightIn(max = 480.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    itemsIndexed(concepts, key = { _, item -> item.questionId }) { _, concept ->
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                        ) {
                            Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                                Text(concept.label, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                                Text(concept.questionText, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall)
                                if (concept.previewText.isNotBlank()) RichLatexText(concept.previewText, Modifier.fillMaxWidth())
                                TextButton(onClick = { onOpen(concept.questionId, concept.questionText) }) { Text("Concept খুলুন") }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("বন্ধ") } },
    )
}
