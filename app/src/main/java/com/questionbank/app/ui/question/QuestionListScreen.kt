package com.questionbank.app.ui.question

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
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
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.domain.question.QuestionGroupKey
import com.questionbank.app.domain.question.QuestionCardRules
import com.questionbank.app.media.ImagePipeline
import com.questionbank.app.ui.components.AppHeader
import com.questionbank.app.ui.format.toBengali
import com.questionbank.app.ui.format.toBengaliDigits
import com.questionbank.app.ui.theme.HeaderDark
import com.questionbank.app.ui.theme.HeaderLight
import com.questionbank.app.ui.theme.LocalDarkTheme

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
) {
    val groups by viewModel.groups.collectAsState()
    val topicName by viewModel.topicName.collectAsState()
    val searchState by viewModel.searchState.collectAsState()
    val boardCatalog by viewModel.boardCatalog.collectAsState()
    val categoryCatalog by viewModel.categoryCatalog.collectAsState()
    val questionTypeCatalog by viewModel.questionTypeCatalog.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    val deleteMessage = viewModel.deleteMessage
    var selectedKeys by remember { mutableStateOf(emptySet<String>()) }
    var sortMode by remember { mutableStateOf("DEFAULT") }
    var sortMenuOpen by remember { mutableStateOf(false) }
    var pendingBulkDelete by remember { mutableStateOf<List<String>?>(null) }

    val searchOpen = viewModel.searchOpen
    val query = viewModel.query
    // Search results replace the list only while the text is not empty (or a board / year filter is on) and its first result has arrived; otherwise the normal list stays.
    val filter = viewModel.filter
    val showSearch = searchOpen && (query.isNotBlank() || !filter.isEmpty) && searchState != SearchUiState.Idle

    // Back closes the search first (the innermost handler wins over the navigation Back).
    BackHandler(enabled = searchOpen) { viewModel.closeSearch() }
    LaunchedEffect(groups, selectedKeys) {
        if (groups != null) {
            val available = groups.orEmpty().mapNotNull { QuestionGroupKey.of(it) }.toSet()
            if (!available.containsAll(selectedKeys)) selectedKeys = selectedKeys.intersect(available)
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
        text = { Text("${pendingBulkDelete!!.size.toBengali()} টি সম্পূর্ণ প্রশ্ন কার্ড এবং সেগুলোর সব sub-question মুছে যাবে। সার্চ বা ফিল্টারে আংশিক দেখা গেলেও সম্পূর্ণ কার্ড মুছবে। সংরক্ষিত প্রশ্নপত্রে ব্যবহৃত কোনো প্রশ্ন থাকলে পুরো delete batch বাতিল হবে।") },
        confirmButton = { TextButton(onClick = { val keys = pendingBulkDelete.orEmpty(); pendingBulkDelete = null; selectedKeys = emptySet(); onBulkDelete(keys) }) { Text("সব মুছুন") } },
        dismissButton = { TextButton(onClick = { pendingBulkDelete = null }) { Text("বাতিল") } },
    )

    Scaffold(
        topBar = {
            if (searchOpen) {
                Column {
                    SearchHeader(query = query, onQueryChange = viewModel::onQueryChange, onClose = viewModel::closeSearch)
                    BoardFilterBar(filter = filter, boards = boardCatalog, onChange = viewModel::changeFilter)
                    QuestionFilterBar(filter = filter, categories = categoryCatalog, types = questionTypeCatalog, onChange = viewModel::changeFilter)
                }
            } else {
                AppHeader(
                    title = if (topicName.isNullOrEmpty()) "প্রশ্ন" else "$topicName › প্রশ্ন",
                    onBack = onBack,
                    actions = {
                        IconButton(
                            onClick = viewModel::openSearch,
                            modifier = Modifier.semantics { contentDescription = "খুঁজুন" },
                        ) { Text("🔍", fontSize = 18.sp) }
                    },
                )
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
        floatingActionButton = {
            if (!searchOpen) {
                ExtendedFloatingActionButton(
                    onClick = onAdd,
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                ) { Text("+ প্রশ্ন যোগ করুন") }
            }
        },
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            Column(Modifier.fillMaxSize()) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = { sortMenuOpen = true }) { Text("সাজান: ${when (sortMode) { "RATING" -> "রেটিং"; "MARKS" -> "নম্বর"; "TYPE" -> "প্রশ্নের ধরন"; else -> "ডিফল্ট" }}") }
                    DropdownMenu(expanded = sortMenuOpen, onDismissRequest = { sortMenuOpen = false }) {
                        listOf("DEFAULT" to "ডিফল্ট ক্রম", "RATING" to "রেটিং বেশি আগে", "MARKS" to "মোট নম্বর বেশি আগে", "TYPE" to "প্রশ্নের ধরন").forEach { (key, label) ->
                            DropdownMenuItem(text = { Text(label) }, onClick = { sortMode = key; sortMenuOpen = false })
                        }
                    }
                    Text("নির্বাচিত ${selectedKeys.size.toBengali()}", style = MaterialTheme.typography.labelMedium)
                    if (selectedKeys.isNotEmpty()) Button(onClick = { pendingBulkDelete = selectedKeys.toList() }) { Text("নির্বাচিত মুছুন") }
                }
                val visibleGroups = if (showSearch) (searchState as? SearchUiState.Results)?.groups.orEmpty() else groups.orEmpty()
                val sortedVisible = remember(visibleGroups, sortMode) { sortQuestionGroups(visibleGroups, sortMode) }
                val toggleSelection: (String) -> Unit = { key -> selectedKeys = if (key in selectedKeys) selectedKeys - key else selectedKeys + key }
                if (showSearch) SearchBody(searchState, boardCatalog, imagePipeline, onEdit, onDelete, onCopy, onView, selectedKeys, toggleSelection, sortedVisible)
                else ListBody(if (groups == null) null else sortedVisible, boardCatalog, imagePipeline, onEdit, onDelete, onCopy, onView, selectedKeys, toggleSelection)
            }
        }
    }
}

