package com.questionbank.app.ui.question

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.questionbank.app.domain.question.BoardItem
import com.questionbank.app.domain.question.QuestionGroupKey
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.domain.question.TopicBreadcrumb
import com.questionbank.app.media.ImagePipeline
import com.questionbank.app.ui.format.toBengali
import com.questionbank.app.ui.format.toBengaliDigits
import com.questionbank.app.ui.theme.HeaderDark
import com.questionbank.app.ui.theme.HeaderLight
import com.questionbank.app.ui.theme.LocalDarkTheme
import kotlinx.coroutines.launch

internal fun marksText(marks: Double): String =
    (if (marks % 1.0 == 0.0) marks.toInt().toString() else marks.toString()).toBengaliDigits()

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuestionListScreen(
    viewModel: QuestionListViewModel,
    savedCount: Int,
    onSavedShown: () -> Unit,
    edited: Boolean,
    onEditedShown: () -> Unit,
    onAdd: () -> Unit,
    onEdit: (SavedGroup) -> Unit,
    onDelete: (SavedGroup) -> Unit,
    onCopy: (SavedGroup) -> Unit,
    onBulkDelete: (List<String>) -> Unit,
    onView: (SavedGroup) -> Unit,
    imagePipeline: ImagePipeline,
    onBack: () -> Unit,
    onConcept: (SavedGroup, Int) -> Unit = { _, _ -> },
    onAllConcepts: () -> Unit = {},
    onNavigateSubject: (String) -> Unit = {},
    onNavigateChapter: (String) -> Unit = {},
) {
    val groups by viewModel.groups.collectAsState()
    val breadcrumb by viewModel.topicBreadcrumb.collectAsState()
    val searchState by viewModel.searchState.collectAsState()
    val boardCatalog by viewModel.boardCatalog.collectAsState()
    val categoryCatalog by viewModel.categoryCatalog.collectAsState()
    val questionTypeCatalog by viewModel.questionTypeCatalog.collectAsState()
    val clipboard by viewModel.clipboard.collectAsState()
    val pasteInProgress by viewModel.pasteInProgress.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    val deleteMessage = viewModel.deleteMessage
    var selectedKeys by remember { mutableStateOf(emptySet<String>()) }
    var sortMode by remember { mutableStateOf("DEFAULT") }
    var filterSheet by remember { mutableStateOf(false) }
    var menuOpen by remember { mutableStateOf(false) }
    var pendingBulkDelete by remember { mutableStateOf<List<String>?>(null) }

    val searchOpen = viewModel.searchOpen
    val query = viewModel.query
    val filter = viewModel.filter
    val filterCount = listOf(filter.boardCode, filter.year, filter.categoryId, filter.stimulusCategoryId, filter.rating, filter.questionTypeId).count { it != null }
    val showSearch = (query.isNotBlank() || !filter.isEmpty) && searchState != SearchUiState.Idle
    val visibleGroups = if (showSearch) (searchState as? SearchUiState.Results)?.groups.orEmpty() else groups.orEmpty()
    val sortedVisible = remember(visibleGroups, sortMode) { sortQuestionGroups(visibleGroups, sortMode) }
    val selectedTopicGroups = remember(groups, selectedKeys) { groups.orEmpty().filter { QuestionGroupKey.of(it)?.let(selectedKeys::contains) == true } }

    BackHandler(enabled = searchOpen) { viewModel.closeSearch() }
    LaunchedEffect(groups, selectedKeys) {
        val available = groups.orEmpty().mapNotNull { QuestionGroupKey.of(it) }.toSet()
        if (!available.containsAll(selectedKeys)) selectedKeys = selectedKeys.intersect(available)
    }
    LaunchedEffect(savedCount) { if (savedCount > 0) { snackbar.showSnackbar("${savedCount.toBengali()} টি প্রশ্ন সংরক্ষিত হয়েছে ✓"); onSavedShown() } }
    LaunchedEffect(edited) { if (edited) { snackbar.showSnackbar("পরিবর্তন সংরক্ষিত হয়েছে ✓"); onEditedShown() } }
    LaunchedEffect(deleteMessage) { if (deleteMessage.isNotBlank()) { snackbar.showSnackbar(deleteMessage); viewModel.clearDeleteMessage() } }

    if (pendingBulkDelete != null) AlertDialog(
        onDismissRequest = { pendingBulkDelete = null },
        title = { Text("নির্বাচিত কার্ডগুলো মুছবেন?") },
        text = { Text("${pendingBulkDelete!!.size.toBengali()} টি সম্পূর্ণ কার্ড এবং সেগুলোর সব দাগ মুছে যাবে। সংরক্ষিত প্রশ্নপত্রে ব্যবহৃত কোনো প্রশ্ন থাকলে পুরো ব্যাচ বাতিল হবে।") },
        confirmButton = { TextButton(onClick = { val keys = pendingBulkDelete.orEmpty(); pendingBulkDelete = null; selectedKeys = emptySet(); onBulkDelete(keys) }) { Text("সব মুছুন") } },
        dismissButton = { TextButton(onClick = { pendingBulkDelete = null }) { Text("বাতিল") } },
    )

    if (filterSheet) ModalBottomSheet(onDismissRequest = { filterSheet = false }) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Text("ফিল্টার ও সাজান", style = MaterialTheme.typography.titleMedium)
            Text("সাজান", style = MaterialTheme.typography.labelLarge)
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("DEFAULT" to "ডিফল্ট ক্রম", "RATING" to "রেটিং বেশি আগে", "MARKS" to "মোট নম্বর বেশি আগে", "TYPE" to "প্রশ্নের ধরন").forEach { (key, label) ->
                    androidx.compose.material3.FilterChip(selected = sortMode == key, onClick = { sortMode = key }, label = { Text(label, fontSize = 12.sp) })
                }
            }
            Text("বোর্ড ও সাল", style = MaterialTheme.typography.labelLarge)
            BoardFilterBar(filter = filter, boards = boardCatalog, onChange = viewModel::changeFilter)
            Text("ক্যাটাগরি, রেটিং ও ধরন", style = MaterialTheme.typography.labelLarge)
            QuestionFilterBar(filter = filter, categories = categoryCatalog, types = questionTypeCatalog, onChange = viewModel::changeFilter)
            Button(onClick = { viewModel.clearAllFilters() }, modifier = Modifier.fillMaxWidth(), enabled = !filter.isEmpty) { Text("সব ফিল্টার মুছুন") }
            Spacer(Modifier.height(20.dp))
        }
    }

    Scaffold(
        topBar = {
            Column {
                TypeCqHeader(
                    searchOpen = searchOpen,
                    query = query,
                    filterCount = filterCount,
                    onBack = if (searchOpen) viewModel::closeSearch else onBack,
                    onQueryChange = viewModel::onQueryChange,
                    onFilter = { filterSheet = true },
                    onSearch = { if (searchOpen) viewModel.closeSearch() else viewModel.openSearch() },
                    onMore = { menuOpen = true },
                    menuOpen = menuOpen,
                    onDismissMenu = { menuOpen = false },
                    selectedCount = selectedKeys.size,
                    clipboardCount = clipboard.size,
                    pasteInProgress = pasteInProgress,
                    hasSelection = selectedKeys.isNotEmpty(),
                    onSelectAll = { selectedKeys = sortedVisible.mapNotNull { QuestionGroupKey.of(it) }.toSet(); menuOpen = false },
                    onDeselect = { selectedKeys = emptySet(); menuOpen = false },
                    onCopy = { viewModel.copyCards(selectedTopicGroups); menuOpen = false },
                    onCut = { viewModel.copyCards(selectedTopicGroups, cut = true); menuOpen = false },
                    onPaste = { viewModel.pasteCards(); menuOpen = false },
                    onDelete = { pendingBulkDelete = selectedKeys.toList(); menuOpen = false },
                    onAllConcepts = { menuOpen = false; onAllConcepts() },
                )
                BreadcrumbAndCount(
                    breadcrumb = breadcrumb,
                    selectedCount = selectedKeys.size,
                    visibleCount = sortedVisible.size,
                    totalCount = groups.orEmpty().size,
                    filtered = query.isNotBlank() || !filter.isEmpty,
                    onSubject = onNavigateSubject,
                    onChapter = onNavigateChapter,
                )
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
        floatingActionButton = {
            if (!searchOpen) SmallFloatingActionButton(onClick = onAdd, containerColor = MaterialTheme.colorScheme.primary, contentColor = MaterialTheme.colorScheme.onPrimary) {
                Text("+QA", fontSize = 13.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 8.dp))
            }
        },
    ) { innerPadding ->
        Box(Modifier.fillMaxSize().padding(innerPadding)) {
            when {
                showSearch -> when (val state = searchState) {
                    SearchUiState.Idle -> TypeCqMessage("খোঁজার জন্য অক্ষর লিখুন অথবা ফিল্টার বাছুন।")
                    SearchUiState.NoTerms -> TypeCqMessage("খোঁজার জন্য অক্ষর বা সংখ্যা লিখুন।")
                    is SearchUiState.Failed -> TypeCqMessage("খোঁজা যায়নি। আবার চেষ্টা করুন।", error = true)
                    is SearchUiState.Results -> when {
                        groups == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { androidx.compose.material3.CircularProgressIndicator() }
                        sortedVisible.isEmpty() -> TypeCqMessage("কোনো প্রশ্ন পাওয়া যায়নি।")
                        else -> TypeCqCardList(sortedVisible, groups.orEmpty(), boardCatalog, categoryCatalog, selectedKeys, viewModel, imagePipeline, onEdit, onDelete, onView, onConcept,
                            onToggle = { key -> selectedKeys = if (key in selectedKeys) selectedKeys - key else selectedKeys + key }, canPaste = clipboard.isNotEmpty() && !pasteInProgress)
                    }
                }
                groups == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { androidx.compose.material3.CircularProgressIndicator() }
                sortedVisible.isEmpty() -> TypeCqMessage("এই টপিকে এখনো কোনো প্রশ্ন নেই।")
                else -> TypeCqCardList(sortedVisible, groups.orEmpty(), boardCatalog, categoryCatalog, selectedKeys, viewModel, imagePipeline, onEdit, onDelete, onView, onConcept,
                    onToggle = { key -> selectedKeys = if (key in selectedKeys) selectedKeys - key else selectedKeys + key }, canPaste = clipboard.isNotEmpty() && !pasteInProgress)
            }
        }
    }
}

