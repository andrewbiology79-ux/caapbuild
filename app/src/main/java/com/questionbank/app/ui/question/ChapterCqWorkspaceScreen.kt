package com.questionbank.app.ui.question

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.material3.Surface
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.questionbank.app.data.local.entity.ChapterCqQuestionBoardsEntity
import com.questionbank.app.data.local.entity.ChapterCqQuestionCategoryLinksEntity
import com.questionbank.app.data.local.entity.ChapterCqQuestionsEntity
import com.questionbank.app.data.local.entity.ChapterCqSolutionPartsEntity
import com.questionbank.app.data.local.entity.ChapterCqStimuliEntity
import com.questionbank.app.data.local.entity.ChapterCqStimulusImagesEntity
import com.questionbank.app.domain.question.QuestionSolutionPart
import com.questionbank.app.domain.question.BoardItem
import com.questionbank.app.domain.question.AddBoardResult
import com.questionbank.app.domain.question.PaperUsage
import com.questionbank.app.domain.question.BoardTag
import com.questionbank.app.domain.question.QuestionStimulusImage
import com.questionbank.app.ui.format.toBengaliDigits
import com.questionbank.app.media.ImagePipeline
import com.questionbank.app.media.ImageScope
import com.questionbank.app.domain.editor.EditorBoardYear
import com.questionbank.app.domain.editor.EditorPartKind
import com.questionbank.app.domain.editor.EditorQuestionBlockDraft
import com.questionbank.app.domain.editor.EditorSessionDraft
import com.questionbank.app.domain.editor.EditorSessionDraftCodec
import com.questionbank.app.domain.editor.EditorSolutionPart
import com.questionbank.app.domain.editor.EditorStimulusDraft
import com.questionbank.app.domain.editor.EditorScope as CanonicalEditorScope
import com.questionbank.app.domain.editor.EditorMode as CanonicalEditorMode
import com.questionbank.app.domain.repository.ChapterCqRepository
import com.questionbank.app.domain.repository.TypeCqRepository
import com.questionbank.app.domain.repository.EditorDraftRepository
import com.questionbank.app.domain.repository.CategoryRepository
import com.questionbank.app.ui.components.AppHeader
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID


/**
 * Process-wide coordinator for Chapter_CQ draft writes. Draft jobs run in the application scope and can outlive
 * a Composable instance, so a per-screen Mutex/job reference is not sufficient to coordinate a later Save.
 */
private object ChapterCqDraftWriteCoordinator {
    private val mutex = Mutex()
    private val jobs = mutableMapOf<String, Job>()
    private val revisions = mutableMapOf<String, Long>()
    private var nextRevision = 0L

    fun schedule(
        scope: CoroutineScope,
        repository: EditorDraftRepository,
        ownerId: String,
        json: String,
        onResult: (Boolean) -> Unit,
    ) {
        synchronized(this) {
            nextRevision += 1L
            val revision = nextRevision
            revisions[ownerId] = revision
            jobs[ownerId]?.cancel()
            val job = scope.launch {
                val thisJob = coroutineContext[Job]
                try {
                    delay(300)
                    mutex.withLock { repository.save("chapter_cq", ownerId, json) }
                    if (isCurrent(ownerId, revision)) onResult(true)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    if (isCurrent(ownerId, revision)) onResult(false)
                } finally {
                    synchronized(this@ChapterCqDraftWriteCoordinator) {
                        if (revisions[ownerId] == revision && jobs[ownerId] === thisJob) {
                            jobs.remove(ownerId)
                            revisions.remove(ownerId)
                        }
                    }
                }
            }
            jobs[ownerId] = job
        }
    }

    private fun isCurrent(ownerId: String, revision: Long): Boolean = synchronized(this) {
        revisions[ownerId] == revision
    }

    suspend fun cancelAndJoin(ownerId: String) {
        val job = synchronized(this) {
            revisions.remove(ownerId)
            jobs.remove(ownerId)
        }
        job?.cancelAndJoin()
    }

    suspend fun <T> withLock(block: suspend () -> T): T = mutex.withLock { block() }
}

private data class ChapterCqEditorSnapshot(
    val stimulus: String = "",
    val reference: String = "",
    val stimulusRating: String = "",
    val label: String = "ক",
    val marks: String = "1",
    val questionText: String = "",
    val shortAnswer: String = "",
    val rating: String = "",
    val solutionTexts: List<String> = listOf(""),
    val boardCode: String = "",
    val boardYear: String = "",
    val selectedBoards: List<BoardTag> = emptyList(),
    val categories: List<String> = emptyList(),
    val editorMode: EditorMode = EditorMode.MINIMUM,
    val stimulusImages: List<QuestionStimulusImage> = emptyList(),
    val solutionParts: List<QuestionSolutionPart> = emptyList(),
)

private fun ChapterCqEditorSnapshot.toCanonicalDraft(
    ownerId: String,
    chapterId: String,
    questionId: String?,
    stimulusId: String?,
    previous: EditorSessionDraft?,
): EditorSessionDraft {
    val previousBlock = previous?.questionBlocks?.firstOrNull()
    val year = boardYear.toIntOrNull()
    val selectedTags = selectedBoards.map { EditorBoardYear(it.boardCode, it.year) }.ifEmpty {
        if (boardCode.isNotBlank() && year != null) listOf(EditorBoardYear(boardCode, year)) else emptyList()
    }
    val parts = solutionParts.sortedBy { it.position }.mapIndexed { index, part ->
        EditorSolutionPart(
            partId = part.partId,
            kind = if (part.partType == "IMAGE") EditorPartKind.IMAGE else EditorPartKind.TEXT,
            position = index.toLong(),
            text = part.textContent,
            imageId = part.imageId,
        )
    }
    return EditorSessionDraft(
        scope = CanonicalEditorScope.CHAPTER_CQ,
        ownerId = ownerId,
        parentId = chapterId,
        hierarchyIds = previous?.hierarchyIds.orEmpty().ifEmpty { listOf(chapterId) },
        existingStimulusId = stimulusId ?: previous?.existingStimulusId,
        existingQuestionIds = questionId?.let { listOf(it) } ?: previous?.existingQuestionIds.orEmpty(),
        stimulus = (previous?.stimulus ?: EditorStimulusDraft()).copy(
            text = stimulus, referenceText = reference, rating = stimulusRating.toIntOrNull(),
            images = stimulusImages.map { com.questionbank.app.domain.editor.EditorImageRef(it.imageId, it.placement, it.position) },
        ),
        questionBlocks = listOf(EditorQuestionBlockDraft(
            blockId = previousBlock?.blockId ?: "$ownerId:block:$label",
            questionId = questionId ?: previousBlock?.questionId,
            label = label,
            questionText = questionText,
            shortAnswer = shortAnswer,
            rawMarks = marks,
            rating = rating.toIntOrNull(),
            boardYears = selectedTags,
            categoryIds = categories,
            solutionParts = parts,
        )),
        deletedQuestionIds = previous?.deletedQuestionIds.orEmpty(),
        mode = if (editorMode == EditorMode.FULL) CanonicalEditorMode.FULL else CanonicalEditorMode.MINIMUM,
        preservedJson = previous?.preservedJson,
    )
}

private fun ChapterCqEditorSnapshot.toDraftJson(
    ownerId: String,
    chapterId: String,
    questionId: String?,
    stimulusId: String?,
    previous: EditorSessionDraft?,
): String = EditorSessionDraftCodec.encode(toCanonicalDraft(ownerId, chapterId, questionId, stimulusId, previous))

