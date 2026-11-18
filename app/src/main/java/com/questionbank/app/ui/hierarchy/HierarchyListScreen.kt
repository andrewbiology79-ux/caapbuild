package com.questionbank.app.ui.hierarchy

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.questionbank.app.domain.hierarchy.HierarchyItem
import com.questionbank.app.domain.hierarchy.HierarchyName
import com.questionbank.app.domain.hierarchy.HierarchyRow
import com.questionbank.app.ui.components.AppHeader
import com.questionbank.app.ui.format.bengaliSerial
import com.questionbank.app.ui.format.toBengali

/** Texts that differ between the subject, chapter and topic lists. [childUnit] is null for topics (nothing below a topic but questions). */
data class HierarchyLabels(
    val title: String,
    val addButton: String,
    val dialogTitle: String,
    val renameTitle: String,
    val totalLabel: String,
    val childUnit: String?,
)

private fun problemText(problem: HierarchyProblem?): String? = when (problem) {
    null -> null
    HierarchyProblem.BLANK -> "নাম খালি রাখা যাবে না।"
    HierarchyProblem.TOO_LONG -> "নাম ${HierarchyName.MAX_LENGTH.toBengali()} অক্ষরের বেশি হতে পারবে না।"
    HierarchyProblem.DUPLICATE -> "এই নামে আগেই আছে।"
    HierarchyProblem.NOT_FOUND -> "আইটেমটি আর নেই। ফিরে গিয়ে আবার চেষ্টা করুন।"
    HierarchyProblem.FAILED -> "সংরক্ষণ করা যায়নি।"
}

/**
 * Subject / chapter / topic list (plan 39.3, UI-02 and UI-03): breadcrumb, total counter, cards with serial, counts,
 * rename and delete in a 3-dot menu, and a reorder mode with up/down arrows that saves the order once, on "সংরক্ষণ".
 * [onCrumbClick] gets the index in [breadcrumb][rootCrumb + ancestors]; the last crumb is the current list and is not tappable.
 */
@Composable
fun HierarchyListScreen(
    viewModel: HierarchyListViewModel,
    labels: HierarchyLabels,
    onItemClick: ((HierarchyItem) -> Unit)?,
    onBack: (() -> Unit)?,
    onCrumbClick: (Int) -> Unit = {},
    rootCrumb: String = "বিষয় তালিকা",
) {
    val listState by viewModel.items.collectAsState()
    val ancestors by viewModel.ancestors.collectAsState()
    val problem by viewModel.problem.collectAsState()
    val message by viewModel.message.collectAsState()

    var showAdd by rememberSaveable { mutableStateOf(false) }
    var addText by rememberSaveable { mutableStateOf("") }
    var renameId by rememberSaveable { mutableStateOf<String?>(null) }
    var renameText by rememberSaveable { mutableStateOf("") }
    var deleteId by rememberSaveable { mutableStateOf<String?>(null) }
    // Non-null = reorder mode; holds the order being edited. Lost on rotation (the saved database order shows again).
    var working by remember { mutableStateOf<List<HierarchyRow>?>(null) }
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(message) {
        val text = message
        if (text != null) {
            snackbar.showSnackbar(text)
            viewModel.clearMessage()
        }
    }

    // Back leaves reorder mode without saving (the innermost handler wins over the app-level exit question).
    BackHandler(enabled = working != null) { working = null }

    Scaffold(
        topBar = {
            AppHeader(title = labels.title, subtitle = ancestors.lastOrNull(), onBack = onBack)
        },
        snackbarHost = { SnackbarHost(snackbar) },
        floatingActionButton = {
            if (working == null) {
                ExtendedFloatingActionButton(
                    onClick = {
                        addText = ""
                        viewModel.clearProblem()
                        showAdd = true
                    },
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                ) { Text(labels.addButton) }
            }
        },
    ) { innerPadding ->
        val current = listState
        Column(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            Breadcrumb(crumbs = listOf(rootCrumb) + ancestors, onCrumbClick = onCrumbClick)

            if (current != null) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        "${labels.totalLabel}: ${current.size.toBengali()} টি",
                        style = MaterialTheme.typography.labelLarge,
                    )
                    val editing = working
                    if (editing == null) {
                        if (current.size > 1) {
                            TextButton(onClick = { working = current }) { Text("ক্রম পরিবর্তন") }
                        }
                    } else {
                        Row {
                            TextButton(onClick = { working = null }) { Text("বাতিল") }
                            TextButton(onClick = {
                                viewModel.reorder(editing.map { it.id }) { working = null }
                            }) { Text("ক্রম সংরক্ষণ") }
                        }
                    }
                }
            }

            Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                val shown = working ?: current
                when {
                    shown == null -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                    shown.isEmpty() -> Text(
                        "এখনো কিছু যোগ করা হয়নি।",
                        modifier = Modifier.align(Alignment.Center).padding(24.dp),
                        style = MaterialTheme.typography.bodyLarge,
                    )
                    else -> LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 96.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        itemsIndexed(shown, key = { _, row -> row.id }) { index, row ->
                            HierarchyCard(
                                serial = index + 1,
                                row = row,
                                childUnit = labels.childUnit,
                                reorderMode = working != null,
                                canMoveUp = index > 0,
                                canMoveDown = index < shown.lastIndex,
                                onClick = onItemClick?.let { click -> { click(HierarchyItem(row.id, row.name)) } },
                                onMoveUp = { working = shown.moved(index, -1) },
                                onMoveDown = { working = shown.moved(index, +1) },
                                onRename = {
                                    renameText = row.name
                                    viewModel.clearProblem()
                                    renameId = row.id
                                },
                                onDelete = { deleteId = row.id },
                            )
                        }
                    }
                }
            }
        }
    }

    if (showAdd) {
        NameDialog(
            title = labels.dialogTitle,
            confirmLabel = "যোগ করুন",
            text = addText,
            onTextChange = {
                addText = it
                if (problem != null) viewModel.clearProblem()
            },
            problem = problem,
            onConfirm = { viewModel.add(addText) { showAdd = false } },
            onDismiss = { showAdd = false },
        )
    }

    val renameRow = listState?.firstOrNull { it.id == renameId }
    if (renameId != null && renameRow != null) {
        NameDialog(
            title = labels.renameTitle,
            confirmLabel = "সংরক্ষণ",
            text = renameText,
            onTextChange = {
                renameText = it
                if (problem != null) viewModel.clearProblem()
            },
            problem = problem,
            onConfirm = { viewModel.rename(renameRow.id, renameText) { renameId = null } },
            onDismiss = { renameId = null },
        )
    }

    val deleteRow = listState?.firstOrNull { it.id == deleteId }
    if (deleteId != null && deleteRow != null) {
        if (deleteRow.isEmpty) {
            AlertDialog(
                onDismissRequest = { deleteId = null },
                title = { Text("মুছে ফেলবেন?") },
                text = { Text("‘${deleteRow.name}’ স্থায়ীভাবে মুছে যাবে।") },
                confirmButton = {
                    TextButton(onClick = {
                        deleteId = null
                        viewModel.delete(deleteRow.id)
                    }) { Text("মুছে ফেলুন", color = MaterialTheme.colorScheme.error) }
                },
                dismissButton = { TextButton(onClick = { deleteId = null }) { Text("বাতিল") } },
            )
        } else {
            AlertDialog(
                onDismissRequest = { deleteId = null },
                title = { Text("মুছে ফেলা যাবে না") },
                text = { Text(blockedDeleteText(deleteRow, labels.childUnit)) },
                confirmButton = { TextButton(onClick = { deleteId = null }) { Text("ঠিক আছে") } },
            )
        }
    }
}

