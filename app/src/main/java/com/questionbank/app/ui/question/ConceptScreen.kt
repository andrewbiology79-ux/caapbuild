package com.questionbank.app.ui.question

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.questionbank.app.data.local.dao.TypeCqConceptDao
import com.questionbank.app.data.local.dao.TypeCqConceptWithParts
import com.questionbank.app.data.local.entity.TypeCqConceptPartsEntity
import com.questionbank.app.domain.question.QuestionGroupKey
import com.questionbank.app.media.ImagePipeline
import com.questionbank.app.media.ImageScope
import com.questionbank.app.ui.format.toBengali
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.UUID

private data class ConceptBlockDraft(val id: String, val type: String, val text: String = "", val imageId: String? = null)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConceptScreen(
    topicId: String,
    groupKey: String,
    cardNumber: Int,
    dao: TypeCqConceptDao,
    imagePipeline: ImagePipeline,
    onBack: () -> Unit,
) {
    val owner = remember(groupKey) { QuestionGroupKey.parse(groupKey) }
    val stimulusId = (owner as? QuestionGroupKey.Parsed.Stimulus)?.id
    val questionId = (owner as? QuestionGroupKey.Parsed.Single)?.id
    var concept by remember(groupKey) { mutableStateOf<TypeCqConceptWithParts?>(null) }
    var loaded by remember(groupKey) { mutableStateOf(false) }
    var loadError by remember(groupKey) { mutableStateOf("") }
    var editing by remember { mutableStateOf(false) }
    var dirty by remember { mutableStateOf(false) }
    var showLeaveWarning by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    val blocks = remember { mutableStateListOf<ConceptBlockDraft>() }
    // Image files imported while editing are not linked to concept_parts until Save succeeds.
    // Keep their IDs so cancellation can safely remove only the unreferenced temporary imports.
    val importedImageIds = remember { linkedSetOf<String>() }
    val scope = rememberCoroutineScope()
    var pendingImageIndex by remember { mutableStateOf<Int?>(null) }
    var editingImageId by remember { mutableStateOf<String?>(null) }

    // Do not treat the initial null Compose state as a completed empty DB result.
    // The first Flow emission is the authoritative loaded state (existing concept or truly empty).
    LaunchedEffect(stimulusId, questionId) {
        loaded = false
        loadError = ""
        dao.observeForCard(stimulusId, questionId)
            .catch { failure -> loadError = failure.message ?: "কনসেপ্ট লোড করা যায়নি" }
            .collect { value ->
                concept = value
                if (!loaded) {
                    blocks.clear()
                    value?.parts.orEmpty().sortedBy { it.position }.forEach { part ->
                        blocks += ConceptBlockDraft(part.partId, part.partType, part.textContent.orEmpty(), part.imageId)
                    }
                    loaded = true
                } else if (!editing && !dirty) {
                    blocks.clear()
                    value?.parts.orEmpty().sortedBy { it.position }.forEach { part ->
                        blocks += ConceptBlockDraft(part.partId, part.partType, part.textContent.orEmpty(), part.imageId)
                    }
                }
            }
    }

    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        val at = pendingImageIndex
        pendingImageIndex = null
        if (uri != null && at != null) {
            scope.launch {
                try {
                    val imageId = imagePipeline.importImage(uri, ImageScope.TYPE_CQ)
                    importedImageIds += imageId
                    val newBlock = ConceptBlockDraft(UUID.randomUUID().toString(), "IMAGE", imageId = imageId)
                    blocks.add(at.coerceIn(0, blocks.size), newBlock)
                    editingImageId = imageId
                    dirty = true
                } catch (cancelled: CancellationException) { throw cancelled }
                catch (failure: Exception) { error = failure.message ?: "ছবি যোগ করা যায়নি" }
            }
        }
    }

    fun saveConcept() {
        if (!loaded || saving || loadError.isNotBlank()) return
        scope.launch {
            saving = true
            error = ""
            try {
                val rows = blocks.filter { it.type != "TEXT" || it.text.isNotBlank() }.mapIndexed { index, block ->
                    TypeCqConceptPartsEntity(
                        partId = block.id,
                        conceptId = "",
                        position = index.toLong(),
                        partType = block.type,
                        textContent = if (block.type == "TEXT") block.text.trim() else null,
                        imageId = if (block.type == "IMAGE") block.imageId else null,
                        createdAt = System.currentTimeMillis(),
                    )
                }
                val activeImageIds = rows.mapNotNull { it.imageId }.toSet()
                val previousImageIds = concept?.parts.orEmpty().mapNotNull { it.imageId }.toSet()
                val ok = dao.saveForCard(topicId, stimulusId, questionId, rows, System.currentTimeMillis())
                if (ok) {
                    // The reference-count guard also protects an image shared by another card or concept.
                    (previousImageIds - activeImageIds + (importedImageIds - activeImageIds)).forEach { id ->
                        try {
                            imagePipeline.deleteImage(id, ImageScope.TYPE_CQ)
                        } catch (cancelled: CancellationException) {
                            throw cancelled
                        } catch (_: Exception) {
                            // The DB reference is already safe; an orphan cleanup can be retried later.
                        }
                    }
                    importedImageIds.clear()
                    dirty = false
                    editing = false
                    loaded = false
                } else error = "কনসেপ্ট সংরক্ষণ করা যায়নি।"
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                error = failure.message ?: "কনসেপ্ট সংরক্ষণ করা যায়নি।"
            } finally {
                saving = false
            }
        }
    }

    fun leaveWithoutSaving() {
        showLeaveWarning = false
        val cleanupIds = importedImageIds.toList()
        importedImageIds.clear()
        scope.launch {
            cleanupIds.forEach { id ->
                try {
                    imagePipeline.deleteImage(id, ImageScope.TYPE_CQ)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    // Keep the normal orphan collector as a second safety net.
                }
            }
            onBack()
        }
    }

    fun requestBack() {
        if (editing && dirty) showLeaveWarning = true else onBack()
    }
    BackHandler { requestBack() }

    editingImageId?.let { imageId ->
        ImageEditDialog(
            pipeline = imagePipeline,
            imageId = imageId,
            imageScope = ImageScope.TYPE_CQ,
            onDismiss = { editingImageId = null },
            onSaved = { editedId ->
                val index = blocks.indexOfFirst { it.imageId == imageId }
                if (index >= 0) blocks[index] = blocks[index].copy(imageId = editedId)
                importedImageIds += editedId
                dirty = true
                editingImageId = null
            },
        )
    }

    if (showLeaveWarning) AlertDialog(
        onDismissRequest = { showLeaveWarning = false },
        title = { Text("পরিবর্তন সংরক্ষণ হয়নি") },
        text = { Text("সংরক্ষণ না করে ফিরলে এই কনসেপ্টের পরিবর্তন হারিয়ে যাবে।") },
        confirmButton = { TextButton(onClick = ::leaveWithoutSaving) { Text("তবুও ফিরুন") } },
        dismissButton = { TextButton(onClick = { showLeaveWarning = false }) { Text("এখানেই থাকুন") } },
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("কনসেপ্ট · প্রশ্ন ${cardNumber.toBengali()}") },
                navigationIcon = { IconButton(onClick = ::requestBack) { Icon(Icons.Default.ArrowBack, contentDescription = "পিছনে") } },
                actions = {
                    if (loaded && loadError.isBlank() && concept != null && !editing) IconButton(onClick = { editing = true }) { Icon(Icons.Default.Edit, contentDescription = "এডিট") }
                    if (editing) IconButton(enabled = loaded && !saving && loadError.isBlank(), onClick = ::saveConcept) { Icon(Icons.Default.Save, contentDescription = "সংরক্ষণ") }
                },
            )
        },
    ) { padding ->
        when {
            !loaded -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                if (loadError.isNotBlank()) Text(loadError, color = MaterialTheme.colorScheme.error) else CircularProgressIndicator()
            }
            concept == null && !editing -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Button(enabled = loaded && loadError.isBlank(), onClick = { editing = true }, shape = RoundedCornerShape(14.dp), contentPadding = PaddingValues(horizontal = 28.dp, vertical = 18.dp)) {
                    Icon(Icons.Default.Add, contentDescription = null); Spacer(Modifier.size(8.dp)); Text("কনসেপ্ট যোগ করুন")
                }
            }
            !editing -> LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                itemsIndexed(concept?.parts.orEmpty().sortedBy { it.position }, key = { _, part -> part.partId }) { _, part ->
                    when (part.partType) {
                        "TEXT" -> if (!part.textContent.isNullOrBlank()) RichLatexText(part.textContent, Modifier.fillMaxWidth())
                        "IMAGE" -> part.imageId?.let { MediaThumbnail(imagePipeline, it, ImageScope.TYPE_CQ, Modifier.fillMaxWidth().height(190.dp), androidx.compose.ui.layout.ContentScale.Fit) }
                    }
                }
            }
            else -> Column(Modifier.fillMaxSize().padding(padding).padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error)
                LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    itemsIndexed(blocks, key = { _, block -> block.id }) { index, block ->
                        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                            Column(Modifier.fillMaxWidth().padding(9.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(if (block.type == "TEXT") "লেখার ঘর" else "ছবির ঘর", style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f))
                                    if (block.type == "IMAGE" && block.imageId != null) {
                                        IconButton(onClick = { editingImageId = block.imageId }) { Icon(Icons.Default.Edit, contentDescription = "ছবি সম্পাদনা") }
                                    }
                                    IconButton(onClick = { blocks.removeAt(index); dirty = true }) { Icon(Icons.Default.Delete, contentDescription = "ব্লক মুছুন") }
                                }
                                if (block.type == "TEXT") {
                                    OutlinedTextField(
                                        value = block.text,
                                        onValueChange = { value -> blocks[index] = block.copy(text = value); dirty = true },
                                        modifier = Modifier.fillMaxWidth(), minLines = 3, label = { Text("কনসেপ্টের লেখা") },
                                    )
                                    if (block.text.isNotBlank()) RichLatexText(block.text, Modifier.fillMaxWidth())
                                } else {
                                    block.imageId?.let { MediaThumbnail(imagePipeline, it, ImageScope.TYPE_CQ, Modifier.fillMaxWidth().height(160.dp), androidx.compose.ui.layout.ContentScale.Fit) }
                                }
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    TextButton(onClick = { blocks.add(index + 1, ConceptBlockDraft(UUID.randomUUID().toString(), "TEXT")); dirty = true }) { Text("＋ লেখার ঘর") }
                                    TextButton(onClick = { pendingImageIndex = index + 1; imagePicker.launch(arrayOf("image/*")) }) { Icon(Icons.Default.Image, null); Text("＋ ছবি") }
                                    TextButton(enabled = index > 0, onClick = { val b = blocks.removeAt(index); blocks.add(index - 1, b); dirty = true }) { Text("↑") }
                                    TextButton(enabled = index < blocks.lastIndex, onClick = { val b = blocks.removeAt(index); blocks.add(index + 1, b); dirty = true }) { Text("↓") }
                                }
                            }
                        }
                    }
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = { blocks += ConceptBlockDraft(UUID.randomUUID().toString(), "TEXT"); dirty = true }) { Text("＋ লেখা") }
                            Button(onClick = { pendingImageIndex = blocks.size; imagePicker.launch(arrayOf("image/*")) }) { Text("＋ ছবি") }
                        }
                    }
                }
                Button(onClick = ::saveConcept, modifier = Modifier.fillMaxWidth(), enabled = loaded && !saving && loadError.isBlank()) {
                    if (saving) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Text("সংরক্ষণ")
                }
                Spacer(Modifier.height(4.dp))
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConceptListScreen(
    topicId: String,
    dao: TypeCqConceptDao,
    imagePipeline: ImagePipeline,
    onOpen: (String, Int) -> Unit,
    onBack: () -> Unit,
) {
    val concepts by dao.observeTopicConcepts(topicId).collectAsState(initial = emptyList())
    Scaffold(topBar = { TopAppBar(title = { Text("সব কনসেপ্ট") }, navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) } }) }) { padding ->
        if (concepts.isEmpty()) Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
            Text("এই টাইপে এখনো কোনো কনসেপ্ট নেই")
        } else LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            itemsIndexed(concepts, key = { _, it -> it.concept.conceptId }) { index, item ->
                val ownerKey = item.concept.stimulusId?.let { "s-$it" } ?: item.concept.questionId?.let { "q-$it" }.orEmpty()
                Card(Modifier.fillMaxWidth().clickable { onOpen(ownerKey, item.cardNumber) }, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                        Text("প্রশ্ন ${item.cardNumber.toBengali()}", style = MaterialTheme.typography.titleSmall)
                        item.parts.sortedBy { it.position }.take(3).forEach { part ->
                            if (part.partType == "TEXT") part.textContent?.let { RichLatexText(it, Modifier.fillMaxWidth()) }
                            else part.imageId?.let { MediaThumbnail(imagePipeline, it, ImageScope.TYPE_CQ) }
                        }
                        Text("খুলুন ›", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }
    }
}
