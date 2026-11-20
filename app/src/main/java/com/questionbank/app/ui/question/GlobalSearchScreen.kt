package com.questionbank.app.ui.question

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.questionbank.app.data.local.entity.ChapterCqQuestionCategoriesEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionCategoriesEntity
import com.questionbank.app.data.local.entity.TypeCqQuestionTypesEntity
import com.questionbank.app.domain.question.BoardItem
import com.questionbank.app.domain.question.BoardRules
import com.questionbank.app.domain.search.GlobalQuestionHit
import com.questionbank.app.domain.search.GlobalQuestionSearchFilters
import com.questionbank.app.domain.search.GlobalQuestionSearchUseCase
import com.questionbank.app.domain.repository.ChapterCqRepository
import com.questionbank.app.domain.hierarchy.TypeCqHierarchyRepository
import com.questionbank.app.media.ImagePipeline
import com.questionbank.app.ui.components.AppHeader
import kotlinx.coroutines.flow.Flow

private data class GlobalCategoryOption(val id: String, val name: String, val scope: String)
private data class GlobalHierarchyOption(val id: String, val name: String, val scope: String)

@Composable
fun GlobalSearchScreen(
    searchUseCase: GlobalQuestionSearchUseCase,
    boardsFlow: Flow<List<BoardItem>>,
    typeCategoriesFlow: Flow<List<TypeCqQuestionCategoriesEntity>>,
    chapterCategoriesFlow: Flow<List<ChapterCqQuestionCategoriesEntity>>,
    questionTypesFlow: Flow<List<TypeCqQuestionTypesEntity>>,
    chapterRepository: ChapterCqRepository,
    typeHierarchy: TypeCqHierarchyRepository,
    highlightSearchTerms: Boolean,
    imagePipeline: ImagePipeline,
    onOpenTypeCq: (GlobalQuestionHit) -> Unit,
) {
    val vm: GlobalSearchViewModel = viewModel(factory = GlobalSearchViewModel.factory { GlobalSearchViewModel(searchUseCase) })
    val boards by boardsFlow.collectAsState(initial = emptyList())
    val typeCategories by typeCategoriesFlow.collectAsState(initial = emptyList())
    val chapterCategories by chapterCategoriesFlow.collectAsState(initial = emptyList())
    val questionTypes by questionTypesFlow.collectAsState(initial = emptyList())
    val typeSubjects by typeHierarchy.observeSubjects().collectAsState(initial = emptyList())
    val chapterSubjects by chapterRepository.observeSubjects().collectAsState(initial = emptyList())
    val filters = vm.filters
    var chapterDetailId by remember { mutableStateOf<String?>(null) }
    var yearText by remember { mutableStateOf(filters.year?.toString().orEmpty()) }
    val allCategories = remember(typeCategories, chapterCategories) {
        typeCategories.filter { it.isArchived == 0L }.map { GlobalCategoryOption(it.categoryId, it.name, "TYPE_CQ") } +
            chapterCategories.filter { it.isArchived == 0L }.map { GlobalCategoryOption(it.categoryId, it.name, "CHAPTER_CQ") }
    }
    val categories = allCategories.filter { filters.scope == "ALL" || it.scope == filters.scope }
    val subjectOptions = (typeSubjects.map { GlobalHierarchyOption(it.id, it.name, "TYPE_CQ") } +
        chapterSubjects.map { GlobalHierarchyOption(it.subjectId, it.name, "CHAPTER_CQ") })
        .filter { filters.scope == "ALL" || it.scope == filters.scope }
        .distinctBy { it.scope to it.id }
    val selectedSubjectScope = filters.subjectId?.substringBefore('|')
    val selectedSubjectId = filters.subjectId?.substringAfter('|')
    val typeChaptersFlow = remember(selectedSubjectScope, selectedSubjectId) {
        if (selectedSubjectScope == "TYPE_CQ" && !selectedSubjectId.isNullOrBlank()) typeHierarchy.observeChapters(selectedSubjectId)
        else kotlinx.coroutines.flow.flowOf(emptyList())
    }
    val chapterCqChaptersFlow = remember(selectedSubjectScope, selectedSubjectId) {
        if (selectedSubjectScope == "CHAPTER_CQ" && !selectedSubjectId.isNullOrBlank()) chapterRepository.observeChapters(selectedSubjectId)
        else kotlinx.coroutines.flow.flowOf(emptyList())
    }
    val typeChapters by typeChaptersFlow.collectAsState(initial = emptyList())
    val chapterCqChapters by chapterCqChaptersFlow.collectAsState(initial = emptyList())
    val chapterOptions = typeChapters.map { GlobalHierarchyOption(it.id, it.name, "TYPE_CQ") } +
        chapterCqChapters.map { GlobalHierarchyOption(it.chapterId, it.name, "CHAPTER_CQ") }
    val selectedChapterScope = filters.chapterId?.substringBefore('|')
    val selectedChapterId = filters.chapterId?.substringAfter('|')
    val topicsFlow = remember(selectedChapterScope, selectedChapterId) {
        if (selectedChapterScope == "TYPE_CQ" && !selectedChapterId.isNullOrBlank()) typeHierarchy.observeTopics(selectedChapterId)
        else kotlinx.coroutines.flow.flowOf(emptyList())
    }
    val topics by topicsFlow.collectAsState(initial = emptyList())
    Scaffold(topBar = { AppHeader(title = "সব প্রশ্নে খুঁজুন", onBack = null, actions = {}) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = filters.query,
                onValueChange = { vm.update { it.copy(query = it) } },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                label = { Text("বাংলা বা English প্রশ্ন লিখুন") },
                placeholder = { Text("প্রশ্ন, উত্তর বা উদ্দীপক") },
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                GlobalFilterDropdown("Scope", when (filters.scope) { "TYPE_CQ" -> "Type_CQ"; "CHAPTER_CQ" -> "Chapter_CQ"; else -> "সব" }, listOf("সব" to "ALL", "Type_CQ" to "TYPE_CQ", "Chapter_CQ" to "CHAPTER_CQ"), modifier = Modifier.weight(1f)) { value ->
                    vm.update {
                        val categoryMismatch = value == "TYPE_CQ" && it.categoryScope == "CHAPTER_CQ" || value == "CHAPTER_CQ" && it.categoryScope == "TYPE_CQ"
                        val subjectMismatch = value != "ALL" && it.subjectId?.substringBefore('|')?.let { s -> s != value } == true
                        val chapterMismatch = value != "ALL" && it.chapterId?.substringBefore('|')?.let { s -> s != value } == true
                        it.copy(
                            scope = value,
                            questionTypeId = if (value == "CHAPTER_CQ") null else it.questionTypeId,
                            categoryScope = if (categoryMismatch) null else it.categoryScope,
                            categoryId = if (categoryMismatch) null else it.categoryId,
                            subjectId = if (subjectMismatch) null else it.subjectId,
                            chapterId = if (subjectMismatch || chapterMismatch) null else it.chapterId,
                            topicId = if (value == "CHAPTER_CQ" || subjectMismatch || chapterMismatch) null else it.topicId,
                        )
                    }
                }
                GlobalFilterDropdown("Rating", filters.rating?.toString() ?: "সব", listOf("সব" to "") + (1..5).map { it.toString() to it.toString() }, modifier = Modifier.weight(1f)) { value ->
                    vm.update { it.copy(rating = value.toIntOrNull()) }
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                GlobalFilterDropdown("Board", filters.boardCode ?: "সব", listOf("সব" to "") + boards.map { it.displayName to it.code }, modifier = Modifier.weight(1f)) { value ->
                    vm.update { it.copy(boardCode = value.ifBlank { null }) }
                }
                OutlinedTextField(
                    value = yearText, onValueChange = { yearText = it; vm.update { state -> state.copy(year = BoardRules.parseYear(it)) } },
                    modifier = Modifier.weight(1f), singleLine = true, label = { Text("সাল") }, placeholder = { Text("যেমন ২০২৪") },
                )
            }
            GlobalFilterDropdown(
                "Subject",
                subjectOptions.firstOrNull { "${it.scope}|${it.id}" == filters.subjectId }?.let { "${it.scope.removeSuffix("_CQ")}: ${it.name}" } ?: "সব",
                listOf("সব" to "") + subjectOptions.map { "${it.scope.removeSuffix("_CQ")}: ${it.name}" to "${it.scope}|${it.id}" },
            ) { value ->
                vm.update { it.copy(subjectId = value.ifBlank { null }, chapterId = null, topicId = null) }
            }
            if (filters.subjectId != null) {
                GlobalFilterDropdown(
                    "Chapter",
                    chapterOptions.firstOrNull { "${it.scope}|${it.id}" == filters.chapterId }?.name ?: "সব",
                    listOf("সব" to "") + chapterOptions.map { it.name to "${it.scope}|${it.id}" },
                ) { value -> vm.update { it.copy(chapterId = value.ifBlank { null }, topicId = null) } }
            }
            if (filters.chapterId?.substringBefore('|') == "TYPE_CQ") {
                GlobalFilterDropdown(
                    "Topic", topics.firstOrNull { "TYPE_CQ|${it.id}" == filters.topicId }?.name ?: "সব",
                    listOf("সব" to "") + topics.map { it.name to "TYPE_CQ|${it.id}" },
                ) { value -> vm.update { it.copy(topicId = value.ifBlank { null }) } }
            }
            GlobalFilterDropdown(
                "Category", categories.firstOrNull { it.id == filters.categoryId && it.scope == filters.categoryScope }?.let { "${it.scope.removeSuffix("_CQ")}: ${it.name}" } ?: "সব",
                listOf("সব" to "") + categories.map { "${it.scope.removeSuffix("_CQ")}: ${it.name}" to "${it.scope}|${it.id}" },
            ) { value ->
                if (value.isBlank()) vm.update { it.copy(categoryScope = null, categoryId = null) }
                else {
                    val selected = value.split('|', limit = 2)
                    if (selected.size == 2) vm.update { it.copy(categoryScope = selected[0], categoryId = selected[1]) }
                }
            }
            if (filters.scope != "CHAPTER_CQ") {
                GlobalFilterDropdown("Question Type", questionTypes.firstOrNull { it.questionTypeId == filters.questionTypeId }?.label ?: "সব", listOf("সব" to "") + questionTypes.filter { it.isActive != 0L }.map { it.label to it.questionTypeId }) { value ->
                    vm.update { it.copy(questionTypeId = value.ifBlank { null }) }
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = { yearText = ""; vm.clearFilters() }) { Text("ফিল্টার রিসেট") }
                Text("সর্বোচ্চ ৩০০ ফলাফল", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            when {
                vm.loading -> CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally))
                vm.error.isNotBlank() -> Text(vm.error, color = MaterialTheme.colorScheme.error)
                filters.query.isBlank() && filters.boardCode == null && filters.year == null && filters.categoryId == null &&
                    filters.rating == null && filters.questionTypeId == null && filters.subjectId == null && filters.chapterId == null && filters.topicId == null ->
                    Text("প্রশ্ন খুঁজতে লিখুন অথবা উপরের ফিল্টার নির্বাচন করুন।", style = MaterialTheme.typography.bodyMedium)
                vm.results.isEmpty() -> Text("কোনো প্রশ্ন পাওয়া যায়নি।", style = MaterialTheme.typography.bodyMedium)
                else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    item { Text("${vm.results.size} টি ফলাফল", style = MaterialTheme.typography.labelLarge) }
                    items(vm.results, key = { it.scope + ":" + it.questionId }) { hit ->
                        GlobalSearchResultCard(hit, filters.query, highlightSearchTerms) {
                            if (hit.scope == "TYPE_CQ") onOpenTypeCq(hit) else chapterDetailId = hit.questionId
                        }
                    }
                }
            }
        }
    }
    chapterDetailId?.let { id ->
        ChapterCqQuestionDetailDialog(id, chapterRepository, imagePipeline) { chapterDetailId = null }
    }
}

