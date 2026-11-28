package com.questionbank.app.ui.paper

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.produceState
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.questionbank.app.data.local.dao.PaperSourceRowDb
import com.questionbank.app.data.repository.PaperSnapshotCodec
import com.questionbank.app.domain.repository.PaperRepository
import com.questionbank.app.ui.components.AppHeader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.withContext
import android.graphics.BitmapFactory
import java.io.File
import com.questionbank.app.data.local.entity.PaperImagesEntity
import com.questionbank.app.data.local.entity.PaperItemOverridesEntity
import org.json.JSONObject
import kotlinx.coroutines.launch

@Composable
fun PaperBuilderScreen(repository: PaperRepository) {
    val scope = rememberCoroutineScope()
    val categories by repository.observeCategories().collectAsState(initial = emptyList())
    var selectedCategoryId by rememberSaveable { mutableStateOf(PaperRepository.DEFAULT_CATEGORY_ID) }
    val selectedCategory = categories.firstOrNull { it.paperCategoryId == selectedCategoryId }
    val categoryId = selectedCategory?.paperCategoryId
        ?: categories.firstOrNull { it.paperCategoryId == PaperRepository.DEFAULT_CATEGORY_ID }?.paperCategoryId
        ?: categories.firstOrNull()?.paperCategoryId ?: PaperRepository.DEFAULT_CATEGORY_ID
    val papersFlow = remember(categoryId) { repository.observePapers(categoryId) }
    val papers by papersFlow.collectAsState(initial = emptyList())

    var selectedPaperId by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedScope by rememberSaveable { mutableStateOf("ALL") }
    var titleInput by rememberSaveable { mutableStateOf("") }
    var sectionInput by rememberSaveable { mutableStateOf("") }
    var sourceQuery by rememberSaveable { mutableStateOf("") }
    var paperTitle by rememberSaveable { mutableStateOf("") }
    var subjectLine by rememberSaveable { mutableStateOf("") }
    var duration by rememberSaveable { mutableStateOf("") }
    var note by rememberSaveable { mutableStateOf("") }
    var totalMarksInput by rememberSaveable { mutableStateOf("") }
    var activeSectionId by rememberSaveable { mutableStateOf<String?>(null) }
    var status by remember { mutableStateOf<String?>(null) }
    var previewVisible by remember { mutableStateOf(false) }
    var previewText by remember { mutableStateOf("") }
    var sourceRows by remember { mutableStateOf<List<PaperSourceRowDb>>(emptyList()) }
    var sourceCursor by remember { mutableStateOf<PaperSourceRowDb?>(null) }
    var sourceHasMore by remember { mutableStateOf(false) }
    var sourceLoading by remember { mutableStateOf(false) }
    var categoryDialogVisible by remember { mutableStateOf(false) }
    var categoryRenameVisible by remember { mutableStateOf(false) }
    var categoryDeleteConfirm by remember { mutableStateOf(false) }
    var categoryInput by rememberSaveable { mutableStateOf("") }
    var categoryRenameInput by rememberSaveable { mutableStateOf("") }
    var overrideItemId by rememberSaveable { mutableStateOf<String?>(null) }
    var overrideQuestion by rememberSaveable { mutableStateOf("") }
    var overrideStimulus by rememberSaveable { mutableStateOf("") }
    var overrideAnswer by rememberSaveable { mutableStateOf("") }
    var overrideSolutionJson by rememberSaveable { mutableStateOf("") }
    var deletePaperConfirm by remember { mutableStateOf(false) }
    var pendingPdfPaperId by rememberSaveable { mutableStateOf<String?>(null) }
    val context = LocalContext.current
    val pdfLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/pdf")) { uri ->
        val paperId = pendingPdfPaperId
        if (uri != null && paperId != null) {
            scope.launch {
                runCatching { PaperPdfExporter.export(context, uri, repository, paperId) }
                    .onSuccess { status = "PDF তৈরি হয়েছে" }
                    .onFailure { status = "PDF তৈরি করা যায়নি: ${it.message}" }
            }
        }
        pendingPdfPaperId = null
    }

    val sectionsFlow = remember(selectedPaperId) {
        selectedPaperId?.let { repository.observeSections(it) } ?: flowOf(emptyList())
    }
    val itemsFlow = remember(selectedPaperId) {
        selectedPaperId?.let { repository.observeItems(it) } ?: flowOf(emptyList())
    }
    val sections by sectionsFlow.collectAsState(initial = emptyList())
    val items by itemsFlow.collectAsState(initial = emptyList())
    val selectedPaper = papers.firstOrNull { it.paperId == selectedPaperId }
    val calculatedMarks = items.sumOf { it.marksOverride ?: PaperSnapshotCodec.marks(it.snapshotJson) }

    LaunchedEffect(categories) {
        if (categories.isNotEmpty() && categories.none { it.paperCategoryId == selectedCategoryId }) {
            selectedCategoryId = categories.firstOrNull { it.paperCategoryId == PaperRepository.DEFAULT_CATEGORY_ID }?.paperCategoryId
                ?: categories.first().paperCategoryId
        }
    }

    LaunchedEffect(selectedScope, sourceQuery) {
        sourceLoading = true
        sourceCursor = null
        sourceRows = emptyList()
        try {
            val page = repository.loadSourcePage(selectedScope, sourceQuery, 40, null)
            sourceRows = page.take(40)
            sourceHasMore = page.size > 40
            sourceCursor = sourceRows.lastOrNull()
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            status = "প্রশ্নের তালিকা লোড করা যায়নি: ${error.message}"
        } finally {
            sourceLoading = false
        }
    }

    LaunchedEffect(papers) {
        if (selectedPaperId != null && papers.none { it.paperId == selectedPaperId }) selectedPaperId = null
    }
    LaunchedEffect(selectedPaper) {
        selectedPaper?.let { paper ->
            paperTitle = paper.title
            subjectLine = paper.subjectLine
            duration = paper.durationText
            note = paper.noteText
            totalMarksInput = paper.totalMarks?.toString().orEmpty()
        }
    }
    LaunchedEffect(sections, selectedPaperId) {
        if (activeSectionId == null || sections.none { it.sectionId == activeSectionId }) {
            activeSectionId = sections.firstOrNull()?.sectionId
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        AppHeader(title = "প্রশ্নপত্র তৈরি", subtitle = "Type_CQ ও Chapter_CQ থেকে snapshot প্রশ্নপত্র")
        Column(
            modifier = Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("নতুন প্রশ্নপত্র", style = MaterialTheme.typography.titleMedium)
                    OutlinedTextField(
                        value = titleInput, onValueChange = { titleInput = it },
                        label = { Text("প্রশ্নপত্রের নাম") }, modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                    Button(
                        enabled = titleInput.isNotBlank() && categories.isNotEmpty(),
                        onClick = {
                            scope.launch {
                                runCatching { repository.createPaper(titleInput, categoryId) }
                                    .onSuccess { id -> selectedPaperId = id; titleInput = ""; status = "প্রশ্নপত্র তৈরি হয়েছে" }
                                    .onFailure { status = "তৈরি করা যায়নি: ${it.message}" }
                            }
                        },
                    ) { Text("প্রশ্নপত্র তৈরি করুন") }
                }
            }

            Card(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("প্রশ্নপত্রের Library / Category", style = MaterialTheme.typography.titleMedium)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        categories.forEach { category ->
                            FilterChip(
                                selected = category.paperCategoryId == categoryId,
                                onClick = { selectedCategoryId = category.paperCategoryId; selectedPaperId = null },
                                label = { Text(category.name) },
                            )
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { categoryDialogVisible = true }) { Text("নতুন Category") }
                        if (selectedCategory != null && selectedCategory.isSystem == 0L) {
                            TextButton(onClick = { categoryRenameInput = selectedCategory.name; categoryRenameVisible = true }) { Text("নাম বদল") }
                            TextButton(onClick = { categoryDeleteConfirm = true }) { Text("খালি Category মুছুন") }
                        }
                    }
                }
            }

            if (papers.isNotEmpty()) {
                Text("সংরক্ষিত প্রশ্নপত্র", style = MaterialTheme.typography.titleMedium)
                papers.forEach { paper ->
                    FilterChip(
                        selected = selectedPaperId == paper.paperId,
                        onClick = { selectedPaperId = paper.paperId; activeSectionId = null },
                        label = { Text(paper.title) },
                        modifier = Modifier.semantics { contentDescription = "প্রশ্নপত্র ${paper.title} নির্বাচন" },
                    )
                }
            }

            if (selectedPaper != null) {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("প্রশ্ন: ${items.size}  ·  মোট নম্বর: ${"%.2f".format(calculatedMarks)}")
                        OutlinedTextField(paperTitle, { paperTitle = it }, label = { Text("প্রশ্নপত্রের নাম") }, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(subjectLine, { subjectLine = it }, label = { Text("বিষয় / পরীক্ষার বিবরণ") }, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(duration, { duration = it }, label = { Text("সময়") }, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(totalMarksInput, { totalMarksInput = it.filter { c -> c.isDigit() || c == '.' } }, label = { Text("ঘোষিত মোট নম্বর (ঐচ্ছিক)") }, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(note, { note = it }, label = { Text("নোট") }, modifier = Modifier.fillMaxWidth())
                        Button(onClick = {
                            scope.launch {
                                val total = totalMarksInput.toDoubleOrNull()
                                val titleSaved = repository.renamePaper(selectedPaper.paperId, paperTitle)
                                val metadataSaved = repository.updatePaperMetadata(selectedPaper.paperId, subjectLine, duration, note, total)
                                status = if (titleSaved && metadataSaved) "প্রশ্নপত্রের তথ্য সংরক্ষিত হয়েছে" else "তথ্য সংরক্ষণ করা যায়নি; শিরোনাম ও মোট নম্বর যাচাই করুন"
                            }
                        }) { Text("প্রশ্নপত্রের তথ্য সংরক্ষণ") }
                        TextButton(onClick = { deletePaperConfirm = true }) { Text("এই প্রশ্নপত্র মুছুন") }
                    }
                }

                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("অংশ (Sections)", style = MaterialTheme.typography.titleMedium)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                value = sectionInput, onValueChange = { sectionInput = it },
                                label = { Text("নতুন অংশের নাম") }, modifier = Modifier.weight(1f), singleLine = true,
                            )
                            Button(onClick = {
                                scope.launch {
                                    runCatching { repository.addSection(selectedPaper.paperId, sectionInput) }
                                        .onSuccess { activeSectionId = it; sectionInput = ""; status = "অংশ যোগ হয়েছে" }
                                        .onFailure { status = "অংশ যোগ করা যায়নি: ${it.message}" }
                                }
                            }) { Text("যোগ") }
                        }
                        sections.forEachIndexed { index, section ->
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                FilterChip(
                                    selected = section.sectionId == activeSectionId,
                                    onClick = { activeSectionId = section.sectionId },
                                    label = { Text(section.title) },
                                    modifier = Modifier.weight(1f),
                                )
                                TextButton(enabled = index > 0, onClick = {
                                    scope.launch { repository.moveSection(selectedPaper.paperId, section.sectionId, -1) }
                                }) { Text("↑") }
                                TextButton(enabled = index < sections.lastIndex, onClick = {
                                    scope.launch { repository.moveSection(selectedPaper.paperId, section.sectionId, 1) }
                                }) { Text("↓") }
                                TextButton(onClick = {
                                    scope.launch {
                                        val deleted = repository.deleteEmptySection(selectedPaper.paperId, section.sectionId)
                                        status = if (deleted) "খালি অংশ মুছে ফেলা হয়েছে" else "অংশটি খালি নয় বা মুছে ফেলা যায়নি"
                                    }
                                }) { Text("খালি হলে মুছুন") }
                            }
                        }
                    }
                }

                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("প্রশ্ন যোগ করুন", style = MaterialTheme.typography.titleMedium)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            FilterChip(selected = selectedScope == "ALL", onClick = { selectedScope = "ALL" }, label = { Text("সব") })
                            FilterChip(selected = selectedScope == "TYPE_CQ", onClick = { selectedScope = "TYPE_CQ" }, label = { Text("Type_CQ") })
                            FilterChip(selected = selectedScope == "CHAPTER_CQ", onClick = { selectedScope = "CHAPTER_CQ" }, label = { Text("Chapter_CQ") })
                        }
                        OutlinedTextField(
                            value = sourceQuery, onValueChange = { sourceQuery = it },
                            label = { Text("প্রশ্ন / বিষয় / অধ্যায় খুঁজুন") }, modifier = Modifier.fillMaxWidth(), singleLine = true,
                        )
                        if (sourceLoading && sourceRows.isEmpty()) CircularProgressIndicator()
                        if (!sourceLoading && sourceRows.isEmpty()) Text("কোনো প্রশ্ন পাওয়া যায়নি।")
                        sourceRows.forEach { row -> SourceQuestionRow(
                            row = row,
                            enabled = activeSectionId != null,
                            onAdd = {
                                scope.launch {
                                    runCatching {
                                        repository.addQuestionSnapshot(selectedPaper.paperId, activeSectionId, row.scope, row.questionId)
                                    }.onSuccess { added -> status = if (added) "Snapshot প্রশ্ন যোগ হয়েছে" else "প্রশ্ন যোগ করা যায়নি; উৎসটি আর নেই বা অংশটি ভুল" }
                                        .onFailure { status = "প্রশ্ন যোগ করা যায়নি: ${it.message}" }
                                }
                            },
                        ) }
                        if (sourceHasMore) OutlinedButton(
                            enabled = !sourceLoading,
                            onClick = {
                                scope.launch {
                                    sourceLoading = true
                                    try {
                                        val page = repository.loadSourcePage(selectedScope, sourceQuery, 40, sourceCursor)
                                        val next = page.take(40)
                                        sourceRows = sourceRows + next
                                        sourceCursor = next.lastOrNull() ?: sourceCursor
                                        sourceHasMore = page.size > 40
                                    } catch (error: Exception) {
                                        status = "আরও প্রশ্ন লোড করা যায়নি: ${error.message}"
                                    } finally { sourceLoading = false }
                                }
                            },
                        ) { Text(if (sourceLoading) "লোড হচ্ছে…" else "আরও ৪০টি প্রশ্ন দেখুন") }
                    }
                }

                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("প্রশ্নপত্রের সাজানো তালিকা", style = MaterialTheme.typography.titleMedium)
                        if (items.isEmpty()) Text("এখনও কোনো প্রশ্ন যোগ করা হয়নি।")
                        items.forEachIndexed { index, item ->
                            val sectionItems = items.filter { it.sectionId == item.sectionId }
                            val sectionIndex = sectionItems.indexOfFirst { it.itemId == item.itemId }
                            var markValue by rememberSaveable(item.itemId) {
                                mutableStateOf((item.marksOverride ?: PaperSnapshotCodec.marks(item.snapshotJson)).toString())
                            }
                            val itemOverride by produceState<PaperItemOverridesEntity?>(initialValue = null, item.itemId) {
                                value = repository.loadItemOverride(item.itemId)
                            }
                            val paperImages by produceState<List<PaperImagesEntity>>(initialValue = emptyList(), item.itemId) {
                                value = repository.loadItemImages(item.itemId)
                            }
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text("${index + 1}. ${itemOverride?.questionTextOverride?.takeIf { it.isNotBlank() } ?: PaperSnapshotCodec.title(item.snapshotJson)}")
                                Text(
                                    PaperSnapshotCodec.preview(item.snapshotJson, itemOverride),
                                    style = MaterialTheme.typography.bodySmall,
                                )
                                paperImages.forEach { image -> PaperImageThumbnail(image) }
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                                    OutlinedTextField(
                                        value = markValue,
                                        onValueChange = { markValue = it.filter { c -> c.isDigit() || c == '.' } },
                                        label = { Text("নম্বর") },
                                        modifier = Modifier.weight(1f),
                                        singleLine = true,
                                    )
                                    TextButton(onClick = {
                                        scope.launch {
                                            val parsed = markValue.toDoubleOrNull()
                                            val result = repository.updateItemMarks(selectedPaper.paperId, item.itemId, parsed)
                                            status = if (result) "নম্বর সংরক্ষিত হয়েছে" else "সঠিক নম্বর দিন"
                                        }
                                    }) { Text("সেভ") }
                                }
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    TextButton(onClick = {
                                        overrideItemId = item.itemId
                                        val snapshot = runCatching { JSONObject(item.snapshotJson) }.getOrDefault(JSONObject())
                                        overrideQuestion = itemOverride?.questionTextOverride ?: snapshot.optString("question")
                                        overrideStimulus = itemOverride?.stimulusTextOverride ?: snapshot.optString("stimulus")
                                        overrideAnswer = itemOverride?.shortAnswerOverride ?: snapshot.optString("shortAnswer")
                                        overrideSolutionJson = itemOverride?.solutionJsonOverride.orEmpty()
                                    }) { Text("Snapshot সম্পাদনা") }
                                    TextButton(onClick = {
                                        scope.launch {
                                            val removed = repository.removeItem(selectedPaper.paperId, item.itemId)
                                            status = if (removed) "প্রশ্নপত্র থেকে প্রশ্ন সরানো হয়েছে" else "প্রশ্ন সরানো যায়নি"
                                        }
                                    }) { Text("সরান") }
                                    TextButton(enabled = sectionIndex > 0, onClick = {
                                        scope.launch {
                                            val moved = repository.moveItem(selectedPaper.paperId, item.itemId, -1)
                                            if (!moved) status = "প্রশ্নের ক্রম বদলানো যায়নি; তালিকা আবার দেখুন"
                                        }
                                    }) { Text("উপরে") }
                                    TextButton(enabled = sectionIndex in 0 until (sectionItems.size - 1), onClick = {
                                        scope.launch {
                                            val moved = repository.moveItem(selectedPaper.paperId, item.itemId, 1)
                                            if (!moved) status = "প্রশ্নের ক্রম বদলানো যায়নি; তালিকা আবার দেখুন"
                                        }
                                    }) { Text("নিচে") }
                                }
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick = {
                                scope.launch {
                                    val result = repository.validatePaper(selectedPaper.paperId)
                                    val previewRows = items.mapIndexed { index, item ->
                                        val override = repository.loadItemOverride(item.itemId)
                                        val marks = item.marksOverride ?: override?.marksOverride ?: PaperSnapshotCodec.marks(item.snapshotJson)
                                        "\n${index + 1}. ${PaperSnapshotCodec.preview(item.snapshotJson, override)}\nনম্বর: $marks\n"
                                    }
                                    previewText = buildString {
                                        append("শিরোনাম: ${selectedPaper.title}\n")
                                        append("মোট প্রশ্ন: ${result.itemCount}\n")
                                        append("মোট নম্বর: ${"%.2f".format(result.calculatedMarks)}\n")
                                        previewRows.forEach { append(it) }
                                        append("\n").append(if (result.valid) "যাচাই: ঠিক আছে" else "সমস্যা:\n${result.issues.joinToString("\n")}")
                                    }
                                    previewVisible = true
                                }
                            }) { Text("যাচাই / Preview") }
                            OutlinedButton(onClick = {
                                pendingPdfPaperId = selectedPaper.paperId
                                val safeName = selectedPaper.title.replace(Regex("[^\\p{L}\\p{N} _-]"), "_").take(60).ifBlank { "QuestionPaper" }
                                pdfLauncher.launch("$safeName.pdf")
                            }) { Text("PDF Export") }
                            Text("${items.size}টি প্রশ্ন", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }

            status?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
        }
    }

    if (categoryRenameVisible && selectedCategory != null) {
        AlertDialog(
            onDismissRequest = { categoryRenameVisible = false },
            title = { Text("Category-এর নাম পরিবর্তন") },
            text = {
                OutlinedTextField(
                    value = categoryRenameInput, onValueChange = { categoryRenameInput = it.take(60) },
                    label = { Text("নতুন নাম") }, modifier = Modifier.fillMaxWidth(), singleLine = true,
                )
            },
            confirmButton = {
                TextButton(enabled = categoryRenameInput.isNotBlank(), onClick = {
                    scope.launch {
                        val ok = repository.renameCategory(selectedCategory.paperCategoryId, categoryRenameInput)
                        status = if (ok) "Category-এর নাম বদলানো হয়েছে" else "Category-এর নাম বদলানো যায়নি"
                        categoryRenameVisible = false
                    }
                }) { Text("সংরক্ষণ") }
            },
            dismissButton = { TextButton(onClick = { categoryRenameVisible = false }) { Text("বাতিল") } },
        )
    }

    if (categoryDeleteConfirm && selectedCategory != null) {
        AlertDialog(
            onDismissRequest = { categoryDeleteConfirm = false },
            title = { Text("Category মুছবেন?") },
            text = { Text("এই Category এবং এর ভেতরের সব প্রশ্নপত্র ও snapshot item স্থায়ীভাবে মুছে যাবে। মূল Type_CQ / Chapter_CQ প্রশ্ন অক্ষত থাকবে। অশ্রেণিবদ্ধ মুছতে পারবেন না।") },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        val deleted = repository.deleteCategoryAndContents(selectedCategory.paperCategoryId)
                        if (deleted) {
                            selectedCategoryId = PaperRepository.DEFAULT_CATEGORY_ID
                            status = "Category ও এর ভেতরের প্রশ্নপত্র মুছে ফেলা হয়েছে"
                        } else status = "Category মুছে ফেলা যায়নি; অশ্রেণিবদ্ধ স্থায়ী"
                        categoryDeleteConfirm = false
                    }
                }) { Text("মুছুন") }
            },
            dismissButton = { TextButton(onClick = { categoryDeleteConfirm = false }) { Text("বাতিল") } },
        )
    }

    if (deletePaperConfirm && selectedPaper != null) {
        AlertDialog(
            onDismissRequest = { deletePaperConfirm = false },
            title = { Text("প্রশ্নপত্র মুছবেন?") },
            text = { Text("“${selectedPaper.title}” এবং এর snapshot item মুছে যাবে। মূল Type_CQ / Chapter_CQ প্রশ্ন মুছবে না।") },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        val id = selectedPaper.paperId
                        val removed = repository.deletePaper(id)
                        if (removed) { selectedPaperId = null; status = "প্রশ্নপত্র মুছে ফেলা হয়েছে" }
                        else status = "প্রশ্নপত্র মুছে ফেলা যায়নি"
                        deletePaperConfirm = false
                    }
                }) { Text("মুছুন") }
            },
            dismissButton = { TextButton(onClick = { deletePaperConfirm = false }) { Text("বাতিল") } },
        )
    }

    if (categoryDialogVisible) {
        AlertDialog(
            onDismissRequest = { categoryDialogVisible = false },
            title = { Text("নতুন প্রশ্নপত্র Category") },
            text = {
                OutlinedTextField(
                    value = categoryInput, onValueChange = { categoryInput = it.take(60) },
                    label = { Text("Category-এর নাম") }, modifier = Modifier.fillMaxWidth(), singleLine = true,
                )
            },
            confirmButton = {
                TextButton(enabled = categoryInput.isNotBlank(), onClick = {
                    scope.launch {
                        runCatching { repository.createCategory(categoryInput) }
                            .onSuccess { selectedCategoryId = it; categoryInput = ""; categoryDialogVisible = false; status = "Category তৈরি হয়েছে" }
                            .onFailure { status = "Category তৈরি করা যায়নি: ${it.message}" }
                    }
                }) { Text("তৈরি করুন") }
            },
            dismissButton = { TextButton(onClick = { categoryDialogVisible = false }) { Text("বাতিল") } },
        )
    }

    if (overrideItemId != null) {
        AlertDialog(
            onDismissRequest = { overrideItemId = null },
            title = { Text("Paper snapshot সম্পাদনা") },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(overrideQuestion, { overrideQuestion = it }, label = { Text("প্রশ্ন") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(overrideStimulus, { overrideStimulus = it }, label = { Text("উদ্দীপক") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(overrideAnswer, { overrideAnswer = it }, label = { Text("সংক্ষিপ্ত উত্তর") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(
                        overrideSolutionJson, { overrideSolutionJson = it },
                        label = { Text("Solution override JSON (ঐচ্ছিক)") }, modifier = Modifier.fillMaxWidth(), minLines = 3,
                    )
                    Text("এই পরিবর্তন শুধু এই প্রশ্নপত্রের snapshot-এ প্রযোজ্য; মূল প্রশ্ন বদলাবে না।", style = MaterialTheme.typography.bodySmall)
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    val itemId = overrideItemId
                    if (itemId != null && (overrideSolutionJson.isBlank() || runCatching { JSONObject(overrideSolutionJson) }.isSuccess || runCatching { org.json.JSONArray(overrideSolutionJson) }.isSuccess)) {
                        scope.launch {
                            val ok = repository.updateItemOverride(
                                selectedPaper?.paperId.orEmpty(), itemId,
                                overrideQuestion, overrideStimulus, overrideAnswer,
                                overrideSolutionJson.takeIf { it.isNotBlank() },
                            )
                            status = if (ok) "Snapshot override সংরক্ষিত হয়েছে" else "Override সংরক্ষণ করা যায়নি"
                            if (ok) overrideItemId = null
                        }
                    } else status = "Solution override JSON সঠিক JSON হতে হবে"
                }) { Text("সংরক্ষণ") }
            },
            dismissButton = { TextButton(onClick = { overrideItemId = null }) { Text("বাতিল") } },
        )
    }

    if (previewVisible) {
        AlertDialog(
            onDismissRequest = { previewVisible = false },
            title = { Text("প্রশ্নপত্র Preview") },
            text = { Text(previewText) },
            confirmButton = { TextButton(onClick = { previewVisible = false }) { Text("ঠিক আছে") } },
        )
    }
}

@Composable
private fun PaperImageThumbnail(asset: PaperImagesEntity) {
    val context = LocalContext.current
    val bitmap by produceState<ImageBitmap?>(initialValue = null, asset.relativePath) {
        value = withContext(Dispatchers.IO) {
            val paperRoot = File(context.filesDir, "paper_media").canonicalFile
            val file = File(context.filesDir, asset.relativePath).canonicalFile
            if (!file.path.startsWith(paperRoot.path + File.separator) || !file.isFile) null else {
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeFile(file.absolutePath, bounds)
                if (bounds.outWidth <= 0 || bounds.outHeight <= 0) null else {
                    var sample = 1
                    while (bounds.outWidth / sample > 900 || bounds.outHeight / sample > 900) sample *= 2
                    BitmapFactory.decodeFile(file.absolutePath, BitmapFactory.Options().apply { inSampleSize = sample })?.asImageBitmap()
                }
            }
        }
    }
    bitmap?.let { image ->
        androidx.compose.foundation.Image(
            bitmap = image,
            contentDescription = "Paper snapshot image",
            modifier = Modifier.fillMaxWidth().heightIn(max = 180.dp),
        )
    } ?: Text("ছবিটি পাওয়া যায়নি: ${asset.paperImageId}", style = MaterialTheme.typography.bodySmall)
}

@Composable
private fun SourceQuestionRow(row: PaperSourceRowDb, enabled: Boolean, onAdd: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(row.questionText.ifBlank { "প্রশ্নের লেখা নেই" }, style = MaterialTheme.typography.bodyMedium)
            Text("${row.scope} · ${row.subjectName} / ${row.chapterName} / ${row.containerName}", style = MaterialTheme.typography.bodySmall)
            if (row.stimulusText.isNotBlank()) Text("উদ্দীপক: ${row.stimulusText}", style = MaterialTheme.typography.bodySmall)
            Row {
                Text("নম্বর: ${row.marks}", modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                TextButton(enabled = enabled, onClick = onAdd) { Text("এই প্রশ্ন যোগ করুন") }
            }
        }
    }
}