@Composable
private fun NameDialog(
    title: String,
    confirmLabel: String,
    text: String,
    onTextChange: (String) -> Unit,
    problem: HierarchyProblem?,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            OutlinedTextField(
                value = text,
                onValueChange = onTextChange,
                singleLine = true,
                isError = problem != null,
                supportingText = { problemText(problem)?.let { Text(it) } },
            )
        },
        confirmButton = { TextButton(onClick = onConfirm) { Text(confirmLabel) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("বাতিল") } },
    )
}

/** Horizontally scrollable path; every crumb but the last is tappable. */
@Composable
private fun Breadcrumb(crumbs: List<String>, onCrumbClick: (Int) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        crumbs.forEachIndexed { index, label ->
            if (index > 0) {
                Text(
                    "›",
                    modifier = Modifier.padding(horizontal = 6.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (index == crumbs.lastIndex) {
                Text(label, fontWeight = FontWeight.Bold, maxLines = 1)
            } else {
                Text(
                    label,
                    color = MaterialTheme.colorScheme.primary,
                    maxLines = 1,
                    modifier = Modifier.clickable { onCrumbClick(index) }.padding(vertical = 4.dp),
                )
            }
        }
    }
}

@Composable
private fun HierarchyCard(
    serial: Int,
    row: HierarchyRow,
    childUnit: String?,
    reorderMode: Boolean,
    canMoveUp: Boolean,
    canMoveDown: Boolean,
    onClick: (() -> Unit)?,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit,
    onRename: () -> Unit,
    onDelete: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        val rowModifier = if (!reorderMode && onClick != null) {
            Modifier.fillMaxWidth().clickable(onClick = onClick)
        } else {
            Modifier.fillMaxWidth()
        }
        Row(
            modifier = rowModifier.padding(start = 12.dp, top = 10.dp, bottom = 10.dp, end = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier.size(44.dp).background(MaterialTheme.colorScheme.primary, RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Text(bengaliSerial(serial), color = MaterialTheme.colorScheme.onPrimary, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    row.name,
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    countLine(row, childUnit),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (reorderMode) {
                IconButton(
                    onClick = onMoveUp,
                    enabled = canMoveUp,
                    modifier = Modifier.semantics { contentDescription = "উপরে সরান" },
                ) { Text("▲", fontSize = 18.sp) }
                IconButton(
                    onClick = onMoveDown,
                    enabled = canMoveDown,
                    modifier = Modifier.semantics { contentDescription = "নিচে সরান" },
                ) { Text("▼", fontSize = 18.sp) }
            } else {
                if (onClick != null) {
                    Text("›", fontSize = 22.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                var menuOpen by remember { mutableStateOf(false) }
                Box {
                    IconButton(
                        onClick = { menuOpen = true },
                        modifier = Modifier.semantics { contentDescription = "আরও" },
                    ) { Text("⋮", fontSize = 20.sp) }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        DropdownMenuItem(
                            text = { Text("নাম পরিবর্তন") },
                            onClick = {
                                menuOpen = false
                                onRename()
                            },
                        )
                        DropdownMenuItem(
                            text = { Text("মুছে ফেলুন", color = MaterialTheme.colorScheme.error) },
                            onClick = {
                                menuOpen = false
                                onDelete()
                            },
                        )
                    }
                }
            }
        }
    }
}
