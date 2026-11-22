package com.questionbank.app.ui.question

import com.questionbank.app.ActivityLog
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.questionbank.app.domain.question.AddBoardResult
import com.questionbank.app.domain.question.BoardItem
import com.questionbank.app.domain.question.BoardTag
import com.questionbank.app.domain.question.BoardsInput
import com.questionbank.app.domain.question.CqLabel
import com.questionbank.app.domain.question.DraftText
import com.questionbank.app.domain.question.QuestionGroupInput
import com.questionbank.app.domain.question.QuestionStimulusImage
import com.questionbank.app.domain.question.QuestionSolutionPart
import com.questionbank.app.domain.question.RatingsInput
import com.questionbank.app.domain.question.SaveResult
import com.questionbank.app.domain.question.SubQuestionInput
import com.questionbank.app.domain.question.TypeCqQuestionRepository
import com.questionbank.app.domain.editor.EditorSessionDraft
import com.questionbank.app.domain.editor.EditorSessionDraftCodec
import com.questionbank.app.domain.editor.EditorScope as CanonicalEditorScope
import com.questionbank.app.domain.editor.EditorMode as CanonicalEditorMode
import com.questionbank.app.domain.editor.TypeCqDraftAdapter
import com.questionbank.app.domain.repository.EditorDraftRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.delay

/** Draft state shown under the title. */
enum class DraftStatus { NONE, WAITING, SAVED }

/**
 * Editor state lives in Compose snapshot state (not a Flow) so typing never races with the keyboard.
 *
 * Draft: every change is queued to a writer that runs in [draftScope] (the application scope), NOT in viewModelScope, so
 * leaving the screen or closing the app never cancels the last write. The queue is conflated: while one write is running
 * only the newest text waits, so typing is never slowed down and no text is lost.
 *
 * Save: the draft writer is stopped first (no draft write can overlap or follow the save), everything is saved in one
 * transaction (the repository removes the draft in that same transaction), and on any failure the writer is restarted and
 * the typed text is written as a draft again at once. The fields are cleared only after SaveResult.Saved.
 */