@Composable
private fun TypeCqHeader(
    searchOpen: Boolean, query: String, filterCount: Int, onBack: () -> Unit, onQueryChange: (String) -> Unit,
    onFilter: () -> Unit, onSearch: () -> Unit, onMore: () -> Unit, menuOpen: Boolean, onDismissMenu: () -> Unit,
    selectedCount: Int, clipboardCount: Int, pasteInProgress: Boolean, hasSelection: Boolean,
    onSelectAll: () -> Unit, onDeselect: () -> Unit, onCopy: () -> Unit, onCut: () -> Unit,
    onPaste: () -> Unit, onDelete: () -> Unit, onAllConcepts: () -> Unit,
) {
    val dark = LocalDarkTheme.current
    val background = if (dark) HeaderDark else HeaderLight
    Surface(color = background, contentColor = Color.White) {
        Row(
            Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.statusBars).height(44.dp).padding(horizontal = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("‹", Modifier.size(38.dp).clickable(onClick = onBack).semantics { contentDescription = "পিছনে" }, fontSize = 29.sp, color = Color.White)
            if (searchOpen) {
                val focus = remember { FocusRequester() }
                LaunchedEffect(Unit) { focus.requestFocus() }
                TextField(
                    value = query,
                    onValueChange = onQueryChange,
                    modifier = Modifier.weight(1f).focusRequester(focus),
                    singleLine = true,
                    placeholder = { Text("প্রশ্ন বা উদ্দীপক খুঁজুন…", fontSize = 13.sp) },
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = Color.Transparent, unfocusedContainerColor = Color.Transparent,
                        focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent,
                        focusedTextColor = Color.White, unfocusedTextColor = Color.White, cursorColor = Color.White,
                        focusedPlaceholderColor = Color(0xFFDCE3FF), unfocusedPlaceholderColor = Color(0xFFDCE3FF),
                    ),
                )
            } else {
                Text("প্রশ্ন", modifier = Modifier.weight(1f), fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
            }

            // Filter and search remain separate controls, even while the search field is open.
            Box(Modifier.size(44.dp)) {
                Canvas(Modifier.size(48.dp).clickable(onClick = onFilter).padding(13.dp)) {
                    val w = size.width; val h = size.height
                    drawLine(Color.White, Offset(w * .08f, h * .18f), Offset(w * .92f, h * .18f), strokeWidth = 2.dp.toPx(), cap = StrokeCap.Round)
                    drawLine(Color.White, Offset(w * .20f, h * .18f), Offset(w * .42f, h * .55f), strokeWidth = 2.dp.toPx())
                    drawLine(Color.White, Offset(w * .80f, h * .18f), Offset(w * .58f, h * .55f), strokeWidth = 2.dp.toPx())
                    drawLine(Color.White, Offset(w * .42f, h * .55f), Offset(w * .42f, h * .88f), strokeWidth = 2.dp.toPx(), cap = StrokeCap.Round)
                    drawLine(Color.White, Offset(w * .58f, h * .55f), Offset(w * .58f, h * .88f), strokeWidth = 2.dp.toPx(), cap = StrokeCap.Round)
                }
                if (filterCount > 0) Box(
                    Modifier.align(Alignment.TopEnd).size(14.dp).background(Color(0xFFFFD54F), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(filterCount.toString().toBengali(), color = Color(0xFF2A2A2A), fontSize = 8.sp, fontWeight = FontWeight.Bold)
                }
            }
            if (searchOpen) {
                Text("×", Modifier.size(38.dp).clickable(onClick = onSearch), fontSize = 23.sp, color = Color.White)
            } else {
                Canvas(Modifier.size(44.dp).clickable(onClick = onSearch).padding(12.dp)) {
                    drawCircle(Color.White, radius = size.minDimension * .28f, center = Offset(size.width * .42f, size.height * .4f), style = androidx.compose.ui.graphics.drawscope.Stroke(2.dp.toPx()))
                    drawLine(Color.White, Offset(size.width * .62f, size.height * .62f), Offset(size.width * .9f, size.height * .9f), 2.dp.toPx(), cap = StrokeCap.Round)
                }
            }
            Box {
                Text("⋮", Modifier.size(32.dp).clickable(onClick = onMore), fontSize = 23.sp, color = Color.White)
                DropdownMenu(expanded = menuOpen, onDismissRequest = onDismissMenu) {
                    DropdownMenuItem(text = { Text("Select All") }, onClick = onSelectAll)
                    DropdownMenuItem(text = { Text("Deselect") }, enabled = hasSelection, onClick = onDeselect)
                    DropdownMenuItem(text = { Text("Copy${if (hasSelection) " ($selectedCount)" else ""}") }, enabled = hasSelection, onClick = onCopy)
                    DropdownMenuItem(text = { Text("Cut${if (hasSelection) " ($selectedCount)" else ""}") }, enabled = hasSelection, onClick = onCut)
                    if (clipboardCount > 0) DropdownMenuItem(
                        text = { Text(if (pasteInProgress) "পেস্ট হচ্ছে…" else "Paste ($clipboardCount)") },
                        enabled = !pasteInProgress, onClick = onPaste,
                    )
                    DropdownMenuItem(text = { Text("Delete${if (hasSelection) " ($selectedCount)" else ""}") }, enabled = hasSelection, onClick = onDelete)
                    androidx.compose.material3.HorizontalDivider()
                    DropdownMenuItem(text = { Text("সব কনসেপ্ট দেখুন") }, onClick = onAllConcepts)
                    DropdownMenuItem(text = { Text("ফোল্ডার থেকে প্রশ্ন যোগ করো") }, enabled = false, onClick = {})
                }
            }
        }
    }
}

@Composable
private fun BreadcrumbAndCount(
    breadcrumb: TopicBreadcrumb?, selectedCount: Int, visibleCount: Int, totalCount: Int, filtered: Boolean,
    onSubject: (String) -> Unit, onChapter: (String) -> Unit,
) {
    Column(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface).padding(horizontal = 10.dp)) {
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).height(24.dp), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            if (breadcrumb != null) {
                Text(breadcrumb.subjectName, color = MaterialTheme.colorScheme.primary, fontSize = 11.sp,
                    modifier = Modifier.clickable { onSubject(breadcrumb.subjectId) })
                Text("›", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(breadcrumb.chapterName, color = MaterialTheme.colorScheme.primary, fontSize = 11.sp,
                    modifier = Modifier.clickable { onChapter(breadcrumb.chapterId) })
                Text("›", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(breadcrumb.topicName, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.SemiBold)
            }
        }
        Row(Modifier.fillMaxWidth().height(22.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Text("নির্বাচিত: ${selectedCount.toBengali()}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(if (filtered) "দৃশ্যমান ${visibleCount.toBengali()} / মোট ${totalCount.toBengali()}" else "মোট: ${totalCount.toBengali()}",
                fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun TypeCqCardList(
    groups: List<SavedGroup>, topicOrderGroups: List<SavedGroup>, boards: List<BoardItem>, categories: List<com.questionbank.app.data.local.entity.TypeCqQuestionCategoriesEntity>,
    selectedKeys: Set<String>, viewModel: QuestionListViewModel, imagePipeline: ImagePipeline,
    onEdit: (SavedGroup) -> Unit, onDelete: (SavedGroup) -> Unit, onView: (SavedGroup) -> Unit, onConcept: (SavedGroup, Int) -> Unit,
    onToggle: (String) -> Unit, canPaste: Boolean,
) {
    val pageSize = 40
    var shown by remember(groups) { mutableStateOf(pageSize) }
    val page = groups.take(shown)
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 10.dp, end = 10.dp, top = 3.dp, bottom = 82.dp),
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        itemsIndexed(page, key = { _, group -> QuestionGroupKey.of(group) ?: group.subQuestions.first().id }) { index, group ->
            val key = QuestionGroupKey.of(group).orEmpty()
            QuestionCard(
                number = index + 1, group = group, boards = boards, categories = categories, imagePipeline = imagePipeline,
                selected = key in selectedKeys, onToggleSelected = { onToggle(key) },
                onEdit = { onEdit(group) }, onDelete = { onDelete(group) }, onCopy = { viewModel.duplicateGroup(group) }, onView = { onView(group) },
                onCategoriesChanged = { viewModel.setCardCategories(group, it) }, onConcept = { onConcept(group, topicCardNumber(topicOrderGroups, group)) },
                onCut = { viewModel.copyCards(listOf(group), cut = true) },
                onPasteBefore = { viewModel.pasteCards(key, beforeAnchor = true) }, onPasteAfter = { viewModel.pasteCards(key, beforeAnchor = false) }, canPaste = canPaste,
            )
        }
        if (shown < groups.size) item(key = "load-more") {
            TextButton(onClick = { shown = (shown + pageSize).coerceAtMost(groups.size) }, modifier = Modifier.fillMaxWidth()) {
                Text("আরও ${minOf(pageSize, groups.size - shown).toBengali()} টি দেখুন")
            }
        }
    }
}

private fun sortQuestionGroups(groups: List<SavedGroup>, mode: String): List<SavedGroup> = when (mode) {
    "RATING" -> groups.sortedWith(compareByDescending<SavedGroup> { com.questionbank.app.domain.question.QuestionCardRules.rating(it) }.thenBy { it.stimulusId ?: it.subQuestions.firstOrNull()?.id.orEmpty() })
    "MARKS" -> groups.sortedWith(compareByDescending<SavedGroup> { it.subQuestions.sumOf { q -> q.marks } }.thenBy { it.stimulusId ?: it.subQuestions.firstOrNull()?.id.orEmpty() })
    "TYPE" -> groups.sortedWith(compareBy<SavedGroup> { it.subQuestions.firstOrNull()?.questionTypeId.orEmpty() }.thenBy { it.stimulusId ?: it.subQuestions.firstOrNull()?.id.orEmpty() })
    else -> groups
}

@Composable
private fun TypeCqMessage(text: String, error: Boolean = false) {
    Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
        Text(text, color = if (error) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
