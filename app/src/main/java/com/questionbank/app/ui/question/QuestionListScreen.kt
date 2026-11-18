package com.questionbank.app.ui.question

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
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
import com.questionbank.app.domain.question.SavedGroup
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
    onAdd: () -> Unit,
    onBack: () -> Unit,
) {
    val groups by viewModel.groups.collectAsState()
    val topicName by viewModel.topicName.collectAsState()
    val searchState by viewModel.searchState.collectAsState()
    val snackbar = remember { SnackbarHostState() }

    val searchOpen = viewModel.searchOpen
    val query = viewModel.query
    // Search results replace the list only while the text is not empty and its first result has arrived; otherwise the normal list stays.
    val showSearch = searchOpen && query.isNotBlank() && searchState != SearchUiState.Idle

    // Back closes the search first (the innermost handler wins over the navigation Back).
    BackHandler(enabled = searchOpen) { viewModel.closeSearch() }

    LaunchedEffect(savedCount) {
        if (savedCount > 0) {
            snackbar.showSnackbar("${savedCount.toBengali()} টি প্রশ্ন সংরক্ষিত হয়েছে ✓")
            onSavedShown()
        }
    }

    Scaffold(
        topBar = {
            if (searchOpen) {
                SearchHeader(query = query, onQueryChange = viewModel::onQueryChange, onClose = viewModel::closeSearch)
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
            if (showSearch) {
                SearchBody(searchState)
            } else {
                ListBody(groups)
            }
        }
    }
}

@Composable
private fun ListBody(current: List<SavedGroup>?) {
    when {
        current == null -> Box(Modifier.fillMaxSize()) { CircularProgressIndicator(modifier = Modifier.align(Alignment.Center)) }
        current.isEmpty() -> Box(Modifier.fillMaxSize()) {
            Text(
                "এই টপিকে এখনো কোনো প্রশ্ন নেই।",
                modifier = Modifier.align(Alignment.Center).padding(24.dp),
                style = MaterialTheme.typography.bodyLarge,
            )
        }
        else -> CardList(current, totalLine(current))
    }
}

@Composable
private fun SearchBody(state: SearchUiState) {
    when (state) {
        SearchUiState.Idle -> Unit
        SearchUiState.NoTerms -> Message("খোঁজার জন্য অক্ষর বা সংখ্যা লিখুন।")
        is SearchUiState.Failed -> Message("খোঁজা যায়নি। আবার চেষ্টা করুন।", isError = true)
        is SearchUiState.Results ->
            if (state.groups.isEmpty()) Message("কোনো প্রশ্ন পাওয়া যায়নি।") else CardList(state.groups, foundLine(state.groups))
    }
}

@Composable
private fun Message(text: String, isError: Boolean = false) {
    Box(Modifier.fillMaxSize()) {
        Text(
            text,
            modifier = Modifier.align(Alignment.Center).padding(24.dp),
            style = MaterialTheme.typography.bodyLarge,
            color = if (isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun CardList(groups: List<SavedGroup>, headline: String) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 96.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item(key = "count") {
            Text(headline, style = MaterialTheme.typography.labelLarge)
        }
        itemsIndexed(groups, key = { _, group -> group.stimulusId ?: group.subQuestions.first().id }) { index, group ->
            QuestionCard(number = index + 1, group = group)
        }
    }
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
