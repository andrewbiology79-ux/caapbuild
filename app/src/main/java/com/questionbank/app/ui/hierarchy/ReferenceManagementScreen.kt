package com.questionbank.app.ui.hierarchy

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.questionbank.app.ui.components.AppHeader
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

data class ReferenceRow(val id: String, val title: String, val code: String = "", val archived: Boolean = false)

@Composable
fun ReferenceHomeScreen(onQuestionTypes: () -> Unit, onBoards: () -> Unit, onCategories: () -> Unit, onChapterCategories: () -> Unit, onBack: () -> Unit) {
    Scaffold(topBar = { AppHeader("রেফারেন্স ডেটা", "প্রশ্নের শ্রেণি, বোর্ড ও ক্যাটাগরি", onBack) }) { pad ->
        Column(Modifier.fillMaxSize().padding(pad).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(onClick = onQuestionTypes, modifier = Modifier.fillMaxWidth()) { Text("Question Type ব্যবস্থাপনা") }
            Button(onClick = onBoards, modifier = Modifier.fillMaxWidth()) { Text("Board ও Year ব্যবস্থাপনা") }
            Button(onClick = onCategories, modifier = Modifier.fillMaxWidth()) { Text("Type_CQ Category ব্যবস্থাপনা") }
            Button(onClick = onChapterCategories, modifier = Modifier.fillMaxWidth()) { Text("Chapter_CQ Category ব্যবস্থাপনা") }
            Text("বোর্ড আর্কাইভ করলে পুরোনো প্রশ্নের ট্যাগ মুছে যায় না; নতুন প্রশ্নে আর্কাইভ করা বোর্ড নির্বাচন করা যাবে না।", style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
fun ReferenceCatalogScreen(
    title: String,
    rowsFlow: Flow<List<ReferenceRow>>,
    supportsCode: Boolean,
    allowAdd: Boolean = true,
    allowArchive: Boolean = true,
    onAdd: suspend (code: String, title: String) -> Boolean,
    onRename: suspend (id: String, title: String) -> Boolean,
    onArchive: suspend (id: String, archived: Boolean) -> Boolean,
    onReassign: (suspend (sourceId: String, targetId: String) -> Boolean)? = null,
    onBack: () -> Unit,
) {
    var rows by remember { mutableStateOf<List<ReferenceRow>?>(null) }
    var loadError by remember { mutableStateOf(false) }
    LaunchedEffect(rowsFlow) {
        try { rowsFlow.collect { rows = it; loadError = false } }
        catch (cancel: CancellationException) { throw cancel }
        catch (_: Exception) { rows = emptyList(); loadError = true }
    }
    val scope = rememberCoroutineScope()
    var showAdd by remember { mutableStateOf(false) }
    var edit by remember { mutableStateOf<ReferenceRow?>(null) }
    var reassign by remember { mutableStateOf<ReferenceRow?>(null) }
    var code by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var notice by remember { mutableStateOf<String?>(null) }
    Scaffold(topBar = { AppHeader(title, "সক্রিয় ও আর্কাইভ করা আইটেম", onBack) }, floatingActionButton = {
        if (allowAdd) Button(onClick = { code = ""; name = ""; showAdd = true }) { Text("নতুন যোগ করুন") }
    }) { pad ->
        Column(Modifier.fillMaxSize().padding(pad).padding(12.dp)) {
            notice?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            when {
                rows == null -> CircularProgressIndicator(modifier = Modifier.padding(24.dp))
                loadError -> Text("তথ্য লোড করা যায়নি। আবার ফিরে এসে চেষ্টা করুন।", color = MaterialTheme.colorScheme.error)
                rows!!.isEmpty() -> Text("কোনো তথ্য পাওয়া যায়নি।", modifier = Modifier.padding(24.dp))
            }
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(rows.orEmpty(), key = { it.id }) { row ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(row.title, style = MaterialTheme.typography.titleMedium)
                            if (row.code.isNotBlank()) Text(row.code, style = MaterialTheme.typography.labelSmall)
                            Text(if (row.archived) "আর্কাইভ" else "সক্রিয়", style = MaterialTheme.typography.labelSmall)
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                TextButton(onClick = { edit = row; name = row.title }) { Text("নাম পরিবর্তন") }
                                if (allowArchive) TextButton(onClick = {
                                    scope.launch { val ok = onArchive(row.id, !row.archived); notice = if (ok) "অবস্থা আপডেট হয়েছে।" else "আপডেট করা যায়নি।" }
                                }) { Text(if (row.archived) "পুনরায় সক্রিয়" else "আর্কাইভ") }
                                if (onReassign != null && !row.archived) {
                                    TextButton(onClick = { reassign = row }) { Text("স্থানান্তর") }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    if (showAdd && allowAdd) AlertDialog(onDismissRequest = { showAdd = false }, title = { Text("নতুন যোগ করুন") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (supportsCode) OutlinedTextField(code, { code = it.uppercase() }, label = { Text("Code") }, singleLine = true)
            OutlinedTextField(name, { name = it }, label = { Text("নাম") }, singleLine = true)
        }
    }, confirmButton = { TextButton(onClick = { scope.launch { val ok = onAdd(code, name); notice = if (ok) "যোগ হয়েছে।" else "তথ্যটি যোগ করা যায়নি; নাম/কোড পরীক্ষা করুন।"; if (ok) showAdd = false } }) { Text("সংরক্ষণ") } }, dismissButton = { TextButton(onClick = { showAdd = false }) { Text("বাতিল") } })
    reassign?.let { source -> AlertDialog(
        onDismissRequest = { reassign = null },
        title = { Text("ক্যাটাগরি স্থানান্তর") },
        text = { Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("${source.title} ক্যাটাগরির প্রশ্নগুলো কোন ক্যাটাগরিতে নেবেন? স্থানান্তরের পর পুরোনো ক্যাটাগরি আর্কাইভ হবে।")
            val targets = rows.orEmpty().filter { !it.archived && it.id != source.id }
            if (targets.isEmpty()) Text("স্থানান্তরের জন্য অন্য কোনো সক্রিয় ক্যাটাগরি নেই। আগে একটি নতুন ক্যাটাগরি যোগ করুন।", color = MaterialTheme.colorScheme.error)
            targets.forEach { target ->
                TextButton(onClick = { scope.launch { val ok = onReassign?.invoke(source.id, target.id) == true; notice = if(ok) "প্রশ্নগুলো স্থানান্তর করে পুরোনো ক্যাটাগরি আর্কাইভ করা হয়েছে।" else "স্থানান্তর করা যায়নি।"; if(ok) reassign = null } }) { Text(target.title) }
            }
        } },
        confirmButton = { TextButton(onClick = { reassign = null }) { Text("বন্ধ") } }
    ) }
    edit?.let { row -> AlertDialog(onDismissRequest = { edit = null }, title = { Text("নাম পরিবর্তন") }, text = { OutlinedTextField(name, { name = it }, label = { Text("নাম") }) }, confirmButton = { TextButton(onClick = { scope.launch { val ok = onRename(row.id, name); notice = if (ok) "নাম পরিবর্তন হয়েছে।" else "নাম পরিবর্তন করা যায়নি।"; if (ok) edit = null } }) { Text("সংরক্ষণ") } }, dismissButton = { TextButton(onClick = { edit = null }) { Text("বাতিল") } }) }
}