@Composable
private fun ListBody(
    current: List<SavedGroup>?, boards: List<BoardItem>, imagePipeline: ImagePipeline, onEdit: (SavedGroup) -> Unit, onDelete: (SavedGroup) -> Unit,
    onCopy: (SavedGroup) -> Unit, onView: (SavedGroup) -> Unit, selectedKeys: Set<String>, onToggle: (String) -> Unit,
) {
    when {
        current == null -> Box(Modifier.fillMaxSize()) { CircularProgressIndicator(modifier = Modifier.align(Alignment.Center)) }
        current.isEmpty() -> Box(Modifier.fillMaxSize()) {
            Text("এই টপিকে এখনো কোনো প্রশ্ন নেই।", modifier = Modifier.align(Alignment.Center).padding(24.dp), style = MaterialTheme.typography.bodyLarge)
        }
        else -> CardList(current, totalLine(current), boards, imagePipeline, onEdit, onDelete, onCopy, onView, selectedKeys, onToggle)
    }
}

@Composable
private fun SearchBody(
    state: SearchUiState, boards: List<BoardItem>, imagePipeline: ImagePipeline, onEdit: (SavedGroup) -> Unit, onDelete: (SavedGroup) -> Unit,
    onCopy: (SavedGroup) -> Unit, onView: (SavedGroup) -> Unit, selectedKeys: Set<String>, onToggle: (String) -> Unit, sortedResults: List<SavedGroup>,
) {
    when (state) {
        SearchUiState.Idle -> Unit
        SearchUiState.NoTerms -> Message("খোঁজার জন্য অক্ষর বা সংখ্যা লিখুন।")
        is SearchUiState.Failed -> Message("খোঁজা যায়নি। আবার চেষ্টা করুন।", isError = true)
        is SearchUiState.Results -> if (sortedResults.isEmpty()) Message("কোনো প্রশ্ন পাওয়া যায়নি.") else
            CardList(sortedResults, foundLine(sortedResults), boards, imagePipeline, onEdit, onDelete, onCopy, onView, selectedKeys, onToggle)
    }
}

@Composable
private fun CardList(
    groups: List<SavedGroup>, headline: String, boards: List<BoardItem>, imagePipeline: ImagePipeline, onEdit: (SavedGroup) -> Unit, onDelete: (SavedGroup) -> Unit,
    onCopy: (SavedGroup) -> Unit, onView: (SavedGroup) -> Unit, selectedKeys: Set<String>, onToggle: (String) -> Unit,
) {
    val pageSize = 40
    var shown by remember(groups) { mutableStateOf(pageSize) }
    val page = groups.take(shown)
    LazyColumn(
        modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 96.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item(key = "count") { Text("$headline · ${groups.size.toBengali()} টি", style = MaterialTheme.typography.labelLarge) }
        itemsIndexed(page, key = { _, group -> QuestionGroupKey.of(group) ?: group.subQuestions.first().id }) { index, group ->
            val key = QuestionGroupKey.of(group).orEmpty()
            QuestionCard(
                number = index + 1,
                group = group,
                boards = boards,
                imagePipeline = imagePipeline,
                selected = key in selectedKeys,
                onToggleSelected = { onToggle(key) },
                onEdit = { onEdit(group) },
                onDelete = { onDelete(group) },
                onCopy = { onCopy(group) },
                onView = { onView(group) },
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

/** Header while searching: back arrow (closes the search), the text box with the keyboard open at once, and a clear button. */
@Composable
private fun SearchHeader(query: String, onQueryChange: (String) -> Unit, onClose: () -> Unit) {
    val container = if (LocalDarkTheme.current) HeaderDark else HeaderLight
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    Surface(color = container, contentColor = Color.White, modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .windowInsetsPadding(WindowInsets.statusBars)
                .height(56.dp)
                .padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onClose, modifier = Modifier.semantics { contentDescription = "খোঁজা বন্ধ করুন" }) {
                Text("←", fontSize = 22.sp, color = Color.White)
            }
            TextField(
                value = query,
                onValueChange = onQueryChange,
                modifier = Modifier.weight(1f).focusRequester(focus),
                singleLine = true,
                placeholder = { Text("প্রশ্ন বা উদ্দীপক খুঁজুন...", fontSize = 14.sp) },
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
            if (query.isNotEmpty()) {
                IconButton(onClick = { onQueryChange("") }, modifier = Modifier.semantics { contentDescription = "লেখা মুছুন" }) {
                    Text("✕", fontSize = 18.sp, color = Color.White)
                }
            }
        }
    }
}

@Composable
private fun Message(text: String, isError: Boolean = false) {
    Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
        Text(
            text,
            color = if (isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
