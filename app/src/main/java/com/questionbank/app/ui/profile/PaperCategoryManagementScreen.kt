package com.questionbank.app.ui.profile

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.questionbank.app.domain.model.PaperCategorySummary
import com.questionbank.app.domain.repository.PaperRepository
import com.questionbank.app.ui.components.AppHeader
import com.questionbank.app.ui.format.toBengali
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch

/** Profile > Category management. All destructive operations are executed by PaperRepository transactions. */
@Composable
fun PaperCategoryManagementScreen(
    repository: PaperRepository,
    onBack: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val categories by repository.observeCategorySummaries().collectAsState(initial = emptyList())
    var activeCategoryId by remember { mutableStateOf<String?>(null) }
    val activeCategory = categories.firstOrNull { it.categoryId == activeCategoryId }
    val papersFlow = remember(activeCategoryId) {
        activeCategoryId?.let(repository::observePaperSummaries) ?: flowOf(emptyList())
    }
    val papers by papersFlow.collectAsState(initial = emptyList())

    var menuExpanded by remember { mutableStateOf(false) }
    var rowMenuCategory by remember { mutableStateOf<String?>(null) }
    var addDialog by remember { mutableStateOf(false) }
    var renameTarget by remember { mutableStateOf<PaperCategorySummary?>(null) }
    var categoryNameInput by remember { mutableStateOf("") }
    var deleteCategoryIds by remember { mutableStateOf<List<String>?>(null) }
    var deletePaperIds by remember { mutableStateOf<List<String>?>(null) }
    var selectMode by remember { mutableStateOf(false) }
    var reorderMode by remember { mutableStateOf(false) }
    var paperSelectMode by remember { mutableStateOf(false) }
    var selectedCategoryIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var selectedPaperIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var notice by remember { mutableStateOf<String?>(null) }
    var working by remember { mutableStateOf(false) }

    val canSelectAllCategories = categories.filterNot { it.isSystem }.map { it.categoryId }
    val canSelectAllPapers = papers.map { it.paperId }

    fun leaveSelection() {
        selectMode = false
        paperSelectMode = false
        selectedCategoryIds = emptySet()
        selectedPaperIds = emptySet()
    }

    fun goBack() {
        when {
            paperSelectMode -> { paperSelectMode = false; selectedPaperIds = emptySet() }
            selectMode -> { selectMode = false; selectedCategoryIds = emptySet() }
            reorderMode -> reorderMode = false
            activeCategoryId != null -> activeCategoryId = null
            else -> onBack()
        }
    }

    BackHandler(enabled = true) { goBack() }

    LaunchedEffect(activeCategoryId) {
        // Entering another category always starts with a clean selection state.
        paperSelectMode = false
        selectedPaperIds = emptySet()
    }

    fun addCategory() {
        val name = categoryNameInput.trim()
        if (name.isBlank()) { notice = "ক্যাটাগরির নাম লিখুন"; return }
        scope.launch {
            working = true
            runCatching { repository.createCategory(name) }
                .onSuccess { categoryNameInput = ""; addDialog = false; notice = "নতুন ক্যাটাগরি তৈরি হয়েছে" }
                .onFailure { notice = it.message ?: "ক্যাটাগরি তৈরি করা যায়নি" }
            working = false
        }
    }

    fun renameCategory() {
        val target = renameTarget ?: return
        val name = categoryNameInput.trim()
        if (name.isBlank()) { notice = "নতুন নাম লিখুন"; return }
        scope.launch {
            working = true
            val ok = repository.renameCategory(target.categoryId, name)
            notice = if (ok) "ক্যাটাগরির নাম পরিবর্তন হয়েছে" else "নাম পরিবর্তন করা যায়নি; একই নাম আগে থেকেই থাকতে পারে"
            if (ok) renameTarget = null
            working = false
        }
    }

    fun moveCategory(categoryId: String, direction: Int) {
        val movable = categories.filterNot { it.isSystem }.toMutableList()
        val currentIndex = movable.indexOfFirst { it.categoryId == categoryId }
        val targetIndex = currentIndex + direction
        if (currentIndex < 0 || targetIndex !in movable.indices) return
        val moved = movable.toMutableList().apply { add(targetIndex, removeAt(currentIndex)) }
        scope.launch {
            val ok = repository.reorderCategories(moved.map { it.categoryId })
            if (!ok) notice = "ক্যাটাগরির ক্রম পরিবর্তন করা যায়নি; তালিকা আবার দেখুন"
        }
    }

    fun confirmDeleteCategories(ids: List<String>) {
        val deletable = ids.distinct().filter { id -> categories.any { it.categoryId == id && !it.isSystem } }
        if (deletable.isEmpty()) { notice = "অশ্রেণিবদ্ধ স্থায়ী ক্যাটাগরি; এটি মুছে ফেলা যাবে না"; return }
        deleteCategoryIds = deletable
    }

    fun deleteCategoriesNow() {
        val ids = deleteCategoryIds.orEmpty()
        if (ids.isEmpty()) return
        scope.launch {
            working = true
            runCatching { repository.deleteCategoriesAndContents(ids) }
                .onSuccess { count ->
                    notice = "${count.toBengali()}টি ক্যাটাগরি এবং এর ভেতরের সব প্রশ্নপত্র মুছে ফেলা হয়েছে"
                    selectedCategoryIds = emptySet()
                    selectMode = false
                    activeCategoryId?.let { currentId -> if (currentId in ids) activeCategoryId = null }
                }
                .onFailure { notice = "ক্যাটাগরি ও প্রশ্নপত্র মুছে ফেলা যায়নি: ${it.message}" }
            deleteCategoryIds = null
            working = false
        }
    }

    fun deletePapersNow() {
        val ids = deletePaperIds.orEmpty()
        if (ids.isEmpty()) return
        scope.launch {
            working = true
            runCatching { repository.deletePapersByIds(ids) }
                .onSuccess { count ->
                    notice = "${count.toBengali()}টি প্রশ্নপত্র মুছে ফেলা হয়েছে"
                    selectedPaperIds = emptySet()
                    paperSelectMode = false
                }
                .onFailure { notice = "প্রশ্নপত্র মুছে ফেলা যায়নি: ${it.message}" }
            deletePaperIds = null
            working = false
        }
    }

    Scaffold(
        topBar = {
            AppHeader(
                title = activeCategory?.name ?: "ক্যাটাগরি",
                subtitle = when {
                    activeCategory != null && paperSelectMode -> "${selectedPaperIds.size.toBengali()}টি নির্বাচিত"
                    activeCategory != null -> "এই ক্যাটাগরির প্রশ্নপত্র"
                    selectMode -> "${selectedCategoryIds.size.toBengali()}টি নির্বাচিত"
                    reorderMode -> "ক্যাটাগরির ক্রম সাজান"
                    else -> "প্রশ্নপত্রের ক্যাটাগরি পরিচালনা"
                },
                onBack = ::goBack,
                actions = {
                    when {
                        activeCategory != null && paperSelectMode -> TextButton(onClick = {
                            selectedPaperIds = if (selectedPaperIds.size == canSelectAllPapers.size) emptySet() else canSelectAllPapers.toSet()
                        }) { Text(if (canSelectAllPapers.isNotEmpty() && selectedPaperIds.size == canSelectAllPapers.size) "সব বাদ" else "সব নির্বাচন", color = androidx.compose.ui.graphics.Color.White, fontSize = 11.sp) }
                        activeCategory == null && selectMode -> TextButton(onClick = {
                            selectedCategoryIds = if (selectedCategoryIds.size == canSelectAllCategories.size) emptySet() else canSelectAllCategories.toSet()
                        }) { Text(if (canSelectAllCategories.isNotEmpty() && selectedCategoryIds.size == canSelectAllCategories.size) "সব বাদ" else "সব নির্বাচন", color = androidx.compose.ui.graphics.Color.White, fontSize = 11.sp) }
                    }
                    if (activeCategory == null && !selectMode && !reorderMode) {
                        IconButton(onClick = { categoryNameInput = ""; addDialog = true }, modifier = Modifier.size(38.dp)) {
                            Text("+", color = androidx.compose.ui.graphics.Color.White, fontSize = 25.sp, fontWeight = FontWeight.Light)
                        }
                    }
                    Box {
                        IconButton(onClick = { menuExpanded = true }, modifier = Modifier.size(40.dp)) {
                            Text("⋮", color = androidx.compose.ui.graphics.Color.White, fontSize = 24.sp)
                        }
                        DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                            if (activeCategory != null) {
                                if (paperSelectMode && selectedPaperIds.isNotEmpty()) {
                                    DropdownMenuItem(text = { Text("Delete") }, onClick = { menuExpanded = false; deletePaperIds = selectedPaperIds.toList() })
                                } else if (!paperSelectMode) {
                                    DropdownMenuItem(text = { Text("Select") }, onClick = { menuExpanded = false; paperSelectMode = true; selectedPaperIds = emptySet() })
                                }
                                if (paperSelectMode) DropdownMenuItem(text = { Text("সিলেকশন বাতিল") }, onClick = { menuExpanded = false; paperSelectMode = false; selectedPaperIds = emptySet() })
                            } else if (reorderMode) {
                                DropdownMenuItem(text = { Text("সম্পন্ন") }, onClick = { menuExpanded = false; reorderMode = false })
                            } else if (selectMode) {
                                if (selectedCategoryIds.isNotEmpty()) {
                                    DropdownMenuItem(text = { Text("Delete") }, onClick = { menuExpanded = false; confirmDeleteCategories(selectedCategoryIds.toList()) })
                                }
                                DropdownMenuItem(text = { Text("সিলেকশন বাতিল") }, onClick = { menuExpanded = false; leaveSelection() })
                            } else {
                                DropdownMenuItem(text = { Text("Reorder") }, onClick = { menuExpanded = false; reorderMode = true })
                                DropdownMenuItem(text = { Text("Select") }, onClick = { menuExpanded = false; selectMode = true; selectedCategoryIds = emptySet() })
                            }
                        }
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(horizontal = 12.dp, vertical = 10.dp)) {
            notice?.let {
                Text(it, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(horizontal = 4.dp, vertical = 5.dp))
            }
            if (activeCategory == null) {
                if (categories.isEmpty()) {
                    Text("কোনো ক্যাটাগরি নেই। উপরের + বাটনে চাপ দিয়ে নতুন ক্যাটাগরি তৈরি করুন।", modifier = Modifier.padding(20.dp))
                } else {
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(categories, key = { it.categoryId }) { category ->
                            val selected = selectedCategoryIds.contains(category.categoryId)
                            val menuOpen = rowMenuCategory == category.categoryId
                            Card(Modifier.fillMaxWidth()) {
                                Row(
                                    Modifier.fillMaxWidth().clickable {
                                        when {
                                            selectMode -> if (!category.isSystem) selectedCategoryIds = if (selected) selectedCategoryIds - category.categoryId else selectedCategoryIds + category.categoryId
                                            reorderMode -> Unit
                                            else -> activeCategoryId = category.categoryId
                                        }
                                    }.padding(horizontal = 12.dp, vertical = 10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    if (selectMode) {
                                        Checkbox(checked = selected, enabled = !category.isSystem, onCheckedChange = { checked -> selectedCategoryIds = if (checked) selectedCategoryIds + category.categoryId else selectedCategoryIds - category.categoryId })
                                    }
                                    Column(Modifier.weight(1f)) {
                                        Text(category.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                                        Text("${category.paperCount.toBengali()}টি প্রশ্নপত্র · ${category.questionCount.toBengali()}টি প্রশ্ন", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        if (category.isSystem) Text("স্থায়ী ক্যাটাগরি", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                                    }
                                    if (reorderMode && !category.isSystem) {
                                        val movable = categories.filterNot { it.isSystem }
                                        val at = movable.indexOfFirst { it.categoryId == category.categoryId }
                                        TextButton(enabled = at > 0, onClick = { moveCategory(category.categoryId, -1) }) { Text("↑") }
                                        TextButton(enabled = at in 0 until movable.lastIndex, onClick = { moveCategory(category.categoryId, 1) }) { Text("↓") }
                                    } else if (!selectMode && !reorderMode) {
                                        Box {
                                            IconButton(onClick = { rowMenuCategory = category.categoryId }) {
                                                Text("⋮", fontSize = 22.sp)
                                            }
                                            DropdownMenu(expanded = menuOpen, onDismissRequest = { rowMenuCategory = null }) {
                                                DropdownMenuItem(
                                                    enabled = !category.isSystem,
                                                    text = { Text("নাম সম্পাদনা") },
                                                    onClick = {
                                                        rowMenuCategory = null
                                                        renameTarget = category
                                                        categoryNameInput = category.name
                                                    },
                                                )
                                                DropdownMenuItem(
                                                    enabled = !category.isSystem,
                                                    text = { Text("মুছে ফেলুন") },
                                                    onClick = {
                                                        rowMenuCategory = null
                                                        confirmDeleteCategories(listOf(category.categoryId))
                                                    },
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                if (papers.isEmpty()) {
                    Text("এই ক্যাটাগরিতে কোনো প্রশ্নপত্র নেই।", modifier = Modifier.padding(20.dp))
                } else {
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(papers, key = { it.paperId }) { paper ->
                            val selected = selectedPaperIds.contains(paper.paperId)
                            Card(Modifier.fillMaxWidth()) {
                                Row(
                                    Modifier.fillMaxWidth().clickable(enabled = paperSelectMode) {
                                        selectedPaperIds = if (selected) selectedPaperIds - paper.paperId else selectedPaperIds + paper.paperId
                                    }.padding(horizontal = 12.dp, vertical = 12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                                ) {
                                    if (paperSelectMode) Checkbox(checked = selected, onCheckedChange = { checked -> selectedPaperIds = if (checked) selectedPaperIds + paper.paperId else selectedPaperIds - paper.paperId })
                                    Column(Modifier.weight(1f)) {
                                        Text(paper.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                        if (paper.subjectLine.isNotBlank()) Text(paper.subjectLine, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        Text("${paper.questionCount.toBengali()}টি প্রশ্ন", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if (working) Text("কাজ চলছে…", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
        }
    }

    if (addDialog) AlertDialog(
        onDismissRequest = { if (!working) addDialog = false },
        title = { Text("নতুন ক্যাটাগরি") },
        text = { OutlinedTextField(categoryNameInput, { categoryNameInput = it.take(60) }, label = { Text("ক্যাটাগরির নাম") }, singleLine = true) },
        confirmButton = { TextButton(enabled = categoryNameInput.isNotBlank() && !working, onClick = ::addCategory) { Text("তৈরি করুন") } },
        dismissButton = { TextButton(onClick = { addDialog = false }) { Text("বাতিল") } },
    )

    renameTarget?.let { target -> AlertDialog(
        onDismissRequest = { if (!working) renameTarget = null },
        title = { Text("ক্যাটাগরির নাম সম্পাদনা") },
        text = { OutlinedTextField(categoryNameInput, { categoryNameInput = it.take(60) }, label = { Text("নতুন নাম") }, singleLine = true) },
        confirmButton = { TextButton(enabled = categoryNameInput.isNotBlank() && !working, onClick = ::renameCategory) { Text("সংরক্ষণ") } },
        dismissButton = { TextButton(onClick = { renameTarget = null }) { Text("বাতিল") } },
    ) }

    deleteCategoryIds?.let { ids -> AlertDialog(
        onDismissRequest = { if (!working) deleteCategoryIds = null },
        title = { Text("ক্যাটাগরি মুছে ফেলবেন?") },
        text = { Text("নির্বাচিত ${ids.size.toBengali()}টি ক্যাটাগরি এবং প্রতিটির ভেতরের সব প্রশ্নপত্র, সেকশন, snapshot প্রশ্ন ও paper-এর ছবি স্থায়ীভাবে মুছে যাবে। মূল Type CQ / Chapter CQ প্রশ্ন মুছবে না। অশ্রেণিবদ্ধ ক্যাটাগরি এতে অন্তর্ভুক্ত নয়।") },
        confirmButton = { TextButton(enabled = !working, onClick = ::deleteCategoriesNow) { Text("মুছে ফেলুন") } },
        dismissButton = { TextButton(onClick = { deleteCategoryIds = null }) { Text("বাতিল") } },
    ) }

    deletePaperIds?.let { ids -> AlertDialog(
        onDismissRequest = { if (!working) deletePaperIds = null },
        title = { Text("প্রশ্নপত্র মুছে ফেলবেন?") },
        text = { Text("নির্বাচিত ${ids.size.toBengali()}টি প্রশ্নপত্র ও তাদের snapshot item স্থায়ীভাবে মুছে যাবে। মূল Type CQ / Chapter CQ প্রশ্ন অক্ষত থাকবে।") },
        confirmButton = { TextButton(enabled = !working, onClick = ::deletePapersNow) { Text("মুছে ফেলুন") } },
        dismissButton = { TextButton(onClick = { deletePaperIds = null }) { Text("বাতিল") } },
    ) }
}
