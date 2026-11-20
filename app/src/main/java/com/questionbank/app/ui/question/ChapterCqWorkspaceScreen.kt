package com.questionbank.app.ui.question

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import com.questionbank.app.data.local.entity.BoardCatalogEntity
import com.questionbank.app.data.local.entity.ChapterCqQuestionBoardsEntity
import com.questionbank.app.data.local.entity.ChapterCqQuestionCategoryLinksEntity
import com.questionbank.app.data.local.entity.ChapterCqQuestionsEntity
import com.questionbank.app.data.local.entity.ChapterCqSolutionPartsEntity
import com.questionbank.app.data.local.entity.ChapterCqStimuliEntity
import com.questionbank.app.data.local.entity.ChapterCqStimulusImagesEntity
import com.questionbank.app.domain.question.QuestionSolutionPart
import com.questionbank.app.domain.question.QuestionStimulusImage
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
    // The form edits only the FIRST board/year (the same one it loads from the database). It replaces that tag and
    // keeps the others, so a changed or cleared board is not resurrected from the previous draft on restore.
    val selectedTags = buildList {
        if (boardCode.isNotBlank() && year != null) add(EditorBoardYear(boardCode, year))
        previousBlock?.boardYears.orEmpty().drop(1).filterNot { it.boardCode == boardCode }.forEach { add(it) }
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

/** Chapter_CQ has its own repository and schema; it intentionally has no Type_CQ question-type field. */
@Composable
fun ChapterCqWorkspaceScreen(
    repository: ChapterCqRepository,
    referenceRepository: TypeCqRepository,
    draftRepository: EditorDraftRepository,
    draftScope: CoroutineScope,
    imagePipeline: ImagePipeline,
    defaultEditorMode: EditorMode = EditorMode.MINIMUM,
    onBack: (() -> Unit)? = null,
) {
    val scope = rememberCoroutineScope()
    val subjects by repository.observeSubjects().collectAsState(initial = emptyList())
    val boards by referenceRepository.observeBoards().collectAsState(initial = emptyList())
    val categories by repository.observeCategories().collectAsState(initial = emptyList())
    var subjectId by rememberSaveable { mutableStateOf("") }
    val chapters by remember(subjectId) { repository.observeChapters(subjectId) }.collectAsState(initial = emptyList())
    var chapterId by rememberSaveable { mutableStateOf("") }
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
    var previewDialog by rememberSaveable { mutableStateOf(false) }
    var pendingDeleteQuestionId by rememberSaveable { mutableStateOf<String?>(null) }
    var deleteError by rememberSaveable { mutableStateOf("") }
    var selectedQuestionIds by remember { mutableStateOf(emptySet<String>()) }
    var pendingBulkDeleteIds by remember { mutableStateOf<List<String>?>(null) }
    var detailQuestionId by remember { mutableStateOf<String?>(null) }
    var sortMode by rememberSaveable { mutableStateOf("DEFAULT") }
    var sortMenuOpen by remember { mutableStateOf(false) }
    LaunchedEffect(chapterId) { selectedQuestionIds = emptySet() }
    val displayedCards = remember(cards, sortMode) {
        when (sortMode) {
            "RATING" -> cards.sortedWith(compareByDescending<com.questionbank.app.data.local.dao.ChapterCqQuestionCardDb> { it.rating ?: it.stimulusRating ?: 3L }.thenBy { it.questionId })
            "MARKS" -> cards.sortedWith(compareByDescending<com.questionbank.app.data.local.dao.ChapterCqQuestionCardDb> { it.marks }.thenBy { it.questionId })
            "TYPE" -> cards.sortedWith(compareBy<com.questionbank.app.data.local.dao.ChapterCqQuestionCardDb> { it.label }.thenBy { it.questionId })
            else -> cards
        }
    }
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
        solutionTexts, boardCode, boardYear, selectedCategories.toList(), editorMode, stimulusImages, solutionPartsDraft,
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
        editorMode = value.editorMode
        stimulusImages = value.stimulusImages
        solutionPartsDraft = value.solutionParts
        selectedCategories.clear(); selectedCategories.addAll(value.categories)
    }
    var labelMenu by remember { mutableStateOf(false) }
    var boardMenu by remember { mutableStateOf(false) }

    LaunchedEffect(subjects) {
        if (subjectId.isBlank() || subjects.none { it.subjectId == subjectId }) subjectId = subjects.firstOrNull()?.subjectId.orEmpty()
    }
    LaunchedEffect(chapters) {
        if (chapterId.isBlank() || chapters.none { it.chapterId == chapterId }) chapterId = chapters.firstOrNull()?.chapterId.orEmpty()
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
                solutionTexts = listOf(""); boardCode = ""; boardYear = ""
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
                boardCode = qBoards.firstOrNull()?.boardCode.orEmpty()
                boardYear = qBoards.firstOrNull()?.year?.toString().orEmpty()
                selectedCategories.clear()
                selectedCategories.addAll(repository.loadQuestionCategories(q.questionId).map { it.categoryId })
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

    fun openNewQuestion() {
        editingId = null
        stimulusId = null; stimulus = ""; reference = ""; stimulusRating = ""
        label = "ক"; marks = "1"; questionText = ""; shortAnswer = ""; rating = ""
        solutionTexts = listOf(""); boardCode = ""; boardYear = ""
        selectedCategories.clear(); previousBoards = emptyList(); previousParts = emptyList(); stimulusImages = emptyList(); solutionPartsDraft = emptyList(); saveError = ""
        editorMode = defaultEditorMode
        draftOwnerId = "new:$chapterId"
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
        if (markValue == null || !markValue.isFinite() || markValue <= 0.0) { saveError = "নম্বর শূন্যের বেশি হতে হবে।"; return }
        if (rating.isNotBlank() && ratingValue == null) { saveError = "প্রশ্নের রেটিং ১–৫-এর মধ্যে দিন।"; return }
        if (stimulusRating.isNotBlank() && parsedStimulusRating == null) { saveError = "উদ্দীপকের রেটিং ১–৫-এর মধ্যে দিন।"; return }
        val hasStimulusContent = stimulus.isNotBlank() || reference.isNotBlank() || stimulusImages.isNotEmpty()
        val stimRatingValue = parsedStimulusRating.takeIf { hasStimulusContent }
        val yearValue = boardYear.toLongOrNull()
        if (boardCode.isNotBlank() && (yearValue == null || yearValue !in 1900L..2200L)) { saveError = "বোর্ডের সাল ১৯০০–২২০০-এর মধ্যে দিন।"; return }
        if (boardCode.isNotBlank() && boards.none { it.code == boardCode && it.isArchived == 0L } &&
            previousBoards.none { it.boardCode == boardCode && it.year == yearValue }) {
            saveError = "নতুন করে শুধু সক্রিয় বোর্ড নির্বাচন করা যাবে।"; return
        }
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
                        val wantsStimulus = hasStimulusContent
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
                        val oldPrimary = previousBoards.firstOrNull()
                        val boardUnchanged = oldPrimary != null && oldPrimary.boardCode == boardCode && oldPrimary.year == yearValue
                        val boardRows = when {
                            boardCode.isBlank() -> emptyList()
                            oldPrimary == null -> listOf(ChapterCqQuestionBoardsEntity("ccqb_${UUID.randomUUID()}", qid, boardCode, yearValue!!, 0))
                            boardUnchanged -> previousBoards
                            else -> listOf(ChapterCqQuestionBoardsEntity("ccqb_${UUID.randomUUID()}", qid, boardCode, yearValue!!, 0)) +
                                previousBoards.drop(1).filterNot { it.boardCode == boardCode && it.year == yearValue }
                                    .mapIndexed { index, row -> row.copy(sortOrder = (index + 1).toLong()) }
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

    if (previewDialog) AlertDialog(
        onDismissRequest = { previewDialog = false },
        title = { Text("Chapter CQ প্রিভিউ") },
        text = {
            Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (stimulus.isNotBlank()) Text("উদ্দীপক\n$stimulus")
                if (reference.isNotBlank()) Text("রেফারেন্স\n$reference")
                Text("$label) · $marks নম্বর", fontWeight = FontWeight.Bold)
                Text(questionText)
                shortAnswer.takeIf { it.isNotBlank() }?.let { Text("উত্তর: $it") }
                solutionTexts.filter { it.isNotBlank() }.forEachIndexed { index, value -> Text("সমাধান ${index + 1}: $value") }
            }
        },
        confirmButton = { TextButton(onClick = { previewDialog = false }) { Text("বন্ধ") } },
    )

    if (duplicateDialog) AlertDialog(
        onDismissRequest = { if (!savingQuestion) duplicateDialog = false },
        title = { Text("একই লেখা আগে আছে") },
        text = { Text("এই অধ্যায়ে একই লেখা পাওয়া গেছে। তবুও সংরক্ষণ করবেন?") },
        confirmButton = { TextButton(onClick = { saveQuestion(forceDuplicate = true) }, enabled = !savingQuestion) { Text("তবু সংরক্ষণ") } },
        dismissButton = { TextButton(onClick = { duplicateDialog = false }, enabled = !savingQuestion) { Text("ফিরে যান") } },
    )

    if (editorOpen) AlertDialog(
        onDismissRequest = { if (!savingQuestion) editorOpen = false },
        title = { Text(if (editingId == null) "Chapter CQ প্রশ্ন যোগ" else "Chapter CQ প্রশ্ন সম্পাদনা") },
        text = {
            Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (editorLoading) Text(if (savingQuestion) "সংরক্ষণ হচ্ছে…" else "তথ্য লোড হচ্ছে…") else {
                    EditorModePicker(editorMode, true) { editorMode = it; recordForm("mode") }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        TextButton(onClick = { history.undo()?.let { restoreForm(it); queueEditorDraft() } }, enabled = history.canUndo) { Text("↶ Undo") }
                        TextButton(onClick = { history.redo()?.let { restoreForm(it); queueEditorDraft() } }, enabled = history.canRedo) { Text("↷ Redo") }
                    }
                    Text(if (draftSaved) "ড্রাফট সংরক্ষিত ✓" else "পরিবর্তন ড্রাফটে সংরক্ষিত হবে…", style = MaterialTheme.typography.bodySmall)
                    OutlinedTextField(value = stimulus, onValueChange = { stimulus = it; recordForm("stimulus") }, label = { Text("উদ্দীপক (ঐচ্ছিক)") }, minLines = 2)
                    StimulusImageAttachments(
                        pipeline = imagePipeline,
                        imageScope = ImageScope.CHAPTER_CQ,
                        images = stimulusImages,
                        enabled = !savingQuestion,
                        onChange = { stimulusImages = it; recordForm("stimulus-images") },
                    )
                    OutlinedTextField(value = reference, onValueChange = { reference = it; recordForm("reference") }, label = { Text("রেফারেন্স (ঐচ্ছিক)") }, minLines = 2)
                    OutlinedTextField(value = stimulusRating, onValueChange = { stimulusRating = it; recordForm("stimulus-rating") }, label = { Text("উদ্দীপক রেটিং (১–৫)") }, singleLine = true)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("উপপ্রশ্ন: $label")
                        TextButton(onClick = { labelMenu = true }) { Text("পরিবর্তন") }
                        DropdownMenu(expanded = labelMenu, onDismissRequest = { labelMenu = false }) {
                            listOf("ক", "খ", "গ", "ঘ").forEach { item -> DropdownMenuItem(text = { Text(item) }, onClick = { label = item; labelMenu = false; recordForm("label") }) }
                        }
                    }
                    OutlinedTextField(value = marks, onValueChange = { marks = it; recordForm("marks") }, label = { Text("নম্বর") }, singleLine = true)
                    if (editorMode == EditorMode.FULL) MathSymbolBar { symbol -> questionText += symbol; recordForm("question") }
                    OutlinedTextField(value = questionText, onValueChange = { questionText = it; recordForm("question") }, label = { Text("প্রশ্ন") }, minLines = 3)
                    OutlinedTextField(value = shortAnswer, onValueChange = { shortAnswer = it; recordForm("answer") }, label = { Text("সংক্ষিপ্ত উত্তর (ঐচ্ছিক)") }, minLines = 1)
                    OutlinedTextField(value = rating, onValueChange = { rating = it; recordForm("rating") }, label = { Text("প্রশ্ন রেটিং (১–৫)") }, singleLine = true)
                    if (editorMode == EditorMode.FULL) {
                        TextButton(onClick = { previewDialog = true }) { Text("প্রিভিউ দেখুন") }
                        solutionTexts.forEachIndexed { index, value ->
                            MathSymbolBar { symbol -> solutionTexts = solutionTexts.toMutableList().also { it[index] = value + symbol }; syncMixedSolutionText(); recordForm("solution-$index") }
                            OutlinedTextField(value = value, onValueChange = { v -> solutionTexts = solutionTexts.toMutableList().also { it[index] = v }; syncMixedSolutionText(); recordForm("solution-$index") }, label = { Text("সমাধান ${index + 1}") }, minLines = 2)
                            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                TextButton(onClick = {
                                    if (index > 0) solutionTexts = solutionTexts.toMutableList().also { row -> val v = row.removeAt(index); row.add(index - 1, v) }
                                    syncMixedSolutionText(); recordForm("solution-order")
                                }, enabled = index > 0) { Text("↑") }
                                TextButton(onClick = {
                                    if (index < solutionTexts.lastIndex) solutionTexts = solutionTexts.toMutableList().also { row -> val v = row.removeAt(index); row.add(index + 1, v) }
                                    syncMixedSolutionText(); recordForm("solution-order")
                                }, enabled = index < solutionTexts.lastIndex) { Text("↓") }
                                TextButton(onClick = { solutionTexts = solutionTexts.toMutableList().also { if (index in it.indices) it.removeAt(index) }; syncMixedSolutionText(); recordForm("solution-remove") }) { Text("সমাধান অংশ সরান") }
                            }
                        }
                        TextButton(onClick = { solutionTexts = solutionTexts + ""; syncMixedSolutionText(); recordForm("solution-add") }) { Text("+ সমাধান অংশ যোগ") }
                        SolutionImageAttachments(
                            pipeline = imagePipeline,
                            imageScope = ImageScope.CHAPTER_CQ,
                            parts = solutionPartsDraft,
                            enabled = !savingQuestion,
                            onChange = { parts -> solutionPartsDraft = parts; solutionTexts = parts.filter { it.partType == "TEXT" }.sortedBy { it.position }.mapNotNull { it.textContent }.ifEmpty { listOf("") }; recordForm("solution-images") },
                        )
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("বোর্ড: ${boardCode.ifBlank { "নির্বাচন করুন" }}")
                        TextButton(onClick = { boardMenu = true }) { Text("বোর্ড বাছাই") }
                        DropdownMenu(expanded = boardMenu, onDismissRequest = { boardMenu = false }) {
                            boards.filter { it.isArchived == 0L }.forEach { b -> DropdownMenuItem(text = { Text(b.displayName) }, onClick = { boardCode = b.code; boardMenu = false; recordForm("board") }) }
                            DropdownMenuItem(text = { Text("বোর্ড বাদ দিন") }, onClick = { boardCode = ""; boardYear = ""; boardMenu = false; recordForm("board") })
                        }
                    }
                    if (previousBoards.size > 1) Text("অতিরিক্ত ${previousBoards.size - 1}টি পুরোনো বোর্ড/সাল সম্পাদনার সময় অক্ষত থাকবে।", style = MaterialTheme.typography.bodySmall)
                    if (boardCode.isNotBlank()) OutlinedTextField(value = boardYear, onValueChange = { boardYear = it; recordForm("board-year") }, label = { Text("বোর্ডের সাল") }, singleLine = true)
                    Text("ক্যাটাগরি", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    categories.filter { it.isArchived == 0L || it.categoryId in selectedCategories }.forEach { category ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(checked = category.categoryId in selectedCategories, enabled = category.isArchived == 0L, onCheckedChange = { checked ->
                                if (checked && category.categoryId !in selectedCategories) selectedCategories.add(category.categoryId)
                                if (!checked) selectedCategories.remove(category.categoryId)
                                recordForm("categories")
                            })
                            Text(if (category.isArchived != 0L) "${category.name} (আর্কাইভড—আগের লিংক রাখা হয়েছে)" else category.name)
                        }
                    }
                    if (editorLoadError.isNotBlank()) Text(editorLoadError, color = MaterialTheme.colorScheme.error)
                    if (saveError.isNotBlank()) Text(saveError, color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = { TextButton(onClick = { saveQuestion() }, enabled = !editorLoading && !savingQuestion && editorLoadError.isBlank()) { Text(if (savingQuestion) "সংরক্ষণ হচ্ছে…" else "সংরক্ষণ") } },
        dismissButton = { TextButton(onClick = { editorOpen = false }, enabled = !savingQuestion) { Text("বাতিল") } },
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

    Scaffold(topBar = { AppHeader(title = "Chapter CQ", onBack = onBack) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
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
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("প্রশ্নসমূহ (${displayedCards.size})", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = { sortMenuOpen = true }) { Text("সাজান") }
                    DropdownMenu(expanded = sortMenuOpen, onDismissRequest = { sortMenuOpen = false }) {
                        listOf("DEFAULT" to "ডিফল্ট", "RATING" to "রেটিং", "MARKS" to "নম্বর", "TYPE" to "লেবেল").forEach { (key, title) ->
                            DropdownMenuItem(text = { Text(title) }, onClick = { sortMode = key; sortMenuOpen = false })
                        }
                    }
                    Button(onClick = ::openNewQuestion, enabled = chapterId.isNotBlank()) { Text("+ প্রশ্ন") }
                }
            }
            if (selectedQuestionIds.isNotEmpty()) Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                Text("নির্বাচিত ${selectedQuestionIds.size} টি")
                TextButton(onClick = { pendingBulkDeleteIds = selectedQuestionIds.toList() }) { Text("নির্বাচিত মুছুন", color = MaterialTheme.colorScheme.error) }
            }
            if (chapterId.isBlank()) Text("প্রশ্ন দেখতে বা যোগ করতে একটি অধ্যায় নির্বাচন করুন।")
            if (deleteError.isNotBlank()) Text(deleteError, color = if (deleteError.contains("মুছে") ) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
            displayedCards.forEach { card ->
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Checkbox(checked = card.questionId in selectedQuestionIds, onCheckedChange = { checked ->
                        selectedQuestionIds = if (checked) selectedQuestionIds + card.questionId else selectedQuestionIds - card.questionId
                    })
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("${card.label} · ${card.marks} নম্বর · রেটিং ${card.rating ?: card.stimulusRating ?: 3}", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                        card.stimulusText?.takeIf { it.isNotBlank() }?.let { Text("উদ্দীপক: $it") }
                        Text(card.questionText, style = MaterialTheme.typography.bodyLarge)
                        if (card.shortAnswer.isNotBlank()) Text("উত্তর: ${card.shortAnswer}", style = MaterialTheme.typography.bodySmall)
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            TextButton(onClick = { detailQuestionId = card.questionId }) { Text("বিস্তারিত") }
                            TextButton(onClick = { editingId = card.questionId; draftOwnerId = "edit:${card.questionId}"; draftSaved = false; editorLoading = true; saveError = ""; editorLoadError = ""; editorOpen = true }) { Text("সম্পাদনা") }
                            TextButton(onClick = { scope.launch { deleteError = if (repository.duplicateQuestion(card.questionId, chapterId)) "প্রশ্নের সম্পূর্ণ কপি তৈরি হয়েছে।" else "কপি তৈরি করা যায়নি; archived reference বা data restriction থাকতে পারে।" } }) { Text("কপি") }
                            TextButton(onClick = { pendingDeleteQuestionId = card.questionId }) { Text("মুছুন", color = MaterialTheme.colorScheme.error) }
                        }
                    }
                }
            }
            if (cards.isEmpty() && chapterId.isNotBlank()) Text("এই অধ্যায়ে এখনো প্রশ্ন যোগ করা হয়নি।")
        }
    }
}