private fun chapterCqSnapshotFromJson(raw: String): ChapterCqEditorSnapshot? {
    val canonical = EditorSessionDraftCodec.decode(raw)
    if (canonical != null && canonical.scope == CanonicalEditorScope.CHAPTER_CQ) {
        val block = canonical.questionBlocks.firstOrNull()
        val primaryBoard = block?.boardYears?.firstOrNull()
        return ChapterCqEditorSnapshot(
            stimulus = canonical.stimulus.text,
            reference = canonical.stimulus.referenceText,
            stimulusRating = canonical.stimulus.rating?.toString().orEmpty(),
            label = block?.label ?: "ক",
            marks = block?.rawMarks ?: "1",
            questionText = block?.questionText.orEmpty(),
            shortAnswer = block?.shortAnswer.orEmpty(),
            rating = block?.rating?.toString().orEmpty(),
            solutionTexts = block?.solutionParts.orEmpty().filter { it.kind == EditorPartKind.TEXT }.sortedBy { it.position }.mapNotNull { it.text }.ifEmpty { listOf("") },
            boardCode = primaryBoard?.boardCode.orEmpty(),
            boardYear = primaryBoard?.year?.toString().orEmpty(),
            selectedBoards = block?.boardYears.orEmpty().map { BoardTag(it.boardCode, it.year) },
            categories = block?.categoryIds.orEmpty(),
            editorMode = if (canonical.mode == CanonicalEditorMode.FULL) EditorMode.FULL else EditorMode.MINIMUM,
            stimulusImages = canonical.stimulus.images.map { QuestionStimulusImage(it.imageId, it.placement, it.position) },
            solutionParts = block?.solutionParts.orEmpty().sortedBy { it.position }.map { part ->
                QuestionSolutionPart(part.partId, part.kind.name, part.position, part.text, part.imageId)
            },
        )
    }
    // Backward-compatible reader for the pre-v2 Chapter_CQ snapshot format.
    return runCatching {
        val value = JSONObject(raw)
        fun strings(key: String): List<String> {
            val array = value.optJSONArray(key) ?: return emptyList()
            return List(array.length()) { index -> array.optString(index) }
        }
        ChapterCqEditorSnapshot(
            stimulus = value.optString("stimulus"), reference = value.optString("reference"),
            stimulusRating = value.optString("stimulusRating"), label = value.optString("label", "ক"),
            marks = value.optString("marks", "1"), questionText = value.optString("questionText"),
            shortAnswer = value.optString("shortAnswer"), rating = value.optString("rating"),
            solutionTexts = strings("solutionTexts").ifEmpty { listOf("") }, boardCode = value.optString("boardCode"),
            boardYear = value.optString("boardYear"), categories = strings("categories"),
            editorMode = runCatching { EditorMode.valueOf(value.optString("editorMode", "MINIMUM")) }.getOrDefault(EditorMode.MINIMUM),
        )
    }.getOrNull()
}

private fun labelOrder(label: String): Int = when (label) { "ক" -> 0; "খ" -> 1; "গ" -> 2; "ঘ" -> 3; else -> 9 }

private fun chapterCqSearchMatches(haystack: String, query: String): Boolean {
    val terms = query.trim().lowercase().split(Regex("\\s+")).filter { it.isNotBlank() }
    if (terms.isEmpty()) return true
    val normalized = haystack.lowercase()
    return terms.all { normalized.contains(it) }
}

private fun chapterCqBoardText(tags: List<BoardTag>, catalog: List<BoardItem>): String =
    tags.joinToString(" ") { tag ->
        val boardName = catalog.firstOrNull { it.code.equals(tag.boardCode, ignoreCase = true) }?.displayName.orEmpty()
        "${tag.boardCode} $boardName ${tag.year} ${tag.year.toString().toBengaliDigits()}"
    }