class QuestionEditorViewModel(
    private val topicId: String,
    private val repository: TypeCqQuestionRepository,
    private val draftScope: CoroutineScope,
    questionTypesFlow: Flow<List<com.questionbank.app.data.local.entity.TypeCqQuestionTypesEntity>> = flowOf(emptyList()),
    categoriesFlow: Flow<List<com.questionbank.app.data.local.entity.TypeCqQuestionCategoriesEntity>> = flowOf(emptyList()),
    private val duplicateChecker: suspend (String) -> Boolean = { false },
    private val editorDraftRepository: EditorDraftRepository? = null,
    defaultEditorMode: EditorMode = EditorMode.MINIMUM,
    private val addCategoryAction: suspend (String) -> Boolean = { false },
) : ViewModel() {

    var loaded by mutableStateOf(false)
        private set
    var draft by mutableStateOf(DraftText())
        private set
    var draftStatus by mutableStateOf(DraftStatus.NONE)
        private set
    var saving by mutableStateOf(false)
        private set
    var result by mutableStateOf<SaveResult?>(null)
        private set
    var restoredFromDraft by mutableStateOf(false)
        private set
    var editorMode by mutableStateOf(defaultEditorMode)
        private set
    var duplicateWarning by mutableStateOf(false)
        private set
    var checkingDuplicate by mutableStateOf(false)
        private set
    private val history = EditorHistory(DraftText())
    private var duplicateJob: Job? = null
    private var canonicalDraftTemplate: EditorSessionDraft? = null
    val canUndo: Boolean get() = history.canUndo
    val canRedo: Boolean get() = history.canRedo

    /** v0.2.30c-2: the board catalog for the picker (built-in boards and the custom ones). */
    val boardCatalog: StateFlow<List<BoardItem>> =
        repository.observeBoards().stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val questionTypeLabels: StateFlow<Map<String, String>> = questionTypesFlow.map { rows -> rows.associate { it.questionTypeId to it.label } }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyMap())
    val categoryCatalog: StateFlow<List<com.questionbank.app.data.local.entity.TypeCqQuestionCategoriesEntity>> =
        categoriesFlow.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    private var pending = Channel<DraftText>(Channel.CONFLATED)
    private var writer: Job? = null

    init {
        startWriter()
        viewModelScope.launch {
            val canonical = runCatching { editorDraftRepository?.load("type_cq", topicId)?.let(EditorSessionDraftCodec::decode) }
                .getOrNull()?.takeIf { it.scope == CanonicalEditorScope.TYPE_CQ && it.ownerId == topicId }
            canonicalDraftTemplate = canonical
            val stored = canonical?.let(TypeCqDraftAdapter::toLegacy) ?: repository.loadDraft(topicId)
            if (stored != null && (!stored.isBlank || canonical != null)) {
                draft = stored
                history.reset(stored)
                restoredFromDraft = true
                draftStatus = DraftStatus.SAVED
                // Migrate a legacy DraftText payload to the shared schema without removing the old recovery copy.
                if (canonical == null) pending.trySend(stored)
            }
            if (canonical != null) editorMode = if (canonical.mode == CanonicalEditorMode.FULL) EditorMode.FULL else EditorMode.MINIMUM
            loaded = true
            scheduleDuplicateCheck()
        }
    }

    private fun startWriter() {
        val queue = Channel<DraftText>(Channel.CONFLATED)
        pending = queue
        writer = draftScope.launch {
            for (text in queue) {
                repository.saveDraft(topicId, text)
                val previous = canonicalDraftTemplate
                val canonical = TypeCqDraftAdapter.fromLegacy(
                    ownerId = topicId,
                    draft = text,
                    mode = if (editorMode == EditorMode.FULL) CanonicalEditorMode.FULL else CanonicalEditorMode.MINIMUM,
                    previous = previous,
                )
                canonicalDraftTemplate = canonical
                try {
                    if (text.isBlank && canonical.questionBlocks.all { it.categoryIds.isEmpty() && it.solutionParts.isEmpty() } && canonical.stimulus.images.isEmpty()) editorDraftRepository?.discard("type_cq", topicId)
                    else editorDraftRepository?.save("type_cq", topicId, EditorSessionDraftCodec.encode(canonical))
                } catch (_: Exception) { /* legacy draft remains recoverable */ }
                if (text == draft) draftStatus = if (text.isBlank) DraftStatus.NONE else DraftStatus.SAVED
            }
        }
    }

    fun setStimulus(value: String) = change(draft.copy(stimulus = value), "stimulus")
    fun setReferenceText(value: String) = change(draft.copy(referenceText = value), "reference")
    fun setStimulusImages(value: List<QuestionStimulusImage>) = change(
        draft.copy(stimulusImages = value.mapIndexed { index, row -> row.copy(position = index.toLong()) }),
        "stimulus-images",
    )
    fun setSolutionImageParts(index: Int, value: List<QuestionSolutionPart>) {
        val rows = (draft.solutionPartsByLabel ?: CqLabel.entries.mapIndexed { i, _ ->
            draft.solutionTexts.getOrNull(i).orEmpty().mapIndexed { partIndex, text ->
                QuestionSolutionPart("type_cq:$topicId:${CqLabel.entries[i].letter}:text:$partIndex", "TEXT", partIndex.toLong(), textContent = text)
            }
        }).toMutableList()
        if (index !in rows.indices) return
        val sorted = value.sortedBy { it.position }
        val withText = if (sorted.any { it.partType != "IMAGE" }) sorted else sorted + QuestionSolutionPart(
            "type_cq:$topicId:${CqLabel.entries[index].letter}:text:auto",
            "TEXT",
            sorted.size.toLong(),
            textContent = "",
        )
        val ordered = withText.mapIndexed { position, part -> part.copy(position = position.toLong()) }
        rows[index] = ordered
        val texts = draft.solutionTexts.toMutableList().also { list -> list[index] = ordered.filter { it.partType != "IMAGE" }.mapNotNull { it.textContent } }
        change(draft.copy(solutionTexts = texts, solutionPartsByLabel = rows), "solution-mixed-$index")
    }
    fun setQuestionType(index: Int, value: String) = change(draft.copy(questionTypeIds = draft.questionTypeIds.toMutableList().also { it[index] = value }), "type-$index")
    fun changeCategory(index: Int, categoryId: String, selected: Boolean) {
        if (saving || index !in 0..3 || categoryId.isBlank()) return
        val rows = (draft.categoryIdsByLabel ?: List(4) { emptyList() }).toMutableList()
        val current = rows[index]
        val next = if (selected) (current + categoryId).distinct() else current.filterNot { it == categoryId }
        if (next == current) return
        rows[index] = next
        change(draft.copy(categoryIdsByLabel = rows), "category-$index")
    }
    suspend fun addCategory(name: String): Boolean =
        if (saving || name.isBlank()) false else runCatching { addCategoryAction(name.trim()) }.getOrDefault(false)
    fun setMarks(index: Int, value: Double) = change(draft.copy(marks = draft.marks.toMutableList().also { it[index] = value }), "marks-$index")
    private fun syncDraftSolutionParts(source: DraftText, index: Int, nextTexts: List<String>): DraftText {
        val labels = CqLabel.entries
        if (index !in labels.indices) return source
        val existing = source.solutionPartsByLabel?.getOrNull(index) ?: source.solutionTexts.getOrNull(index).orEmpty().mapIndexed { partIndex, text ->
            QuestionSolutionPart("type_cq:$topicId:${labels[index].letter}:text:$partIndex", "TEXT", partIndex.toLong(), textContent = text)
        }
        val next = mutableListOf<QuestionSolutionPart>()
        var textIndex = 0
        existing.sortedBy { it.position }.forEach { part ->
            if (part.partType == "IMAGE") next += part.copy(position = next.size.toLong())
            else if (textIndex < nextTexts.size) {
                next += part.copy(textContent = nextTexts[textIndex], imageId = null, position = next.size.toLong())
                textIndex++
            }
        }
        while (textIndex < nextTexts.size) {
            next += QuestionSolutionPart("type_cq:$topicId:${labels[index].letter}:text:$textIndex", "TEXT", next.size.toLong(), textContent = nextTexts[textIndex])
            textIndex++
        }
        val allRows = (source.solutionPartsByLabel ?: labels.mapIndexed { i, _ ->
            source.solutionTexts.getOrNull(i).orEmpty().mapIndexed { partIndex, text ->
                QuestionSolutionPart("type_cq:$topicId:${labels[i].letter}:text:$partIndex", "TEXT", partIndex.toLong(), textContent = text)
            }
        }).toMutableList()
        allRows[index] = next
        val texts = source.solutionTexts.toMutableList().also { it[index] = next.filter { part -> part.partType == "TEXT" }.mapNotNull { it.textContent } }
        return source.copy(solutionTexts = texts, solutionPartsByLabel = allRows)
    }

    fun setSolutionText(index: Int, part: Int, value: String) {
        val rows = draft.solutionTexts.toMutableList()
        if (index !in rows.indices || part !in rows[index].indices) return
        rows[index] = rows[index].toMutableList().also { it[part] = value }
        change(syncDraftSolutionParts(draft.copy(solutionTexts = rows), index, rows[index]), "solution-$index-$part")
    }
    fun ensureSolutionText(index: Int) {
        if (index !in draft.solutionTexts.indices || draft.solutionTexts[index].isNotEmpty()) return
        val rows = draft.solutionTexts.toMutableList().also { it[index] = listOf("") }
        change(syncDraftSolutionParts(draft.copy(solutionTexts = rows), index, rows[index]), "solution-init-$index")
    }
    fun addSolutionText(index: Int) {
        if (index !in draft.solutionTexts.indices) return
        val rows = draft.solutionTexts.toMutableList().also { row ->
            row[index] = if (row[index].isEmpty()) listOf("", "") else row[index] + ""
        }
        change(syncDraftSolutionParts(draft.copy(solutionTexts = rows), index, rows[index]), "solution-add-$index")
    }
    fun removeSolutionText(index: Int, part: Int) {
        if (index !in draft.solutionTexts.indices || part !in draft.solutionTexts[index].indices) return
        val currentTexts = draft.solutionTexts[index]
        // The remove control is only visible for multiple text boxes; retain one box as the minimum.
        if (currentTexts.size <= 1) return
        val label = CqLabel.entries[index]
        val existing = draft.solutionPartsByLabel?.getOrNull(index)?.takeIf { it.isNotEmpty() }
            ?: currentTexts.mapIndexed { textIndex, text ->
                QuestionSolutionPart(
                    "type_cq:$topicId:${label.letter}:text:$textIndex",
                    "TEXT",
                    textIndex.toLong(),
                    textContent = text,
                )
            }
        val ordered = existing.sortedBy { it.position }
        val target = ordered.filter { it.partType != "IMAGE" }.getOrNull(part) ?: return
        // Remove by part identity, not by rebuilding text positions: images between text boxes must stay in place.
        val remaining = ordered.filterNot { it.partId == target.partId }
            .mapIndexed { position, item -> item.copy(position = position.toLong()) }
        val allRows = (draft.solutionPartsByLabel ?: CqLabel.entries.mapIndexed { rowIndex, rowLabel ->
            draft.solutionTexts.getOrNull(rowIndex).orEmpty().mapIndexed { textIndex, text ->
                QuestionSolutionPart(
                    "type_cq:$topicId:${rowLabel.letter}:text:$textIndex",
                    "TEXT",
                    textIndex.toLong(),
                    textContent = text,
                )
            }
        }).toMutableList()
        allRows[index] = remaining
        val rows = draft.solutionTexts.toMutableList().also { values ->
            values[index] = remaining.filter { it.partType != "IMAGE" }.map { it.textContent.orEmpty() }
        }
        change(draft.copy(solutionTexts = rows, solutionPartsByLabel = allRows), "solution-remove-$index")
    }
    fun setText(index: Int, value: String) =
        change(draft.copy(texts = draft.texts.toMutableList().also { it[index] = value }), "question-$index")
            .also { scheduleDuplicateCheck() }

    fun setAnswer(index: Int, value: String) =
        change(draft.copy(answers = draft.answers.toMutableList().also { it[index] = value }), "answer-$index")

    /** v0.2.30b: [value] 1-5, or null to clear. */
    fun changeStimulusRating(value: Int?) = change(draft.copy(stimulusRating = value), "stimulus-rating")

    fun changeRating(index: Int, value: Int?) =
        change(draft.copy(ratings = draft.ratings.toMutableList().also { it[index] = value }), "rating-$index")

    /** v0.2.30c-2: the full wanted tag list of the stimulus / of ক..ঘ (an empty list clears). */
    fun changeStimulusBoards(value: List<BoardTag>) = change(draft.copy(stimulusBoards = value), "stimulus-boards")

    fun changeBoards(index: Int, value: List<BoardTag>) =
        change(draft.copy(boards = draft.boards.toMutableList().also { it[index] = value }), "boards-$index")

    suspend fun addBoard(code: String, name: String): AddBoardResult = repository.addCustomBoard(code, name)

    private fun <T> swappedList(list: List<T>, a: Int, b: Int): List<T> =
        list.toMutableList().also { val t = it[a]; it[a] = it[b]; it[b] = t }

    /** Editor design: moves a question block to another label slot (ক..ঘ) by swapping every per-label field of the two slots. */
    fun swapBlocks(a: Int, b: Int) {
        val last = CqLabel.entries.lastIndex
        if (a == b || a !in 0..last || b !in 0..last) return
        change(
            draft.copy(
                texts = swappedList(draft.texts, a, b),
                answers = swappedList(draft.answers, a, b),
                ratings = swappedList(draft.ratings, a, b),
                boards = swappedList(draft.boards, a, b),
                questionTypeIds = swappedList(draft.questionTypeIds, a, b),
                marks = swappedList(draft.marks, a, b),
                solutionTexts = swappedList(draft.solutionTexts, a, b),
                solutionPartsByLabel = draft.solutionPartsByLabel?.let { swappedList(it, a, b) },
                categoryIdsByLabel = draft.categoryIdsByLabel?.let { swappedList(it, a, b) },
            ),
            "swap-$a-$b",
        )
    }

    /** Editor design: empties one question block (text, answer, rating, boards, solution) and restores its label defaults. */
    fun clearBlock(index: Int) {
        val label = CqLabel.entries.getOrNull(index) ?: return
        change(
            draft.copy(
                texts = draft.texts.toMutableList().also { it[index] = "" },
                answers = draft.answers.toMutableList().also { it[index] = "" },
                ratings = draft.ratings.toMutableList().also { it[index] = null },
                boards = draft.boards.toMutableList().also { it[index] = emptyList() },
                questionTypeIds = draft.questionTypeIds.toMutableList().also { it[index] = label.typeId },
                marks = draft.marks.toMutableList().also { it[index] = label.marks },
                solutionTexts = draft.solutionTexts.toMutableList().also { it[index] = emptyList() },
                solutionPartsByLabel = draft.solutionPartsByLabel?.toMutableList()?.also { it[index] = emptyList() },
                categoryIdsByLabel = draft.categoryIdsByLabel?.toMutableList()?.also { it[index] = emptyList() },
            ),
            "clear-block-$index",
        )
        scheduleDuplicateCheck()
    }

    fun clearAll() = change(DraftText(stimulusImages = emptyList(), solutionPartsByLabel = List(4) { emptyList() }), "clear")

    @JvmName("applyEditorMode")
    fun setEditorMode(mode: EditorMode) {
        if (saving || !loaded || editorMode == mode) return
        editorMode = mode
        // Mode is part of the durable editor session, not the question record.
        pending.trySend(draft)
    }

    fun undo() {
        if (saving || !loaded) return
        history.undo()?.let { applyHistory(it) }
    }

    fun redo() {
        if (saving || !loaded) return
        history.redo()?.let { applyHistory(it) }
    }

    private fun applyHistory(value: DraftText) {
        draft = value
        result = null
        restoredFromDraft = false
        draftStatus = DraftStatus.WAITING
        pending.trySend(value)
        scheduleDuplicateCheck()
    }

    private fun scheduleDuplicateCheck() {
        duplicateJob?.cancel()
        val current = draft.texts.filter { it.isNotBlank() }
        if (current.isEmpty()) {
            duplicateJob = null
            checkingDuplicate = false
            duplicateWarning = false
            return
        }
        checkingDuplicate = true
        val checkJob = viewModelScope.launch {
            val thisJob = coroutineContext[Job]
            try {
                delay(350)
                val found = current.any { text -> duplicateChecker(text) }
                coroutineContext.ensureActive()
                if (duplicateJob === thisJob) duplicateWarning = found
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                if (duplicateJob === thisJob) duplicateWarning = false
            } finally {
                // An older cancelled query must not hide the spinner for a newer query.
                if (duplicateJob === thisJob) checkingDuplicate = false
            }
        }
        duplicateJob = checkJob
    }

    fun dismissResult() {
        result = null
    }

    private fun change(next: DraftText, historyGroup: String) {
        if (saving || !loaded) return
        ActivityLog.changed(historyGroup, 0, next.stimulus, next.referenceText, next.texts, next.answers, next.solutionTexts)
        history.record(next, historyGroup)
        draft = next
        result = null
        restoredFromDraft = false
        draftStatus = DraftStatus.WAITING
        pending.trySend(next)
    }

    fun save(onSaved: () -> Unit) {
        if (saving || !loaded) return
        saving = true
        val snapshot = draft
        ActivityLog.action("CREATE", "SAVE (✓) pressed", "topic=$topicId")
        ActivityLog.event(
            "SAVE-DATA",
            "solution parts sent: " + snapshot.solutionPartsByLabel.orEmpty().withIndex().joinToString("; ") { (i, ps) ->
                "${CqLabel.entries[i].letter}=[" + ps.joinToString(", ") { "${it.partType}#${it.position}:${it.partId}" } + "]"
            },
        )
        viewModelScope.launch {
            pending.close()
            writer?.cancelAndJoin()
            // NonCancellable: if the person leaves the screen while saving, the transaction still finishes (it is atomic either way).
            val outcome = withContext(NonCancellable) {
                repository.saveGroup(
                    QuestionGroupInput(
                        topicId = topicId,
                        stimulusText = snapshot.stimulus,
                        referenceText = snapshot.referenceText,
                        editorDraftKey = if (editorDraftRepository != null) "draft:type_cq:editor:$topicId" else null,
                        subQuestions = CqLabel.entries.mapIndexed { i, label ->
                            SubQuestionInput(
                                label, snapshot.texts[i], snapshot.answers[i],
                                snapshot.questionTypeIds[i], snapshot.marks[i], snapshot.solutionTexts[i],
                            )
                        },
                        ratings = RatingsInput(
                            stimulus = snapshot.stimulusRating,
                            byLabel = CqLabel.entries.mapIndexed { i, label -> label to snapshot.ratings[i] }.toMap(),
                        ),
                        boards = BoardsInput(
                            stimulus = snapshot.stimulusBoards,
                            byLabel = CqLabel.entries.mapIndexed { i, label -> label to snapshot.boards[i] }.toMap(),
                        ),
                        categoriesByLabel = CqLabel.entries.mapIndexed { i, label ->
                            label to snapshot.categoryIdsByLabel?.getOrNull(i).orEmpty()
                        }.toMap(),
                        stimulusImages = snapshot.stimulusImages.orEmpty(),
                        solutionPartsByLabel = snapshot.solutionPartsByLabel?.let { rows ->
                            CqLabel.entries.mapIndexedNotNull { index, label -> label to rows.getOrNull(index).orEmpty().map {
                                QuestionSolutionPart(it.partId, it.partType, it.position, it.textContent, it.imageId)
                            } }.toMap()
                        }.orEmpty(),
                    )
                )
            }
            ActivityLog.event("SAVE-RESULT", "create save outcome = $outcome")
            if (outcome is SaveResult.Saved) {
                draft = DraftText()
                history.reset(draft)
                canonicalDraftTemplate = null
                duplicateWarning = false
                checkingDuplicate = false
                draftStatus = DraftStatus.NONE
                result = outcome
                startWriter()
                saving = false
                if (isActive) onSaved()
            } else {
                // Nothing was stored: keep every typed character and write the draft again right now.
                result = outcome
                startWriter()
                withContext(NonCancellable) { repository.saveDraft(topicId, snapshot) }
                // Also refresh the canonical copy: restore prefers it, and the cancelled writer may have left an older one.
                pending.trySend(snapshot)
                draftStatus = DraftStatus.SAVED
                saving = false
            }
        }
    }

    override fun onCleared() {
        // Let the writer finish the newest queued text, then stop. It runs in the application scope, so it is not cancelled.
        duplicateJob?.cancel()
        pending.close()
        super.onCleared()
    }

    companion object {
        fun factory(create: () -> QuestionEditorViewModel) = viewModelFactory { initializer { create() } }
    }
}