@Composable
private fun GlobalFilterDropdown(
    label: String,
    value: String,
    options: List<Pair<String, String>>,
    modifier: Modifier = Modifier,
    onChange: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Column(modifier) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Button(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) { Text(value, maxLines = 1) }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { (title, option) -> DropdownMenuItem(text = { Text(title) }, onClick = { expanded = false; onChange(option) }) }
        }
    }
}

@Composable
private fun GlobalSearchResultCard(hit: GlobalQuestionHit, query: String, highlightEnabled: Boolean, onOpen: () -> Unit) {
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(if (hit.scope == "TYPE_CQ") "Type_CQ" else "Chapter_CQ", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                Text("রেটিং ${hit.groupRating} · ${marksText(hit.marks)} নম্বর", style = MaterialTheme.typography.labelSmall)
            }
            Text("${hit.subjectName} › ${hit.chapterName} › ${hit.containerName}", style = MaterialTheme.typography.labelSmall)
            if (hit.stimulusText.isNotBlank()) Text("উদ্দীপক: ${hit.stimulusText}", style = MaterialTheme.typography.bodySmall)
            Text(highlightQuery("${hit.label}) ${hit.questionText}", query, highlightEnabled), style = MaterialTheme.typography.bodyLarge)
            if (hit.shortAnswer.isNotBlank()) Text("উত্তর: ${hit.shortAnswer}", style = MaterialTheme.typography.bodyMedium)
            if (hit.questionTypeId != null) Text("Question Type: ${hit.questionTypeId}", style = MaterialTheme.typography.labelSmall)
            if (hit.boardYears.isNotBlank()) Text("বোর্ড/সাল: ${hit.boardYears}", style = MaterialTheme.typography.labelSmall)
            if (hit.categories.isNotBlank()) Text("Category: ${hit.categories}", style = MaterialTheme.typography.labelSmall)
            if (hit.possibleDuplicate) Text("সম্ভাব্য Duplicate: একই লেখা অন্য প্রশ্নে আছে", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall)
            TextButton(onClick = onOpen) { Text("বিস্তারিত খুলুন") }
        }
    }
}


@Composable
private fun highlightQuery(text: String, query: String, enabled: Boolean): AnnotatedString {
    if (!enabled || query.isBlank()) return AnnotatedString(text)
    val tokens = com.questionbank.app.domain.question.QuestionSearchRules.tokens(query)
    val ranges = tokens.flatMap { token ->
        val found = mutableListOf<IntRange>()
        var start = 0
        while (start < text.length) {
            val index = text.indexOf(token, start, ignoreCase = true)
            if (index < 0) break
            found += index until (index + token.length)
            start = index + token.length.coerceAtLeast(1)
        }
        found
    }.sortedBy { it.first }
    return buildAnnotatedString {
        append(text)
        var lastEnd = -1
        ranges.forEach { range ->
            if (range.first >= lastEnd && range.last < text.length) {
                addStyle(
                    SpanStyle(
                        background = MaterialTheme.colorScheme.tertiaryContainer,
                        color = MaterialTheme.colorScheme.onTertiaryContainer,
                    ),
                    range.first,
                    range.last + 1,
                )
                lastEnd = range.last + 1
            }
        }
    }
}
