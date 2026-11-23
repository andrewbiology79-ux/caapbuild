package com.questionbank.app.ui.question

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.questionbank.app.domain.question.BoardItem
import com.questionbank.app.domain.question.BoardFilter
import com.questionbank.app.domain.question.QuestionGroupKey
import com.questionbank.app.domain.question.QuestionCardRules
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.domain.question.SavedSubQuestion
import com.questionbank.app.data.local.entity.TypeCqQuestionCategoriesEntity
import com.questionbank.app.ui.components.AppHeader
import com.questionbank.app.ui.format.toBengali
import com.questionbank.app.ui.format.toBengaliDigits
import com.questionbank.app.ui.theme.HeaderDark
import com.questionbank.app.ui.theme.HeaderLight
import com.questionbank.app.ui.theme.LocalDarkTheme
import com.questionbank.app.media.ImagePipeline
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
    onBulkDelete: (List<String>) -> Unit,
    onView: (SavedGroup) -> Unit,
    imagePipeline: ImagePipeline,
    onBack: () -> Unit,
    onBreadcrumbHome: () -> Unit = onBack,
    onBreadcrumbSubject: () -> Unit = onBack,
    onBreadcrumbChapter: () -> Unit = onBack,
) {
    val groups by viewModel.groups.collectAsState()
    val breadcrumb by viewModel.breadcrumb.collectAsState()
    val searchState by viewModel.searchState.collectAsState()
    val boardCatalog by viewModel.boardCatalog.collectAsState()
    val categoryCatalog by viewModel.categoryCatalog.collectAsState()
    val questionTypeCatalog by viewModel.questionTypeCatalog.collectAsState()
    val clipboardCount = viewModel.clipboardCount
    val clipboardMode = viewModel.clipboardMode
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val deleteMessage = viewModel.deleteMessage
    var selectedKeys by remember { mutableStateOf(emptySet<String>()) }
    var sortMode by remember { mutableStateOf("DEFAULT") }
    var sortMenuOpen by remember { mutableStateOf(false) }
    var filterPanelOpen by rememberSaveable { mutableStateOf(false) }
    var ribbonMenuOpen by remember { mutableStateOf(false) }
    var pendingBulkDelete by remember { mutableStateOf<List<String>?>(null) }
    var conceptQuestionId by remember { mutableStateOf<String?>(null) }
    var conceptQuestionText by remember { mutableStateOf("") }
    var conceptQuestionOptions by remember { mutableStateOf<List<SavedSubQuestion>?>(null) }
    var showConceptSummary by remember { mutableStateOf(false) }
    var conceptSummaries by remember { mutableStateOf(emptyList<com.questionbank.app.domain.question.QuestionConceptSummary>()) }

    val searchOpen = viewModel.searchOpen
    val query = viewModel.query
    val filter = viewModel.filter
    // Enter search mode as soon as criteria change. During debounce/search, expose no stale rows to Select All.
    val showSearch = query.isNotBlank() || !filter.isEmpty
    val visibleGroups = when {
        !showSearch -> groups.orEmpty()
        viewModel.searchPending -> emptyList()
        else -> (searchState as? SearchUiState.Results)?.groups.orEmpty()
    }
    val sortedVisible = remember(visibleGroups, sortMode) { sortQuestionGroups(visibleGroups, sortMode) }
    val selectedInVisibleOrder = sortedVisible.mapNotNull { QuestionGroupKey.of(it) }.filter { it in selectedKeys }

    BackHandler(enabled = searchOpen || filterPanelOpen) {
        if (filterPanelOpen) filterPanelOpen = false else viewModel.closeSearch()
    }
    LaunchedEffect(groups) {
        if (groups != null) {
            val available = groups.orEmpty().mapNotNull { QuestionGroupKey.of(it) }.toSet()
            selectedKeys = selectedKeys.intersect(available)
        }
    }
    LaunchedEffect(savedCount) {
        if (savedCount > 0) {
            snackbar.showSnackbar("${savedCount.toBengali()} টি প্রশ্ন সংরক্ষিত হয়েছে ✓")
            onSavedShown()
        }
    }
    LaunchedEffect(edited) {
        if (edited) {
            snackbar.showSnackbar("পরিবর্তন সংরক্ষিত হয়েছে ✓")
            onEditedShown()
        }
    }
    LaunchedEffect(deleteMessage) {
        if (deleteMessage.isNotBlank()) {
            snackbar.showSnackbar(deleteMessage)
            viewModel.clearDeleteMessage()
        }
    }

    if (pendingBulkDelete != null) androidx.compose.material3.AlertDialog(
        onDismissRequest = { pendingBulkDelete = null },
        title = { Text("নির্বাচিত কার্ডগুলো মুছবেন?") },
        text = { Text("${pendingBulkDelete!!.size.toBengali()} টি সম্পূর্ণ প্রশ্ন কার্ড এবং সেগুলোর সব উপপ্রশ্ন, Concept ও সংযুক্ত রেকর্ড মুছে যাবে। সংরক্ষিত প্রশ্নপত্রের Snapshot থাকবে, তবে মূল Source Link বিচ্ছিন্ন হবে।") },
        confirmButton = {
            TextButton(onClick = {
                val keys = pendingBulkDelete.orEmpty()
                pendingBulkDelete = null
                selectedKeys = emptySet()
                onBulkDelete(keys)
            }) { Text("সব মুছুন") }
        },
        dismissButton = { TextButton(onClick = { pendingBulkDelete = null }) { Text("বাতিল") } },
    )

    if (showConceptSummary) TypeCqConceptSummaryDialog(
        concepts = conceptSummaries,
        onOpen = { id, text ->
            showConceptSummary = false
            conceptQuestionId = id
            conceptQuestionText = text
        },
        onDismiss = { showConceptSummary = false },
    )
    conceptQuestionOptions?.let { options ->
        TypeCqConceptQuestionPickerDialog(
            questions = options,
            onSelect = { question ->
                conceptQuestionOptions = null
                conceptQuestionId = question.id
                conceptQuestionText = question.text
            },
            onDismiss = { conceptQuestionOptions = null },
        )
    }
    conceptQuestionId?.let { id ->
        TypeCqConceptEditorDialog(
            questionId = id,
            questionText = conceptQuestionText,
            viewModel = viewModel,
            imagePipeline = imagePipeline,
            onDismiss = { conceptQuestionId = null },
        )
    }

    Scaffold(
        topBar = {
            if (searchOpen) {
                Column {
                    SearchHeader(
                        query = query, onQueryChange = viewModel::onQueryChange, onClose = viewModel::closeSearch,
                        onToggleFilters = { filterPanelOpen = !filterPanelOpen },
                        filtersActive = !filter.isEmpty,
                        menuAnchor = {
                            RibbonMenuAnchor(
                                expanded = ribbonMenuOpen, onOpen = { ribbonMenuOpen = true }, onDismiss = { ribbonMenuOpen = false },
                                selectedCount = selectedKeys.size, clipboardCount = clipboardCount, clipboardMode = clipboardMode,
                                onSelectAll = { selectedKeys = sortedVisible.mapNotNull { QuestionGroupKey.of(it) }.toSet(); ribbonMenuOpen = false },
                                onDeselect = { selectedKeys = emptySet(); ribbonMenuOpen = false },
                                onCopy = { viewModel.stageClipboard(selectedInVisibleOrder, TypeCqGroupClipboard.Mode.COPY); ribbonMenuOpen = false },
                                onCut = { viewModel.stageClipboard(selectedInVisibleOrder, TypeCqGroupClipboard.Mode.CUT); ribbonMenuOpen = false },
                                onPaste = { viewModel.pasteClipboard(); ribbonMenuOpen = false },
                                onDelete = { pendingBulkDelete = selectedKeys.toList(); ribbonMenuOpen = false },
                                onAllConcepts = { ribbonMenuOpen = false; scope.launch { conceptSummaries = viewModel.loadConceptSummaries(); showConceptSummary = true } },
                            )
                        },
                    )
                    if (filterPanelOpen) QuestionFilterPanel(
                        filter = filter, boards = boardCatalog, categories = categoryCatalog, types = questionTypeCatalog,
                        onFilterChange = viewModel::changeFilter,
                        sortMode = sortMode, onSortChange = { sortMode = it },
                        sortMenuOpen = sortMenuOpen, onSortMenuOpen = { sortMenuOpen = it },
                    )
                }
            } else {
                Column {
                    AppHeader(
                        title = "Type CQ",
                        onBack = onBack,
                        height = 48.dp,
                        actions = {
                            IconButton(onClick = { filterPanelOpen = !filterPanelOpen }, modifier = Modifier.semantics { contentDescription = "ফিল্টার" }) {
                                EdIconGlyph(EdIcon.FILTER, Color.White, Modifier.size(20.dp))
                            }
                            IconButton(onClick = viewModel::openSearch, modifier = Modifier.semantics { contentDescription = "খুঁজুন" }) {
                                EdIconGlyph(EdIcon.SEARCH, Color.White, Modifier.size(20.dp))
                            }
                            RibbonMenuAnchor(
                                expanded = ribbonMenuOpen,
                                onOpen = { ribbonMenuOpen = true },
                                onDismiss = { ribbonMenuOpen = false },
                                selectedCount = selectedKeys.size,
                                clipboardCount = clipboardCount,
                                clipboardMode = clipboardMode,
                                onSelectAll = { selectedKeys = sortedVisible.mapNotNull { QuestionGroupKey.of(it) }.toSet(); ribbonMenuOpen = false },
                                onDeselect = { selectedKeys = emptySet(); ribbonMenuOpen = false },
                                onCopy = { viewModel.stageClipboard(selectedInVisibleOrder, TypeCqGroupClipboard.Mode.COPY); ribbonMenuOpen = false },
                                onCut = { viewModel.stageClipboard(selectedInVisibleOrder, TypeCqGroupClipboard.Mode.CUT); ribbonMenuOpen = false },
                                onPaste = { viewModel.pasteClipboard(); ribbonMenuOpen = false },
                                onDelete = { pendingBulkDelete = selectedKeys.toList(); ribbonMenuOpen = false },
                                onAllConcepts = { ribbonMenuOpen = false; scope.launch { conceptSummaries = viewModel.loadConceptSummaries(); showConceptSummary = true } },
                            )
                        },
                    )
                    if (filterPanelOpen) QuestionFilterPanel(
                        filter = filter, boards = boardCatalog, categories = categoryCatalog, types = questionTypeCatalog,
                        onFilterChange = viewModel::changeFilter,
                        sortMode = sortMode, onSortChange = { sortMode = it },
                        sortMenuOpen = sortMenuOpen, onSortMenuOpen = { sortMenuOpen = it },
                    )
                }
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
        floatingActionButton = {
            if (!searchOpen) {
                ExtendedFloatingActionButton(
                    onClick = onAdd,
                    modifier = Modifier.width(138.dp).height(36.dp),
                    icon = { Text("+", fontSize = 18.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold) },
                    text = { Text("Add Question", fontSize = 12.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold) },
                    containerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.52f),
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                )
            }
        },
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            Column(Modifier.fillMaxSize()) {
                BreadcrumbLine(
                    breadcrumb = breadcrumb,
                    onHome = onBreadcrumbHome,
                    onSubject = onBreadcrumbSubject,
                    onChapter = onBreadcrumbChapter,
                )
                Row(
                    Modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, top = 0.dp, bottom = 0.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("নির্বাচিত ${selectedKeys.size.toBengali()}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                    androidx.compose.foundation.layout.Spacer(Modifier.weight(1f))
                    Text(
                        "${sortedVisible.size.toBengali()} দৃশ্যমান / ${groups.orEmpty().size.toBengali()} মোট কার্ড",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                val toggleSelection: (String) -> Unit = { key ->
                    selectedKeys = if (key in selectedKeys) selectedKeys - key else selectedKeys + key
                }
                if (showSearch) {
                    SearchBody(
                        state = searchState, isLoading = viewModel.searchPending, boards = boardCatalog, categories = categoryCatalog,
                        onEdit = onEdit, onDelete = onDelete,
                        onCopy = { group -> QuestionGroupKey.of(group)?.let { viewModel.stageClipboard(listOf(it), TypeCqGroupClipboard.Mode.COPY) } },
                        onCut = { group -> QuestionGroupKey.of(group)?.let { viewModel.stageClipboard(listOf(it), TypeCqGroupClipboard.Mode.CUT) } },
                        onPasteBefore = { group -> QuestionGroupKey.of(group)?.let { viewModel.pasteClipboardRelative(it, after = false) } },
                        onPasteAfter = { group -> QuestionGroupKey.of(group)?.let { viewModel.pasteClipboardRelative(it, after = true) } },
                        canPaste = clipboardCount > 0,
                        onView = onView,
                        selectedKeys = selectedKeys, onToggle = toggleSelection, sortedResults = sortedVisible,
                        imagePipeline = imagePipeline,
                        onCategoryChange = viewModel::updateCardCategory,
                        onConcept = { question -> conceptQuestionId = question.id; conceptQuestionText = question.text },
                    )
                } else {
                    ListBody(
                        current = groups?.let { sortedVisible }, boards = boardCatalog, categories = categoryCatalog,
                        onEdit = onEdit, onDelete = onDelete,
                        onCopy = { group -> QuestionGroupKey.of(group)?.let { viewModel.stageClipboard(listOf(it), TypeCqGroupClipboard.Mode.COPY) } },
                        onCut = { group -> QuestionGroupKey.of(group)?.let { viewModel.stageClipboard(listOf(it), TypeCqGroupClipboard.Mode.CUT) } },
                        onPasteBefore = { group -> QuestionGroupKey.of(group)?.let { viewModel.pasteClipboardRelative(it, after = false) } },
                        onPasteAfter = { group -> QuestionGroupKey.of(group)?.let { viewModel.pasteClipboardRelative(it, after = true) } },
                        canPaste = clipboardCount > 0,
                        onView = onView,
                        selectedKeys = selectedKeys, onToggle = toggleSelection, imagePipeline = imagePipeline,
                        onCategoryChange = viewModel::updateCardCategory,
                        onConcept = { question -> conceptQuestionId = question.id; conceptQuestionText = question.text },
                    )
                }
            }
        }
    }
}

@Composable
private fun RibbonMenu(
    expanded: Boolean,
    onDismiss: () -> Unit,
    selectedCount: Int,
    clipboardCount: Int,
    clipboardMode: TypeCqGroupClipboard.Mode,
    onSelectAll: () -> Unit,
    onDeselect: () -> Unit,
    onCopy: () -> Unit,
    onCut: () -> Unit,
    onPaste: () -> Unit,
    onDelete: () -> Unit,
    onAllConcepts: () -> Unit,
) {
    DropdownMenu(expanded = expanded, onDismissRequest = onDismiss) {
        DropdownMenuItem(text = { Text("Select All") }, onClick = onSelectAll)
        if (selectedCount > 0) DropdownMenuItem(text = { Text("Deselect") }, onClick = onDeselect)
        DropdownMenuItem(text = { Text("Copy (${selectedCount.toBengali()})") }, enabled = selectedCount > 0, onClick = onCopy)
        DropdownMenuItem(text = { Text("Cut (${selectedCount.toBengali()})") }, enabled = selectedCount > 0, onClick = onCut)
        if (clipboardCount > 0) DropdownMenuItem(
            text = { Text("Paste (${clipboardCount.toBengali()}) · ${if (clipboardMode == TypeCqGroupClipboard.Mode.CUT) "Cut" else "Copy"}") },
            onClick = onPaste,
        )
        if (selectedCount > 0) DropdownMenuItem(
            text = { Text("Delete (${selectedCount.toBengali()})", color = MaterialTheme.colorScheme.error) },
            onClick = onDelete,
        )
        androidx.compose.material3.HorizontalDivider()
        DropdownMenuItem(text = { Text("সব Concept দেখুন") }, onClick = onAllConcepts)
        DropdownMenuItem(
            text = { Text("ফোল্ডার থেকে প্রশ্ন যোগ করুন") },
            enabled = false,
            onClick = onDismiss,
        )
    }
}

@Composable
private fun RibbonMenuAnchor(
    expanded: Boolean,
    onOpen: () -> Unit,
    onDismiss: () -> Unit,
    selectedCount: Int,
    clipboardCount: Int,
    clipboardMode: TypeCqGroupClipboard.Mode,
    onSelectAll: () -> Unit,
    onDeselect: () -> Unit,
    onCopy: () -> Unit,
    onCut: () -> Unit,
    onPaste: () -> Unit,
    onDelete: () -> Unit,
    onAllConcepts: () -> Unit,
) {
    Box {
        IconButton(onClick = onOpen, modifier = Modifier.semantics { contentDescription = "Type CQ-এর আরও বিকল্প" }) {
            Text("⋮", fontSize = 22.sp)
        }
        RibbonMenu(
            expanded = expanded, onDismiss = onDismiss,
            selectedCount = selectedCount, clipboardCount = clipboardCount, clipboardMode = clipboardMode,
            onSelectAll = onSelectAll, onDeselect = onDeselect, onCopy = onCopy, onCut = onCut,
            onPaste = onPaste, onDelete = onDelete, onAllConcepts = onAllConcepts,
        )
    }
}

@Composable
private fun BreadcrumbLine(
    breadcrumb: com.questionbank.app.domain.question.QuestionBreadcrumb?,
    onHome: () -> Unit,
    onSubject: () -> Unit,
    onChapter: () -> Unit,
) {
    val scrollState = rememberScrollState()
    val breadcrumbKey = listOf(
        breadcrumb?.subjectId, breadcrumb?.chapterId, breadcrumb?.topicId,
        breadcrumb?.subjectName, breadcrumb?.chapterName, breadcrumb?.topicName,
    )
    LaunchedEffect(breadcrumbKey) {
        androidx.compose.runtime.withFrameNanos { }
        scrollState.animateScrollTo(scrollState.maxValue)
    }
    data class Item(val label: String, val isCurrent: Boolean, val action: (() -> Unit)?)
    val items = buildList {
        add(Item("🏠", false, onHome))
        breadcrumb?.let { path ->
            fun serial(order: Long, name: String) = "${order.toString().padStart(2, '0').toBengaliDigits()}. $name"
            add(Item(serial(path.subjectOrder, path.subjectName), false, onSubject))
            add(Item(serial(path.chapterOrder, path.chapterName), false, onChapter))
            add(Item(serial(path.topicOrder, path.topicName), true, null))
        }
    }
    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(scrollState).padding(horizontal = 8.dp, vertical = 1.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        items.forEachIndexed { index, item ->
            if (index > 0) Text("›", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
            TextButton(
                onClick = { item.action?.invoke() },
                enabled = !item.isCurrent && item.action != null,
                contentPadding = PaddingValues(horizontal = 7.dp, vertical = 1.dp),
            ) {
                Text(
                    item.label,
                    style = MaterialTheme.typography.labelMedium,
                    color = if (item.isCurrent) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.primary,
                    fontWeight = if (item.isCurrent) androidx.compose.ui.text.font.FontWeight.Bold else androidx.compose.ui.text.font.FontWeight.Medium,
                    maxLines = 1,
                )
            }
        }
    }
}

@Composable
private fun ListBody(
    current: List<SavedGroup>?,
    boards: List<BoardItem>,
    categories: List<TypeCqQuestionCategoriesEntity>,
    onEdit: (SavedGroup) -> Unit,
    onDelete: (SavedGroup) -> Unit,
    onCopy: (SavedGroup) -> Unit,
    onCut: (SavedGroup) -> Unit,
    onPasteBefore: (SavedGroup) -> Unit,
    onPasteAfter: (SavedGroup) -> Unit,
    canPaste: Boolean,
    onView: (SavedGroup) -> Unit,
    selectedKeys: Set<String>,
    onToggle: (String) -> Unit,
    imagePipeline: ImagePipeline,
    onCategoryChange: (String, String?) -> Unit,
    onConcept: (SavedSubQuestion) -> Unit,
) {
    when {
        current == null -> Box(Modifier.fillMaxSize()) { CircularProgressIndicator(modifier = Modifier.align(Alignment.Center)) }
        current.isEmpty() -> Box(Modifier.fillMaxSize()) {
            Text("এই টপিকে এখনো কোনো প্রশ্ন নেই।", modifier = Modifier.align(Alignment.Center).padding(24.dp), style = MaterialTheme.typography.bodyLarge)
        }
        else -> CardList(current, boards, categories, onEdit, onDelete, onCopy, onCut, onPasteBefore, onPasteAfter, canPaste, onView, selectedKeys, onToggle, imagePipeline, onCategoryChange, onConcept)
    }
}

@Composable
private fun SearchBody(
    state: SearchUiState,
    isLoading: Boolean,
    boards: List<BoardItem>,
    categories: List<TypeCqQuestionCategoriesEntity>,
    onEdit: (SavedGroup) -> Unit,
    onDelete: (SavedGroup) -> Unit,
    onCopy: (SavedGroup) -> Unit,
    onCut: (SavedGroup) -> Unit,
    onPasteBefore: (SavedGroup) -> Unit,
    onPasteAfter: (SavedGroup) -> Unit,
    canPaste: Boolean,
    onView: (SavedGroup) -> Unit,
    selectedKeys: Set<String>,
    onToggle: (String) -> Unit,
    sortedResults: List<SavedGroup>,
    imagePipeline: ImagePipeline,
    onCategoryChange: (String, String?) -> Unit,
    onConcept: (SavedSubQuestion) -> Unit,
) {
    when {
        isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        else -> when (state) {
        SearchUiState.Idle -> Unit
        SearchUiState.NoTerms -> Message("খোঁজার জন্য অক্ষর বা সংখ্যা লিখুন।")
        is SearchUiState.Failed -> Message("খোঁজা যায়নি। আবার চেষ্টা করুন।", isError = true)
        is SearchUiState.Results -> if (sortedResults.isEmpty()) Message("কোনো প্রশ্ন পাওয়া যায়নি।") else
            CardList(sortedResults, boards, categories, onEdit, onDelete, onCopy, onCut, onPasteBefore, onPasteAfter, canPaste, onView, selectedKeys, onToggle, imagePipeline, onCategoryChange, onConcept)
        }
    }
}

@Composable
private fun CardList(
    groups: List<SavedGroup>,
    boards: List<BoardItem>,
    categories: List<TypeCqQuestionCategoriesEntity>,
    onEdit: (SavedGroup) -> Unit,
    onDelete: (SavedGroup) -> Unit,
    onCopy: (SavedGroup) -> Unit,
    onCut: (SavedGroup) -> Unit,
    onPasteBefore: (SavedGroup) -> Unit,
    onPasteAfter: (SavedGroup) -> Unit,
    canPaste: Boolean,
    onView: (SavedGroup) -> Unit,
    selectedKeys: Set<String>,
    onToggle: (String) -> Unit,
    imagePipeline: ImagePipeline,
    onCategoryChange: (String, String?) -> Unit,
    onConcept: (SavedSubQuestion) -> Unit,
) {
    val pageSize = 40
    var shown by remember(groups) { mutableStateOf(pageSize) }
    val page = groups.take(shown)
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 6.dp, bottom = 96.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        itemsIndexed(page, key = { _, group -> QuestionGroupKey.of(group) ?: group.subQuestions.first().id }) { index, group ->
            val key = QuestionGroupKey.of(group).orEmpty()
            QuestionCard(
                number = index + 1,
                group = group,
                boards = boards,
                categories = categories,
                imagePipeline = imagePipeline,
                selected = key in selectedKeys,
                onToggleSelected = { onToggle(key) },
                onEdit = { onEdit(group) },
                onDelete = { onDelete(group) },
                onCopy = { onCopy(group) },
                onCut = { onCut(group) },
                onPasteBefore = { onPasteBefore(group) },
                onPasteAfter = { onPasteAfter(group) },
                canPaste = canPaste,
                onView = { onView(group) },
                onQuestionCategoryChange = onCategoryChange,
                onQuestionConcept = onConcept,
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
    "RATING" -> groups.sortedWith(compareByDescending<SavedGroup> { QuestionCardRules.rating(it) }.thenBy { it.stimulusId ?: it.subQuestions.firstOrNull()?.id.orEmpty() })
    "MARKS" -> groups.sortedWith(compareByDescending<SavedGroup> { it.subQuestions.sumOf { q -> q.marks } }.thenBy { it.stimulusId ?: it.subQuestions.firstOrNull()?.id.orEmpty() })
    "TYPE" -> groups.sortedWith(compareBy<SavedGroup> { it.subQuestions.firstOrNull()?.questionTypeId.orEmpty() }.thenBy { it.stimulusId ?: it.subQuestions.firstOrNull()?.id.orEmpty() })
    else -> groups
}

@Composable
private fun SearchHeader(
    query: String,
    onQueryChange: (String) -> Unit,
    onClose: () -> Unit,
    onToggleFilters: () -> Unit,
    filtersActive: Boolean,
    menuAnchor: @Composable () -> Unit,
) {
    val container = if (LocalDarkTheme.current) HeaderDark else HeaderLight
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    Surface(color = container, contentColor = Color.White, modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.windowInsetsPadding(WindowInsets.statusBars).height(48.dp).padding(horizontal = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onClose, modifier = Modifier.semantics { contentDescription = "খোঁজা বন্ধ করুন" }) {
                Text("←", fontSize = 20.sp, color = Color.White)
            }
            IconButton(onClick = onToggleFilters, modifier = Modifier.semantics { contentDescription = "ফিল্টার" }) {
                EdIconGlyph(EdIcon.FILTER, if (filtersActive) Color(0xFFFFE082) else Color.White, Modifier.size(19.dp))
            }
            TextField(
                value = query,
                onValueChange = onQueryChange,
                modifier = Modifier.weight(1f).focusRequester(focus),
                singleLine = true,
                placeholder = { Text("প্রশ্ন বা উদ্দীপক খুঁজুন…", fontSize = 13.sp) },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = Color.Transparent,
                    unfocusedContainerColor = Color.Transparent,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White,
                    cursorColor = Color.White,
                    focusedPlaceholderColor = Color(0xFFDCE3FF),
                    unfocusedPlaceholderColor = Color(0xFFDCE3FF),
                ),
            )
            if (query.isNotEmpty()) IconButton(onClick = { onQueryChange("") }, modifier = Modifier.semantics { contentDescription = "লেখা মুছুন" }) {
                Text("✕", fontSize = 17.sp, color = Color.White)
            }
            menuAnchor()
        }
    }
}

@Composable
private fun QuestionFilterPanel(
    filter: BoardFilter,
    boards: List<BoardItem>,
    categories: List<TypeCqQuestionCategoriesEntity>,
    types: List<com.questionbank.app.data.local.entity.TypeCqQuestionTypesEntity>,
    onFilterChange: (BoardFilter) -> Unit,
    sortMode: String,
    onSortChange: (String) -> Unit,
    sortMenuOpen: Boolean,
    onSortMenuOpen: (Boolean) -> Unit,
) {
    Surface(color = MaterialTheme.colorScheme.surface, tonalElevation = 3.dp, shadowElevation = 2.dp) {
        Column(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("ফিল্টার ও সাজানো", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                androidx.compose.foundation.layout.Spacer(Modifier.weight(1f))
                if (!filter.isEmpty || sortMode != "DEFAULT") {
                    TextButton(onClick = { onFilterChange(BoardFilter()); onSortChange("DEFAULT") }, contentPadding = PaddingValues(horizontal = 6.dp, vertical = 0.dp)) {
                        Text("সব মুছুন", fontSize = 11.sp)
                    }
                }
            }
            BoardFilterBar(filter = filter, boards = boards, onChange = onFilterChange)
            QuestionFilterBar(filter = filter, categories = categories, types = types, onChange = onFilterChange)
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = { onSortMenuOpen(true) }, contentPadding = PaddingValues(horizontal = 6.dp, vertical = 1.dp)) {
                    EdIconGlyph(EdIcon.SORT, MaterialTheme.colorScheme.primary, Modifier.size(16.dp))
                    Text("সাজান: ${when (sortMode) { "RATING" -> "রেটিং"; "MARKS" -> "নম্বর"; "TYPE" -> "প্রশ্নের ধরন"; else -> "ডিফল্ট" }}", fontSize = 11.sp)
                }
                DropdownMenu(expanded = sortMenuOpen, onDismissRequest = { onSortMenuOpen(false) }) {
                    listOf("DEFAULT" to "ডিফল্ট ক্রম", "RATING" to "রেটিং বেশি আগে", "MARKS" to "মোট নম্বর বেশি আগে", "TYPE" to "প্রশ্নের ধরন").forEach { (key, label) ->
                        DropdownMenuItem(text = { Text(label) }, onClick = { onSortChange(key); onSortMenuOpen(false) })
                    }
                }
            }
        }
    }
}

@Composable
private fun Message(text: String, isError: Boolean = false) {
    Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
        Text(text, color = if (isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