/** Chapter_CQ has its own repository and schema; it intentionally has no Type_CQ question-type field. */
@Composable
fun ChapterCqWorkspaceScreen(
    repository: ChapterCqRepository,
    referenceRepository: TypeCqRepository,
    categoryRepository: CategoryRepository,
    draftRepository: EditorDraftRepository,
    draftScope: CoroutineScope,
    imagePipeline: ImagePipeline,
    defaultEditorMode: EditorMode = EditorMode.MINIMUM,
    /** When present, the workspace opens directly on this Chapter_CQ subject/chapter after hierarchy navigation. */
    fixedSubjectId: String? = null,
    fixedChapterId: String? = null,
    onBack: (() -> Unit)? = null,
) {
    val scope = rememberCoroutineScope()
    val subjects by repository.observeSubjects().collectAsState(initial = emptyList())
    val boards by referenceRepository.observeBoards().collectAsState(initial = emptyList())
    val boardItems = remember(boards) { boards.map { BoardItem(it.code, it.displayName, it.boardKind == "CUSTOM", it.isArchived == 1L) } }
    val categories by repository.observeCategories().collectAsState(initial = emptyList())
    var subjectId by rememberSaveable { mutableStateOf(fixedSubjectId.orEmpty()) }
    val chapters by remember(subjectId) { repository.observeChapters(subjectId) }.collectAsState(initial = emptyList())
    var chapterId by rememberSaveable { mutableStateOf(fixedChapterId.orEmpty()) }
    val cards by remember(chapterId) { repository.observeQuestionCards(chapterId) }.collectAsState(initial = emptyList())
    var nameDialog by rememberSaveable { mutableStateOf(false) }
    var nameKind by rememberSaveable { mutableStateOf("subject") }
    var nameEntityId by rememberSaveable { mutableStateOf("") }
    var newName by rememberSaveable { mutableStateOf("") }
    var editorOpen by rememberSaveable { mutableStateOf(false) }
    var editingId by rememberSaveable { mutableStateOf<String?>(null) }
    var editorLoading by rememberSaveable { mutableStateOf(false) }
    var savingQuestion by rememberSaveable { mutableStateOf(false) }
    var draftOwnerId by rememberSaveable { mutableStateOf("") }
    var draftSaved by rememberSaveable { mutableStateOf(false) }
    var duplicateDialog by rememberSaveable { mutableStateOf(false) }
    var stimulusPreviewOpen by rememberSaveable { mutableStateOf(false) }
    var questionPreviewOpen by rememberSaveable { mutableStateOf(false) }
    var answerPreviewOpen by rememberSaveable { mutableStateOf(false) }
    var solutionPreviewOpen by rememberSaveable { mutableStateOf(false) }
    var editorCloseConfirm by rememberSaveable { mutableStateOf(false) }
    var pendingDeleteQuestionId by rememberSaveable { mutableStateOf<String?>(null) }
    var deleteError by rememberSaveable { mutableStateOf("") }
    var selectedQuestionIds by remember { mutableStateOf(emptySet<String>()) }
    var pendingBulkDeleteIds by remember { mutableStateOf<List<String>?>(null) }
    var detailQuestionId by remember { mutableStateOf<String?>(null) }
    var sortMode by rememberSaveable { mutableStateOf("DEFAULT") }
    var sortMenuOpen by remember { mutableStateOf(false) }
    var searchOpen by rememberSaveable { mutableStateOf(false) }
    var searchQuery by rememberSaveable { mutableStateOf("") }
    var questionMetadata by remember { mutableStateOf<Map<String, ChapterCqQuestionPresentation>>(emptyMap()) }
    var stimulusMetadata by remember { mutableStateOf<Map<String, ChapterCqStimulusPresentation>>(emptyMap()) }
    var stimulusReferences by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    LaunchedEffect(chapterId) { selectedQuestionIds = emptySet(); searchQuery = ""; searchOpen = false }
    BackHandler(enabled = searchOpen) { searchOpen = false; searchQuery = "" }
    LaunchedEffect(cards, chapterId) {
        if (cards.isEmpty()) {
            questionMetadata = emptyMap(); stimulusMetadata = emptyMap(); stimulusReferences = emptyMap()
        } else {
            val questionRows = linkedMapOf<String, ChapterCqQuestionPresentation>()
            val stimulusRows = linkedMapOf<String, ChapterCqStimulusPresentation>()
            val referenceRows = linkedMapOf<String, String>()
            cards.forEach { card ->
                val questionBoards = repository.loadQuestionBoards(card.questionId).map { BoardTag(it.boardCode, it.year.toInt()) }
                val solutionParts = repository.loadSolutionParts(card.questionId).sortedBy { it.position }.map {
                    QuestionSolutionPart(it.partId, it.partType, it.position, it.textContent, it.imageId)
                }
                val paperUsages = repository.loadQuestionPaperUsages(card.questionId).map { PaperUsage(it.paperId, it.shortName, it.title) }
                questionRows[card.questionId] = ChapterCqQuestionPresentation(card, questionBoards, solutionParts, paperUsages)
                card.stimulusId?.let { stimulusIdValue ->
                    if (stimulusIdValue !in stimulusRows) {
                        val images = repository.loadStimulusImages(stimulusIdValue).sortedBy { it.position }.map {
                            QuestionStimulusImage(it.imageId, it.placement, it.position)
                        }
                        val tags = repository.loadStimulusBoards(stimulusIdValue).map { BoardTag(it.boardCode, it.year.toInt()) }
                        stimulusRows[stimulusIdValue] = ChapterCqStimulusPresentation(tags, images)
                        referenceRows[stimulusIdValue] = repository.loadStimulus(stimulusIdValue)?.referenceText.orEmpty()
                    }
                }
            }
            questionMetadata = questionRows
            stimulusMetadata = stimulusRows
            stimulusReferences = referenceRows
        }
    }
    val allQuestionGroups = remember(cards, questionMetadata, stimulusMetadata, stimulusReferences) {
        cards.groupBy { it.stimulusId ?: "single:${it.questionId}" }.map { (key, rows) ->
            val sortedRows = rows.sortedWith(compareBy<com.questionbank.app.data.local.dao.ChapterCqQuestionCardDb> { labelOrder(it.label) }.thenBy { it.questionId })
            val stimulusIdValue = sortedRows.firstOrNull()?.stimulusId
            val first = sortedRows.first()
            val fallback = sortedRows.mapNotNull { it.rating?.toInt() }.takeIf { it.isNotEmpty() }?.average()?.let { kotlin.math.round(it).toInt() } ?: 3
            ChapterCqQuestionGroupPresentation(
                key = key,
                stimulusId = stimulusIdValue,
                stimulusText = first.stimulusText.orEmpty(),
                stimulusRating = first.stimulusRating?.toInt(),
                fallbackRating = fallback,
                referenceText = stimulusIdValue?.let { stimulusReferences[it] }.orEmpty(),
                stimulus = stimulusIdValue?.let { stimulusMetadata[it] } ?: ChapterCqStimulusPresentation(),
                questions = sortedRows.mapNotNull { questionMetadata[it.questionId] },
                allQuestionIds = sortedRows.map { it.questionId },
                paperUsages = sortedRows.flatMap { questionMetadata[it.questionId]?.paperUsages.orEmpty() }.distinctBy { it.paperId },
            )
        }
    }
    val visibleQuestionGroups = remember(allQuestionGroups, searchQuery, sortMode) {
        val filtered = if (searchQuery.isBlank()) allQuestionGroups else allQuestionGroups.mapNotNull { group ->
            val stimulusMatched = chapterCqSearchMatches(
                listOf(group.stimulusText, chapterCqBoardText(group.stimulus.boards, boardItems)).joinToString(" "), searchQuery,
            )
            if (stimulusMatched) group else {
                val matches = group.questions.filter { item ->
                    val q = item.row
                    chapterCqSearchMatches(
                        listOf(q.questionText, item.solutionParts.filter { it.partType != "IMAGE" }.mapNotNull { it.textContent }.joinToString(" "), chapterCqBoardText(item.boards, boardItems)).joinToString(" "),
                        searchQuery,
                    )
                }
                if (matches.isEmpty()) null else group.copy(questions = matches)
            }
        }
        when (sortMode) {
            "RATING" -> filtered.sortedWith(compareByDescending<ChapterCqQuestionGroupPresentation> { it.rating }.thenBy { it.key })
            "MARKS" -> filtered.sortedWith(compareByDescending<ChapterCqQuestionGroupPresentation> { it.questions.sumOf { q -> q.row.marks } }.thenBy { it.key })
            "TYPE" -> filtered.sortedWith(compareBy<ChapterCqQuestionGroupPresentation> { it.questions.minOfOrNull { q -> labelOrder(q.row.label) } ?: 9 }.thenBy { it.key })
            else -> filtered
        }
    }
    val visibleQuestionCount = visibleQuestionGroups.sumOf { it.questions.size }
    var saveError by rememberSaveable { mutableStateOf("") }
    var editorLoadError by rememberSaveable { mutableStateOf("") }

    var stimulusId by rememberSaveable { mutableStateOf<String?>(null) }
    var stimulus by rememberSaveable { mutableStateOf("") }
    var reference by rememberSaveable { mutableStateOf("") }
    var stimulusRating by rememberSaveable { mutableStateOf("") }
    var label by rememberSaveable { mutableStateOf("ক") }
    var marks by rememberSaveable { mutableStateOf("1") }
    var questionText by rememberSaveable { mutableStateOf("") }
    var shortAnswer by rememberSaveable { mutableStateOf("") }
    var rating by rememberSaveable { mutableStateOf("") }
    var solutionTexts by remember { mutableStateOf(listOf("")) }
    var boardCode by rememberSaveable { mutableStateOf("") }
    var boardYear by rememberSaveable { mutableStateOf("") }
    var selectedBoardTags by remember { mutableStateOf(emptyList<BoardTag>()) }
    val selectedCategories = remember { mutableStateListOf<String>() }
    var previousBoards by remember { mutableStateOf(emptyList<ChapterCqQuestionBoardsEntity>()) }
    var previousParts by remember { mutableStateOf(emptyList<ChapterCqSolutionPartsEntity>()) }
    var stimulusImages by remember { mutableStateOf(emptyList<QuestionStimulusImage>()) }
    var solutionPartsDraft by remember { mutableStateOf(emptyList<QuestionSolutionPart>()) }
    var editorMode by rememberSaveable { mutableStateOf(defaultEditorMode) }
    var canonicalDraftTemplate by remember { mutableStateOf<EditorSessionDraft?>(null) }
    val history = remember { EditorHistory(ChapterCqEditorSnapshot()) }

    fun snapshotForm() = ChapterCqEditorSnapshot(
        stimulus, reference, stimulusRating, label, marks, questionText, shortAnswer, rating,
        solutionTexts, boardCode, boardYear, selectedBoardTags, selectedCategories.toList(), editorMode, stimulusImages, solutionPartsDraft,
    )
    fun queueEditorDraft() {
        val owner = draftOwnerId
        if (!editorOpen || owner.isBlank()) return
        val snapshot = snapshotForm()
        val canonical = snapshot.toCanonicalDraft(owner, chapterId, editingId, stimulusId, canonicalDraftTemplate)
        canonicalDraftTemplate = canonical
        ChapterCqDraftWriteCoordinator.schedule(draftScope, draftRepository, owner, EditorSessionDraftCodec.encode(canonical)) { saved ->
            if (draftOwnerId == owner) draftSaved = saved
        }
        draftSaved = false
    }
    fun recordForm(group: String) { history.record(snapshotForm(), group); queueEditorDraft() }
    fun syncMixedSolutionText() {
        val old = solutionPartsDraft.sortedBy { it.position }
        val next = mutableListOf<QuestionSolutionPart>()
        var textIndex = 0
        old.forEach { part ->
            if (part.partType == "IMAGE") next += part.copy(position = next.size.toLong())
            else if (textIndex < solutionTexts.size) {
                next += part.copy(textContent = solutionTexts[textIndex], imageId = null, position = next.size.toLong())
                textIndex++
            }
        }
        while (textIndex < solutionTexts.size) {
            next += QuestionSolutionPart("chapter_cq:$draftOwnerId:text:$textIndex", "TEXT", next.size.toLong(), textContent = solutionTexts[textIndex])
            textIndex++
        }
        solutionPartsDraft = next
    }
    fun restoreForm(value: ChapterCqEditorSnapshot) {
        stimulus = value.stimulus; reference = value.reference; stimulusRating = value.stimulusRating
        label = value.label; marks = value.marks; questionText = value.questionText; shortAnswer = value.shortAnswer
        rating = value.rating; solutionTexts = value.solutionTexts; boardCode = value.boardCode; boardYear = value.boardYear
        selectedBoardTags = value.selectedBoards.ifEmpty {
            if (value.boardCode.isNotBlank() && value.boardYear.toIntOrNull() != null) listOf(BoardTag(value.boardCode, value.boardYear.toInt())) else emptyList()
        }
        editorMode = value.editorMode
        stimulusImages = value.stimulusImages
        solutionPartsDraft = value.solutionParts
        selectedCategories.clear(); selectedCategories.addAll(value.categories)
    }
    var labelMenu by remember { mutableStateOf(false) }
    var boardMenu by remember { mutableStateOf(false) }

    LaunchedEffect(subjects, fixedSubjectId) {
        if (fixedSubjectId != null) {
            subjectId = fixedSubjectId
        } else if (subjectId.isBlank() || subjects.none { it.subjectId == subjectId }) {
            subjectId = subjects.firstOrNull()?.subjectId.orEmpty()
        }
    }
    LaunchedEffect(chapters, fixedChapterId) {
        if (fixedChapterId != null) {
            chapterId = fixedChapterId
        } else if (chapterId.isBlank() || chapters.none { it.chapterId == chapterId }) {
            chapterId = chapters.firstOrNull()?.chapterId.orEmpty()
        }
    }
    LaunchedEffect(editorOpen, editingId, draftOwnerId) {
        if (!editorOpen) return@LaunchedEffect
        editorLoading = true
        if (editingId != null) {
            val requestedQuestionId = editingId!!
            val q = try {
                repository.loadQuestion(requestedQuestionId)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                editorLoadError = "প্রশ্নের তথ্য লোড করা যায়নি। পরে আবার চেষ্টা করুন।"
                editorLoading = false
                return@LaunchedEffect
            }
            if (q == null) {
                // Do not allow stale fields from a previous editor session to be saved under a deleted question ID.
                stimulusId = null; stimulus = ""; reference = ""; stimulusRating = ""
                label = "ক"; marks = "1"; questionText = ""; shortAnswer = ""; rating = ""
                solutionTexts = listOf(""); boardCode = ""; boardYear = ""; selectedBoardTags = emptyList()
                selectedCategories.clear(); previousBoards = emptyList(); previousParts = emptyList(); stimulusImages = emptyList(); solutionPartsDraft = emptyList()
                editorLoadError = "এই প্রশ্নটি আর নেই। তালিকা রিফ্রেশ করে আবার চেষ্টা করুন।"
                history.reset(snapshotForm())
                editorLoading = false
                return@LaunchedEffect
            } else {
                val s = q.stimulusId?.let { repository.loadStimulus(it) }
                stimulusId = s?.stimulusId
                stimulus = s?.stimulusText.orEmpty()
                reference = s?.referenceText.orEmpty()
                stimulusRating = s?.rating?.toString().orEmpty()
                stimulusImages = s?.stimulusId?.let { repository.loadStimulusImages(it) }?.map { QuestionStimulusImage(it.imageId, it.placement, it.position) }.orEmpty()
                label = q.subquestionLabel
                marks = q.marks.toString()
                questionText = q.questionText
                shortAnswer = q.shortAnswer
                rating = q.rating?.toString().orEmpty()
                previousParts = repository.loadSolutionParts(q.questionId)
                solutionPartsDraft = previousParts.sortedBy { it.position }.map { part ->
                    QuestionSolutionPart(part.partId, part.partType, part.position, part.textContent, part.imageId)
                }
                solutionTexts = previousParts.filter { it.partType == "TEXT" }.sortedBy { it.position }.mapNotNull { it.textContent }.ifEmpty { listOf("") }
                val qBoards = repository.loadQuestionBoards(q.questionId)
                previousBoards = qBoards
                selectedBoardTags = qBoards.sortedWith(compareBy<ChapterCqQuestionBoardsEntity> { it.sortOrder }.thenBy { it.year }).map { BoardTag(it.boardCode, it.year.toInt()) }
                boardCode = selectedBoardTags.firstOrNull()?.boardCode.orEmpty()
                boardYear = selectedBoardTags.firstOrNull()?.year?.toString().orEmpty()
                selectedCategories.clear()
                selectedCategories.addAll(repository.loadQuestionCategories(q.questionId).map { it.categoryId })
            }
        } else if (stimulusId != null) {
            // New question in an existing stimulus group: keep the group's stimulus and images intact.
            val s = runCatching { repository.loadStimulus(stimulusId!!) }.getOrNull()
            if (s == null) {
                editorLoadError = "উদ্দীপক গ্রুপটি আর পাওয়া যাচ্ছে না। তালিকা রিফ্রেশ করে আবার চেষ্টা করুন।"
                editorLoading = false
                return@LaunchedEffect
            }
            stimulus = s.stimulusText
            reference = s.referenceText
            stimulusRating = s.rating?.toString().orEmpty()
            stimulusImages = repository.loadStimulusImages(s.stimulusId).map {
                QuestionStimulusImage(it.imageId, it.placement, it.position)
            }
        }
        val rawDraft = runCatching { draftRepository.load("chapter_cq", draftOwnerId) }.getOrNull()
        rawDraft?.let {
            canonicalDraftTemplate = EditorSessionDraftCodec.decode(it)
            chapterCqSnapshotFromJson(it)?.let { restored ->
                restoreForm(restored)
                if (canonicalDraftTemplate == null) {
                    canonicalDraftTemplate = restored.toCanonicalDraft(draftOwnerId, chapterId, editingId, stimulusId, null).copy(preservedJson = it)
                }
            }
            draftSaved = true
        }
        editorMode = if (rawDraft == null) defaultEditorMode else editorMode
        history.reset(snapshotForm())
        editorLoading = false
    }

    fun openNewQuestion(forStimulusId: String? = null) {
        editingId = null
        stimulusId = forStimulusId; stimulus = ""; reference = ""; stimulusRating = ""
        val occupiedLabels = if (forStimulusId == null) emptySet() else
            allQuestionGroups.firstOrNull { it.stimulusId == forStimulusId }?.questions?.map { it.row.label }?.toSet().orEmpty()
        val addOrder = if (defaultEditorMode == EditorMode.FULL) listOf("গ", "ঘ", "ক", "খ") else listOf("গ", "ঘ")
        label = addOrder.firstOrNull { it !in occupiedLabels } ?: addOrder.first()
        marks = "1"; questionText = ""; shortAnswer = ""; rating = ""
        solutionTexts = listOf(""); boardCode = ""; boardYear = ""; selectedBoardTags = emptyList()
        selectedCategories.clear(); previousBoards = emptyList(); previousParts = emptyList(); stimulusImages = emptyList(); solutionPartsDraft = emptyList(); saveError = ""; editorLoadError = ""
        editorMode = defaultEditorMode
        draftOwnerId = if (forStimulusId == null) "new:$chapterId" else "new:$chapterId:group:$forStimulusId"
        canonicalDraftTemplate = null
        draftSaved = false
        editorLoading = true
        editorOpen = true
    }

    fun saveQuestion(forceDuplicate: Boolean = false) {
        // Guard synchronously before launching: rapid taps must not create multiple question IDs/rows.
        if (savingQuestion || editorLoading || editorLoadError.isNotBlank()) return
        if (chapterId.isBlank()) { saveError = "আগে একটি অধ্যায় নির্বাচন করুন।"; return }
        val cleanText = questionText.trim()
        val markValue = marks.toDoubleOrNull()
        val ratingValue = rating.toLongOrNull()?.takeIf { it in 1L..5L }
        val parsedStimulusRating = stimulusRating.toLongOrNull()?.takeIf { it in 1L..5L }
        if (cleanText.isBlank()) { saveError = "প্রশ্নের লেখা খালি রাখা যাবে না।"; return }
        if (editingId == null && stimulusId != null) {
            val occupiedLabels = allQuestionGroups.firstOrNull { it.stimulusId == stimulusId }?.questions?.map { it.row.label }?.toSet().orEmpty()
            if (label in occupiedLabels) { saveError = "$label দাগের প্রশ্ন এই উদ্দীপকের অধীনে আগে থেকেই আছে। অন্য দাগ নির্বাচন করুন; প্রয়োজনে Full Editor ব্যবহার করুন।"; return }
        }
        if (markValue == null || !markValue.isFinite() || markValue <= 0.0) { saveError = "নম্বর শূন্যের বেশি হতে হবে।"; return }
        if (rating.isNotBlank() && ratingValue == null) { saveError = "প্রশ্নের রেটিং ১–৫-এর মধ্যে দিন।"; return }
        if (stimulusRating.isNotBlank() && parsedStimulusRating == null) { saveError = "উদ্দীপকের রেটিং ১–৫-এর মধ্যে দিন।"; return }
        val hasStimulusContent = stimulus.isNotBlank() || reference.isNotBlank() || stimulusImages.isNotEmpty()
        val stimRatingValue = parsedStimulusRating.takeIf { hasStimulusContent }
        val invalidBoardYear = selectedBoardTags.any { it.year !in 1900..2200 }
        if (invalidBoardYear) { saveError = "বোর্ডের সাল ১৯০০–২২০০-এর মধ্যে দিন।"; return }
        val inactiveNewBoard = selectedBoardTags.firstOrNull { tag ->
            boards.none { it.code == tag.boardCode && it.isArchived == 0L } &&
                previousBoards.none { it.boardCode == tag.boardCode && it.year == tag.year.toLong() }
        }
        if (inactiveNewBoard != null) { saveError = "নতুন করে শুধু সক্রিয় বোর্ড নির্বাচন করা যাবে।"; return }
        savingQuestion = true
        editorLoading = true
        scope.launch {
            var draftWriterStopped = false
            try {
                if (!forceDuplicate && repository.isDuplicate(chapterId, cleanText, editingId)) {
                    duplicateDialog = true
                    return@launch
                }
                // Drain the delayed application-scope draft writer before the DB transaction removes its key.
                ChapterCqDraftWriteCoordinator.cancelAndJoin(draftOwnerId)
                draftWriterStopped = true
                // Persist the exact frozen form before the transaction. If the question transaction rolls back,
                // this draft remains recoverable; if it commits, the DAO deletes the key atomically.
                val saveSnapshot = snapshotForm().toDraftJson(draftOwnerId, chapterId, editingId, stimulusId, canonicalDraftTemplate)
                // Complete the save even if the owner navigates away mid-transaction, matching Type_CQ save semantics.
                val ok = withContext(NonCancellable) {
                    ChapterCqDraftWriteCoordinator.withLock {
                        draftRepository.save("chapter_cq", draftOwnerId, saveSnapshot)
                        draftSaved = true
                        val now = System.currentTimeMillis()
                        val qid = editingId ?: "ccq_${UUID.randomUUID()}"
                        val existing = editingId?.let { repository.loadQuestion(it) }
                        val wantsStimulus = hasStimulusContent || stimulusId != null
                        val targetStimulusId = if (wantsStimulus) (stimulusId ?: "ccs_${UUID.randomUUID()}") else null
                        val stimulusRow = if (targetStimulusId != null) ChapterCqStimuliEntity(
                            stimulusId = targetStimulusId,
                            chapterId = chapterId,
                            stimulusText = stimulus.trim(),
                            rating = stimRatingValue,
                            referenceText = reference.trim(),
                            createdAt = existing?.let { stimulusId?.let { sid -> repository.loadStimulus(sid)?.createdAt } } ?: now,
                            updatedAt = now,
                        ) else null
                        val q = ChapterCqQuestionsEntity(
                            questionId = qid,
                            ftsId = existing?.ftsId ?: 0L,
                            stimulusId = targetStimulusId,
                            chapterId = chapterId,
                            subquestionLabel = label,
                            marks = markValue,
                            questionText = cleanText,
                            shortAnswer = shortAnswer.trim(),
                            rating = ratingValue,
                            sortOrder = existing?.sortOrder ?: 0L,
                            createdAt = existing?.createdAt ?: now,
                            updatedAt = now,
                        )
                        // Save the exact ordered mixed solution sequence from the editor draft.
                        if (solutionPartsDraft.isEmpty()) syncMixedSolutionText()
                        val allParts = solutionPartsDraft.sortedBy { it.position }.mapIndexedNotNull { index, part ->
                            val text = part.textContent?.trim()
                            if (part.partType == "TEXT" && text.isNullOrEmpty()) null
                            else ChapterCqSolutionPartsEntity(
                                partId = part.partId.ifBlank { "ccsp_${UUID.randomUUID()}" },
                                questionId = qid,
                                position = index.toLong(),
                                partType = part.partType,
                                textContent = text,
                                imageId = part.imageId,
                                createdAt = now,
                            )
                        }
                        val boardRows = selectedBoardTags.mapIndexed { index, tag ->
                            previousBoards.firstOrNull { it.boardCode == tag.boardCode && it.year == tag.year.toLong() }?.copy(sortOrder = index.toLong())
                                ?: ChapterCqQuestionBoardsEntity("ccqb_${UUID.randomUUID()}", qid, tag.boardCode, tag.year.toLong(), index.toLong())
                        }
                        val categoryRows = selectedCategories.distinct().map { ChapterCqQuestionCategoryLinksEntity(qid, it, now) }
                        repository.saveQuestionWithStimulus(
                            q, stimulusRow, allParts, boardRows, categoryRows,
                            stimulusImages = stimulusImages.mapIndexed { index, row ->
                                ChapterCqStimulusImagesEntity(targetStimulusId!!, row.imageId, index.toLong(), row.placement)
                            }.takeIf { wantsStimulus },
                            mustUpdateExisting = editingId != null,
                            draftOwnerId = draftOwnerId,
                        )
                    }
                }
                if (ok) {
                    editorOpen = false
                    duplicateDialog = false
                    saveError = ""
                    draftSaved = false
                } else {
                    saveError = "সংরক্ষণ করা যায়নি। সংশ্লিষ্ট বোর্ড/ক্যাটাগরি সক্রিয় আছে কি না যাচাই করুন।"
                    if (draftWriterStopped) queueEditorDraft()
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                saveError = "সংরক্ষণ করা যায়নি: ${error.message ?: "অপ্রত্যাশিত সমস্যা"}"
                if (draftWriterStopped) queueEditorDraft()
            } finally {
                savingQuestion = false
                if (editorOpen) editorLoading = false
            }
        }
    }

    if (nameDialog) AlertDialog(
        onDismissRequest = { nameDialog = false },
        title = { Text(when (nameKind) { "subject" -> "নতুন বিষয়"; "chapter" -> "নতুন অধ্যায়"; "renameSubject" -> "বিষয়ের নাম পরিবর্তন"; else -> "অধ্যায়ের নাম পরিবর্তন" }) },
        text = { OutlinedTextField(value = newName, onValueChange = { newName = it }, label = { Text("নাম") }, singleLine = true) },
        confirmButton = { TextButton(onClick = {
            val value = newName.trim()
            scope.launch {
                val ok = when (nameKind) {
                    "subject" -> repository.addSubject(value)
                    "chapter" -> repository.addChapter(subjectId, value)
                    "renameSubject" -> repository.renameSubject(nameEntityId, value)
                    else -> repository.renameChapter(nameEntityId, value)
                }
                if (ok) { nameDialog = false; newName = "" }
            }
        }) { Text("সংরক্ষণ") } },
        dismissButton = { TextButton(onClick = { nameDialog = false }) { Text("বাতিল") } },
    )

    pendingDeleteQuestionId?.let { questionId ->
        AlertDialog(
            onDismissRequest = { pendingDeleteQuestionId = null },
            title = { Text("প্রশ্নটি মুছবেন?") },
            text = { Text("এই Chapter_CQ প্রশ্নটি মুছে যাবে। সংরক্ষিত প্রশ্নপত্রে ব্যবহৃত থাকলে ডাটাবেস মুছতে বাধা দেবে।") },
            confirmButton = { TextButton(onClick = {
                pendingDeleteQuestionId = null
                scope.launch {
                    val removed = repository.deleteQuestion(questionId, chapterId)
                    deleteError = if (removed) "প্রশ্ন মুছে ফেলা হয়েছে।" else "প্রশ্নটি মুছতে পারেনি; এটি কোনো সংরক্ষিত প্রশ্নপত্রে ব্যবহৃত হতে পারে।"
                }
            }) { Text("মুছুন") } },
            dismissButton = { TextButton(onClick = { pendingDeleteQuestionId = null }) { Text("বাতিল") } },
        )
    }

    if (duplicateDialog) AlertDialog(
        onDismissRequest = { if (!savingQuestion) duplicateDialog = false },
        title = { Text("একই লেখা আগে আছে") },
        text = { Text("এই অধ্যায়ে একই লেখা পাওয়া গেছে। তবুও সংরক্ষণ করবেন?") },
        confirmButton = { TextButton(onClick = { saveQuestion(forceDuplicate = true) }, enabled = !savingQuestion) { Text("তবু সংরক্ষণ") } },
        dismissButton = { TextButton(onClick = { duplicateDialog = false }, enabled = !savingQuestion) { Text("ফিরে যান") } },
    )

    if (editorOpen) {
        val occupiedLabelsForEditor = if (stimulusId != null)
            allQuestionGroups.firstOrNull { it.stimulusId == stimulusId }?.questions
                ?.filterNot { it.row.questionId == editingId }?.map { it.row.label }?.toSet().orEmpty()
        else emptySet()
        val chapterLabelMenuOptions = if (editorMode == EditorMode.FULL)
            listOf("ক", "খ", "গ", "ঘ").filter { it != label && it !in occupiedLabelsForEditor }
        else emptyList()
        val closeEditor: () -> Unit = {
            if (history.canUndo && !savingQuestion) editorCloseConfirm = true else if (!savingQuestion) editorOpen = false
        }
        val chapterStimulusAdder = rememberStimulusImageAdder(
            pipeline = imagePipeline,
            imageScope = ImageScope.CHAPTER_CQ,
            images = stimulusImages,
            enabled = !savingQuestion,
        ) { images -> stimulusImages = images; recordForm("stimulus-images") }
        val onChapterSolutionPartsChanged: (List<QuestionSolutionPart>) -> Unit = { parts ->
            val ordered = parts.sortedBy { it.position }.toMutableList()
            if (ordered.none { it.partType != "IMAGE" }) {
                ordered += QuestionSolutionPart("chapter_cq:$draftOwnerId:text:auto", "TEXT", ordered.size.toLong(), textContent = "")
            }
            solutionPartsDraft = ordered.mapIndexed { index, part -> part.copy(position = index.toLong()) }
            solutionTexts = solutionPartsDraft.filter { it.partType != "IMAGE" }.sortedBy { it.position }.mapNotNull { it.textContent }.ifEmpty { listOf("") }
            recordForm("solution-images")
        }
        val chapterSolutionStartAdder = rememberSolutionImageAdder(
            pipeline = imagePipeline,
            imageScope = ImageScope.CHAPTER_CQ,
            parts = solutionPartsDraft,
            enabled = !savingQuestion,
            onChange = onChapterSolutionPartsChanged,
            insertAtStart = true,
        )
        val chapterSolutionEndAdder = rememberSolutionImageAdder(
            pipeline = imagePipeline,
            imageScope = ImageScope.CHAPTER_CQ,
            parts = solutionPartsDraft,
            enabled = !savingQuestion,
            onChange = onChapterSolutionPartsChanged,
        )
        Dialog(
            onDismissRequest = closeEditor,
            properties = DialogProperties(usePlatformDefaultWidth = false),
        ) {
            Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                Column(Modifier.fillMaxSize()) {
                    EditorTopBar(
                        title = if (editingId == null) "প্রশ্ন যোগ" else "প্রশ্ন সম্পাদনা",
                        unsaved = history.canUndo,
                        canUndo = history.canUndo && !savingQuestion,
                        canRedo = history.canRedo && !savingQuestion,
                        saving = savingQuestion,
                        saveEnabled = !editorLoading && !savingQuestion && questionText.isNotBlank() && (marks.toDoubleOrNull()?.let { it.isFinite() && it > 0.0 } == true),
                        onClose = closeEditor,
                        onUndo = { history.undo()?.let { restoreForm(it); queueEditorDraft() } },
                        onRedo = { history.redo()?.let { restoreForm(it); queueEditorDraft() } },
                        onSave = { saveQuestion() },
                    )
                    Surface(color = MaterialTheme.colorScheme.surface) {
                        Box(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
                            EditorModeTabs(editorMode, !savingQuestion && !editorLoading) { mode -> editorMode = mode; recordForm("mode") }
                        }
                    }
                    if (editorLoading) {
                        Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                            Text(if (savingQuestion) "সংরক্ষণ হচ্ছে…" else "তথ্য লোড হচ্ছে…")
                        }
                    } else {
                        Column(
                            Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(16.dp),
                        ) {
                            Text(if (draftSaved) "ড্রাফট সংরক্ষিত ✓" else "পরিবর্তন ড্রাফটে সংরক্ষিত হবে…", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            if (editorLoadError.isNotBlank()) Text(editorLoadError, color = MaterialTheme.colorScheme.error)

                            // The hierarchy section is read-only in Chapter CQ; the chapter chosen in navigation owns this editor.
                            EdCard {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    EdIconGlyph(EdIcon.LAYERS, MaterialTheme.colorScheme.primary)
                                    Column(Modifier.weight(1f)) {
                                        Text("বিষয় ও অধ্যায়", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
                                        Text("${subjects.firstOrNull { it.subjectId == subjectId }?.name.orEmpty()}  ›  ${chapters.firstOrNull { it.chapterId == chapterId }?.name.orEmpty()}", style = MaterialTheme.typography.bodyMedium)
                                    }
                                }
                            }

                            EdCard {
                                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text("উদ্দীপক", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                                    EdIconButton(
                                        EdIcon.EYE, "উদ্দীপক প্রিভিউ", { stimulusPreviewOpen = !stimulusPreviewOpen },
                                        selected = stimulusPreviewOpen,
                                    )
                                    EdRatingPill(stimulusRating.toIntOrNull(), !savingQuestion) { stimulusRating = it?.toString().orEmpty(); recordForm("stimulus-rating") }
                                    EdIconButton(EdIcon.IMAGE_ADD, "উদ্দীপকে ছবি যোগ করুন", { chapterStimulusAdder.pick(null) }, enabled = !savingQuestion && !chapterStimulusAdder.importing, dashed = true)
                                }
                                EdStimulusImages(imagePipeline, ImageScope.CHAPTER_CQ, stimulusImages, !savingQuestion, chapterStimulusAdder) { images -> stimulusImages = images; recordForm("stimulus-images") }
                                EdTextArea(
                                    value = stimulus,
                                    onValueChange = { stimulus = it; recordForm("stimulus") },
                                    enabled = !savingQuestion,
                                    placeholder = "উদ্দীপক লিখুন (ঐচ্ছিক)",
                                    minHeight = if (editorMode == EditorMode.FULL) 150.dp else 88.dp,
                                    showMathBar = editorMode == EditorMode.FULL,
                                    previewTitle = "লাইভ প্রিভিউ (KaTeX)",
                                    externalPreviewOpen = stimulusPreviewOpen,
                                    showPreviewToggle = false,
                                )
                                EdReferenceField(value = reference, onValueChange = { reference = it; recordForm("reference") }, enabled = !savingQuestion)
                            }

                            EdCard {
                                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    EdLabelChip(
                                        label,
                                        chapterLabelMenuOptions.mapIndexed { index, value -> index to value },
                                        !savingQuestion && editorMode == EditorMode.FULL && chapterLabelMenuOptions.isNotEmpty(),
                                        onPick = { selected ->
                                            label = chapterLabelMenuOptions.getOrElse(selected) { label }
                                            recordForm("label")
                                        },
                                    )
                                    EdMarksField(0, marks.toDoubleOrNull() ?: 1.0, !savingQuestion, { marks = it.toString(); recordForm("marks") }, {})
                                    EdBoardPill(
                                        tags = selectedBoardTags,
                                        boards = boardItems,
                                        enabled = !savingQuestion,
                                        onChange = { wanted ->
                                            selectedBoardTags = wanted
                                            boardCode = wanted.firstOrNull()?.boardCode.orEmpty()
                                            boardYear = wanted.firstOrNull()?.year?.toString().orEmpty()
                                            recordForm("boards")
                                        },
                                        onAddBoard = { code, name ->
                                            val added = referenceRepository.addBoard(code, name)
                                            if (added) AddBoardResult.Added(BoardItem(code, name, true, false))
                                            else AddBoardResult.Failed("বোর্ড যোগ করা যায়নি বা কোডটি আগে থেকেই আছে।")
                                        },
                                    )
                                    EdIconButton(
                                        EdIcon.EYE, "প্রশ্নের প্রিভিউ", { questionPreviewOpen = !questionPreviewOpen },
                                        enabled = !savingQuestion, selected = questionPreviewOpen,
                                    )
                                    EdRatingPill(rating.toIntOrNull(), !savingQuestion) { rating = it?.toString().orEmpty(); recordForm("rating") }
                                }
                                EdTagChips(
                                    tags = selectedBoardTags,
                                    boards = boardItems,
                                    enabled = !savingQuestion,
                                    onChange = { wanted ->
                                        selectedBoardTags = wanted
                                        boardCode = wanted.firstOrNull()?.boardCode.orEmpty()
                                        boardYear = wanted.firstOrNull()?.year?.toString().orEmpty()
                                        recordForm("boards")
                                    },
                                )
                                EdTextArea(
                                    value = questionText,
                                    onValueChange = { questionText = it; recordForm("question") },
                                    enabled = !savingQuestion,
                                    placeholder = "প্রশ্ন লিখুন",
                                    minHeight = if (editorMode == EditorMode.FULL) 112.dp else 88.dp,
                                    showMathBar = editorMode == EditorMode.FULL,
                                    previewTitle = "প্রশ্নের প্রিভিউ (KaTeX)",
                                    externalPreviewOpen = questionPreviewOpen,
                                    showPreviewToggle = false,
                                )
                            }

                            EdCard {
                                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text("সমাধান", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
                                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                                            EdIconButton(
                                                EdIcon.EYE, "সমাধান প্রিভিউ", { solutionPreviewOpen = !solutionPreviewOpen },
                                                selected = solutionPreviewOpen,
                                            )
                                            EdIconButton(
                                                EdIcon.IMAGE_ADD, "সমাধানের শুরুতে ছবি যোগ করুন", { chapterSolutionStartAdder.pick(null) },
                                                enabled = !savingQuestion && !chapterSolutionStartAdder.importing, dashed = true,
                                            )
                                        }
                                    }
                                    val orderedSolutionParts = solutionPartsDraft.sortedBy { it.position }
                                    val displayedParts = if (orderedSolutionParts.any { it.partType != "IMAGE" }) orderedSolutionParts else {
                                        orderedSolutionParts + QuestionSolutionPart("chapter-empty-text", "TEXT", orderedSolutionParts.size.toLong(), textContent = solutionTexts.firstOrNull().orEmpty())
                                    }
                                    var textPartIndex = 0
                                    displayedParts.forEachIndexed { order, part ->
                                        if (part.partType == "IMAGE" && part.imageId != null) {
                                            EdThumbnail(
                                                pipeline = imagePipeline,
                                                imageId = part.imageId,
                                                imageScope = ImageScope.CHAPTER_CQ,
                                                enabled = !savingQuestion && !chapterSolutionStartAdder.importing,
                                                onReplace = { chapterSolutionStartAdder.pick(part.partId) },
                                                onRemove = {
                                                    solutionPartsDraft = solutionPartsDraft.filterNot { it.partId == part.partId }.mapIndexed { i, row -> row.copy(position = i.toLong()) }
                                                    solutionTexts = solutionPartsDraft.filter { it.partType == "TEXT" }.sortedBy { it.position }.mapNotNull { it.textContent }.ifEmpty { listOf("") }
                                                    syncMixedSolutionText()
                                                    recordForm("solution-image-remove")
                                                },
                                            )
                                        } else {
                                            val index = textPartIndex++
                                            val content = solutionTexts.getOrElse(index) { part.textContent.orEmpty() }
                                            Box {
                                                EdTextArea(
                                                    value = content,
                                                    onValueChange = { next ->
                                                        solutionTexts = solutionTexts.toMutableList().also { rows ->
                                                            while (rows.size <= index) rows.add("")
                                                            rows[index] = next
                                                        }
                                                        syncMixedSolutionText(); recordForm("solution-$index")
                                                    },
                                                    enabled = !savingQuestion,
                                                    placeholder = "সমাধান ${index + 1} লিখুন",
                                                    minHeight = if (editorMode == EditorMode.FULL) 112.dp else 88.dp,
                                                    showMathBar = editorMode == EditorMode.FULL,
                                                    previewTitle = "সমাধান ${index + 1} প্রিভিউ (KaTeX)",
                                                    showPreviewToggle = false,
                                                )
                                                if (solutionTexts.size > 1) {
                                                    EdSolutionRemoveButton(
                                                        onClick = {
                                                            val ordered = solutionPartsDraft.sortedBy { it.position }
                                                            val target = ordered.filter { it.partType != "IMAGE" }.getOrNull(index)
                                                            if (target != null && solutionTexts.size > 1) {
                                                                val remaining = ordered.filterNot { it.partId == target.partId }
                                                                    .mapIndexed { position, item -> item.copy(position = position.toLong()) }
                                                                solutionPartsDraft = remaining
                                                                solutionTexts = remaining.filter { it.partType != "IMAGE" }
                                                                    .map { it.textContent.orEmpty() }
                                                                recordForm("solution-remove-$index")
                                                            }
                                                        },
                                                        enabled = !savingQuestion,
                                                        modifier = Modifier.align(Alignment.TopEnd).padding(5.dp),
                                                    )
                                                }
                                            }
                                        }
                                    }
                                    if (solutionPreviewOpen) {
                                        EdInlinePreviewCard(
                                            title = "সমাধানের প্রিভিউ (KaTeX)",
                                            text = solutionTexts.filter { it.isNotBlank() }.joinToString("\n\n"),
                                        )
                                    }
                                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)) {
                                        EdIconButton(
                                            EdIcon.IMAGE_ADD, "সমাধানের শেষে ছবি যোগ করুন", { chapterSolutionEndAdder.pick(null) },
                                            enabled = !savingQuestion && !chapterSolutionEndAdder.importing, dashed = true,
                                        )
                                        EdIconButton(EdIcon.PLUS_BOX, "সমাধানের আরেকটি অংশ যোগ করুন", {
                                            solutionTexts = solutionTexts + ""; syncMixedSolutionText(); recordForm("solution-add")
                                        }, enabled = !savingQuestion, dashed = true)
                                    }
                                    if (chapterSolutionStartAdder.error.isNotBlank()) Text(chapterSolutionStartAdder.error, color = MaterialTheme.colorScheme.error)
                                    if (chapterSolutionEndAdder.error.isNotBlank()) Text(chapterSolutionEndAdder.error, color = MaterialTheme.colorScheme.error)
                                }

                            if (editorMode == EditorMode.FULL) {
                                EdCard {
                                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text("সংক্ষিপ্ত উত্তর (ঐচ্ছিক)", style = MaterialTheme.typography.labelLarge)
                                        EdIconButton(
                                            EdIcon.EYE, "সংক্ষিপ্ত উত্তরের প্রিভিউ", { answerPreviewOpen = !answerPreviewOpen },
                                            enabled = !savingQuestion, selected = answerPreviewOpen,
                                        )
                                    }
                                    EdTextArea(
                                        value = shortAnswer,
                                        onValueChange = { shortAnswer = it; recordForm("answer") },
                                        enabled = !savingQuestion,
                                        placeholder = "সংক্ষিপ্ত উত্তর (ঐচ্ছিক)",
                                        minHeight = 52.dp,
                                        showMathBar = true,
                                        previewTitle = "সংক্ষিপ্ত উত্তরের প্রিভিউ (KaTeX)",
                                        externalPreviewOpen = answerPreviewOpen,
                                        showPreviewToggle = false,
                                    )
                                }
                            }
                            EdCard {
                                EdCategoryDropdown(
                                    categories = categories.map { EdCategoryOption(it.categoryId, it.name, it.isArchived != 0L) },
                                    selectedIds = selectedCategories.toList(),
                                    enabled = !savingQuestion,
                                    onToggle = { categoryId, selected ->
                                        if (selected && categoryId !in selectedCategories) selectedCategories.add(categoryId)
                                        if (!selected) selectedCategories.remove(categoryId)
                                        recordForm("categories")
                                    },
                                    onAddCategory = { name -> categoryRepository.addChapterCategory(name) },
                                )
                            }
                            if (saveError.isNotBlank()) Text(saveError, color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
        }
    }

    if (editorCloseConfirm) AlertDialog(
        onDismissRequest = { editorCloseConfirm = false },
        title = { Text("পরিবর্তন সংরক্ষিত হয়নি") },
        text = { Text("এখন বন্ধ করলে সম্পাদনা থেকে বের হয়ে যাবেন। স্বয়ংক্রিয় ড্রাফট থাকলে পরে আবার ফিরে পেতে পারেন।") },
        confirmButton = { TextButton(onClick = { editorCloseConfirm = false; editorOpen = false }) { Text("বন্ধ করুন") } },
        dismissButton = { TextButton(onClick = { editorCloseConfirm = false }) { Text("সম্পাদনা চালিয়ে যান") } },
    )

    if (pendingBulkDeleteIds != null) AlertDialog(
        onDismissRequest = { pendingBulkDeleteIds = null },
        title = { Text("নির্বাচিত প্রশ্ন মুছবেন?") },
        text = { Text("${pendingBulkDeleteIds!!.size} টি নির্বাচিত প্রশ্ন মুছে যাবে। সংরক্ষিত প্রশ্নপত্রে কোনো প্রশ্ন ব্যবহৃত হলে পুরো batch বাতিল হবে।") },
        confirmButton = { TextButton(onClick = {
            val ids = pendingBulkDeleteIds.orEmpty(); pendingBulkDeleteIds = null
            scope.launch {
                val ok = repository.deleteQuestions(ids, chapterId)
                deleteError = if (ok) "${ids.size} টি প্রশ্ন মুছে ফেলা হয়েছে।" else "নির্বাচিত প্রশ্নগুলো মুছতে পারেনি; সংরক্ষিত প্রশ্নপত্রের reference থাকতে পারে।"
                if (ok) selectedQuestionIds = emptySet()
            }
        }) { Text("মুছুন") } },
        dismissButton = { TextButton(onClick = { pendingBulkDeleteIds = null }) { Text("বাতিল") } },
    )
    detailQuestionId?.let { id -> ChapterCqQuestionDetailDialog(id, repository, imagePipeline) { detailQuestionId = null } }

    Scaffold(topBar = { AppHeader(
        title = "Chapter CQ",
        subtitle = if (fixedChapterId != null) {
            val subjectName = subjects.firstOrNull { it.subjectId == subjectId }?.name.orEmpty()
            val chapterName = chapters.firstOrNull { it.chapterId == chapterId }?.name.orEmpty()
            listOf(subjectName, chapterName, "প্রশ্নসমূহ").filter { it.isNotBlank() }.joinToString(" › ")
        } else null,
        onBack = onBack,
        actions = {
            TextButton(onClick = { searchOpen = !searchOpen; if (!searchOpen) searchQuery = "" }) { Text(if (searchOpen) "বন্ধ" else "খুঁজুন") }
        },
    ) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (fixedChapterId == null) {
                Text("বিষয়", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    subjects.forEach { row -> TextButton(onClick = { subjectId = row.subjectId; chapterId = "" }) { Text(if (row.subjectId == subjectId) "✓ ${row.name}" else row.name) } }
                    TextButton(onClick = { nameKind = "subject"; newName = ""; nameDialog = true }) { Text("+ বিষয়") }
                    TextButton(onClick = {
                        subjects.firstOrNull { it.subjectId == subjectId }?.let { nameEntityId = it.subjectId; nameKind = "renameSubject"; newName = it.name; nameDialog = true }
                    }, enabled = subjectId.isNotBlank()) { Text("নাম পরিবর্তন") }
                }
                Text("অধ্যায়", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    chapters.forEach { row -> TextButton(onClick = { chapterId = row.chapterId }) { Text(if (row.chapterId == chapterId) "✓ ${row.name}" else row.name) } }
                    TextButton(onClick = { nameKind = "chapter"; newName = ""; nameDialog = true }, enabled = subjectId.isNotBlank()) { Text("+ অধ্যায়") }
                    TextButton(onClick = {
                        chapters.firstOrNull { it.chapterId == chapterId }?.let { nameEntityId = it.chapterId; nameKind = "renameChapter"; newName = it.name; nameDialog = true }
                    }, enabled = chapterId.isNotBlank()) { Text("নাম পরিবর্তন") }
                }
            }
            if (searchOpen) {
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    label = { Text("উদ্দীপক, প্রশ্ন, সমাধান, বোর্ড বা সাল খুঁজুন") },
                    trailingIcon = { TextButton(onClick = { searchQuery = "" }) { Text("মুছুন") } },
                )
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text("মোট প্রশ্ন: ${visibleQuestionCount}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text("উদ্দীপক/গ্রুপ: ${visibleQuestionGroups.size}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = { sortMenuOpen = true }) { Text("সাজান") }
                    DropdownMenu(expanded = sortMenuOpen, onDismissRequest = { sortMenuOpen = false }) {
                        listOf("DEFAULT" to "ডিফল্ট", "RATING" to "রেটিং", "MARKS" to "নম্বর", "TYPE" to "প্রশ্নের ধরন").forEach { (key, title) ->
                            DropdownMenuItem(text = { Text(title) }, onClick = { sortMode = key; sortMenuOpen = false })
                        }
                    }
                    Button(onClick = { openNewQuestion() }, enabled = chapterId.isNotBlank()) { Text("+ প্রশ্ন") }
                }
            }
            if (cards.isNotEmpty()) Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton(onClick = {
                    val allIds = cards.map { it.questionId }.toSet()
                    selectedQuestionIds = if (selectedQuestionIds.containsAll(allIds)) selectedQuestionIds - allIds else selectedQuestionIds + allIds
                }) { Text(if (cards.isNotEmpty() && selectedQuestionIds.containsAll(cards.map { it.questionId })) "সব নির্বাচন বাতিল" else "সব নির্বাচন") }
                if (selectedQuestionIds.isNotEmpty()) {
                    Text("নির্বাচিত ${selectedQuestionIds.size} টি")
                    TextButton(onClick = { pendingBulkDeleteIds = selectedQuestionIds.toList() }) { Text("নির্বাচিত মুছুন", color = MaterialTheme.colorScheme.error) }
                }
            }
            if (chapterId.isBlank()) Text("প্রশ্ন দেখতে বা যোগ করতে একটি অধ্যায় নির্বাচন করুন।")
            if (deleteError.isNotBlank()) Text(deleteError, color = if (deleteError.contains("মুছে")) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
            visibleQuestionGroups.forEachIndexed { index, group ->
                val visibleIds = group.questions.map { it.row.questionId }
                ChapterCqQuestionGroupCard(
                    number = index + 1,
                    group = group,
                    visibleQuestionIds = visibleIds,
                    selectedQuestionIds = selectedQuestionIds,
                    boards = boardItems,
                    imagePipeline = imagePipeline,
                    onSelectionChange = { checked -> selectedQuestionIds = if (checked) selectedQuestionIds + visibleIds else selectedQuestionIds - visibleIds.toSet() },
                    onEdit = { id -> editingId = id; draftOwnerId = "edit:$id"; draftSaved = false; editorLoading = true; saveError = ""; editorLoadError = ""; editorOpen = true },
                    onView = { id -> detailQuestionId = id },
                    onCopy = { id -> scope.launch { deleteError = if (repository.duplicateQuestion(id, chapterId)) "প্রশ্নের সম্পূর্ণ কপি তৈরি হয়েছে।" else "কপি তৈরি করা যায়নি; archived reference বা data restriction থাকতে পারে।" } },
                    onAddToGroup = { stimulusIdToReuse -> openNewQuestion(stimulusIdToReuse) },
                    onDelete = { ids -> pendingBulkDeleteIds = ids },
                )
            }
            if (visibleQuestionGroups.isEmpty() && chapterId.isNotBlank()) {
                Text(if (cards.isEmpty()) "এই অধ্যায়ে এখনো প্রশ্ন যোগ করা হয়নি।" else "কোনো মিল পাওয়া যায়নি।")
            }
        }
    }
}
