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
import com.questionbank.app.domain.question.QuestionStimulusImage
import com.questionbank.app.domain.question.QuestionSolutionPart
import com.questionbank.app.domain.question.ConceptContentPart
import com.questionbank.app.domain.question.GroupEditInput
import com.questionbank.app.domain.question.QuestionEditRules
import com.questionbank.app.domain.question.RatingsInput
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.domain.question.SubQuestionInput
import com.questionbank.app.domain.question.TypeCqQuestionRepository
import com.questionbank.app.domain.editor.EditorSessionDraft
import com.questionbank.app.domain.editor.EditorSessionDraftCodec
import com.questionbank.app.domain.editor.EditorScope as CanonicalEditorScope
import com.questionbank.app.domain.editor.EditorMode as CanonicalEditorMode
import com.questionbank.app.domain.editor.TypeCqDraftAdapter
import com.questionbank.app.domain.repository.EditorDraftRepository
import com.questionbank.app.domain.question.UpdateResult
import com.questionbank.app.data.local.entity.TypeCqQuestionCategoriesEntity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class EditLoad { LOADING, READY, MISSING }

/** Complete immutable payload queued to the application-scope draft writer. */
private data class EditDraftSnapshot(
    val text: DraftText,
    val categoryIdsByLabel: List<List<String>>,
    val deletedQuestionIds: Set<String>,
    val mode: EditorMode,
)

/** A null snapshot means "remove the draft" because the editor has returned to its stored state. */
private class EditDraftOp(val snapshot: EditDraftSnapshot?)

private data class EditSnapshot(
    val stimulus: String = "",
    val referenceText: String = "",
    val texts: List<String> = List(4) { "" },
    val answers: List<String> = List(4) { "" },
    val ratings: List<Int?> = List(4) { null },
    val stimulusRating: Int? = null,
    val boards: List<List<BoardTag>> = List(4) { emptyList() },
    val stimulusBoards: List<BoardTag> = emptyList(),
    val questionTypeIds: List<String> = CqLabel.entries.map { it.typeId },
    val marks: List<Double> = CqLabel.entries.map { it.marks },
    val solutionTexts: List<List<String>> = List(4) { emptyList() },
    val categoryIdsByLabel: List<List<String>> = List(4) { emptyList() },
    val deletedQuestionIds: Set<String> = emptySet(),
    val addedOptionalQuestionLabels: Set<CqLabel> = emptySet(),
    val stimulusImages: List<QuestionStimulusImage> = emptyList(),
    val solutionPartsByLabel: List<List<QuestionSolutionPart>> = List(4) { emptyList() },
    val conceptPartsByLabel: List<List<ConceptContentPart>> = List(4) { emptyList() },
    val cardCategoryId: String? = null,
)

/**
 * Edit screen of ONE existing card (v0.2.28 core, v0.2.29 drafts). The stored texts are loaded once; what the person types lives
 * in Compose snapshot state (typing never races with the keyboard, same choice as the new-question editor).
 *
 * Edit draft (v0.2.29, part B-2): every change is queued to a writer that runs in [draftScope] (the application scope), NOT in
 * viewModelScope, so leaving the screen or killing the app never cancels the last write. The queue is conflated: only the newest
 * text waits. The draft is stored under `draft:type_cq:edit:<groupKey>`; it exists only while the typed text differs from the
 * stored text. When the edit is opened again the draft is put back on top of the stored text (a draft equal to the stored text is
 * removed instead). Nothing of this touches the saved question: a draft is separate from the question rows.
 *
 * Save is still ONE all-or-nothing transaction ([TypeCqQuestionRepository.updateGroup]) that also removes the draft. The draft
 * writer is stopped first, so no draft write can follow the save; on a refusal or failure the writer is restarted and the typed
 * text is written as a draft again at once. "Discard" stops the writer, removes the draft and leaves.
 */
class QuestionEditViewModel(
    private val topicId: String,
    private val groupKey: String,
    private val repository: TypeCqQuestionRepository,
    private val draftScope: CoroutineScope,
    questionTypesFlow: Flow<List<com.questionbank.app.data.local.entity.TypeCqQuestionTypesEntity>> = flowOf(emptyList()),
    private val editorDraftRepository: EditorDraftRepository? = null,
    categoriesFlow: Flow<List<TypeCqQuestionCategoriesEntity>> = flowOf(emptyList()),
    defaultEditorMode: EditorMode = EditorMode.MINIMUM,
    private val addCategoryAction: suspend (String) -> Boolean = { false },
) : ViewModel() {

    var load by mutableStateOf(EditLoad.LOADING)
        private set
    var original by mutableStateOf<SavedGroup?>(null)
        private set
    var stimulus by mutableStateOf("")
        private set
    var referenceText by mutableStateOf("")
        private set
    var questionTypeIds by mutableStateOf(CqLabel.entries.map { it.typeId })
        private set
    var marks by mutableStateOf(CqLabel.entries.map { it.marks })
        private set
    var solutionTexts by mutableStateOf(List(4) { emptyList<String>() })
        private set
    var stimulusImages by mutableStateOf<List<QuestionStimulusImage>>(emptyList())
        private set
    var solutionPartsByLabel by mutableStateOf(List(4) { emptyList<QuestionSolutionPart>() })
        private set
    var editorMode by mutableStateOf(defaultEditorMode)
        private set
    private val history = EditorHistory(EditSnapshot())
    val canUndo: Boolean get() = history.canUndo
    val canRedo: Boolean get() = history.canRedo
    var texts by mutableStateOf(List(4) { "" })
        private set
    var answers by mutableStateOf(List(4) { "" })
        private set
    /** v0.2.30b: the stimulus rating and the rating of ক..ঘ as typed (1-5 or null = none). Changed with [changeStimulusRating] / [changeRating]. */
    var stimulusRating by mutableStateOf<Int?>(null)
        private set
    var ratings by mutableStateOf(List<Int?>(4) { null })
        private set
    /** v0.2.30c-2: boards and years of the stimulus and of ক..ঘ as typed, in the order chosen. Changed with [changeStimulusBoards] / [changeBoards]. */
    var stimulusBoards by mutableStateOf<List<BoardTag>>(emptyList())
        private set
    var boards by mutableStateOf<List<List<BoardTag>>>(List(4) { emptyList() })
        private set
    /** Legacy per-question category links loaded from each stored question; never used by the new card picker. */
    var categoryIdsByLabel by mutableStateOf(List(4) { emptyList<String>() })
        private set
    /** New independent category for the whole card. Null means no card category is selected. */
    var cardCategoryId by mutableStateOf<String?>(null)
        private set
    /** Concept rows staged for optional questions that do not have a database question ID yet. */
    var pendingConceptPartsByLabel by mutableStateOf(List(4) { emptyList<ConceptContentPart>() })
        private set
    var deletedQuestionIds by mutableStateOf<Set<String>>(emptySet())
        private set
    /** Optional K/Kh cards explicitly added in Full Editor for this edit session. */
    var addedOptionalQuestionLabels by mutableStateOf<Set<CqLabel>>(emptySet())
        private set
    /** The board catalog for the picker. */
    val boardCatalog: StateFlow<List<BoardItem>> =
        repository.observeBoards().stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val questionTypeLabels: StateFlow<Map<String, String>> = questionTypesFlow.map { rows -> rows.associate { it.questionTypeId to it.label } }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyMap())
    val categoryCatalog: StateFlow<List<TypeCqQuestionCategoriesEntity>> =
        categoriesFlow.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    var saving by mutableStateOf(false)
        private set
    var result by mutableStateOf<UpdateResult?>(null)
        private set
    /** True when the typed text came back from a saved edit draft; stays true until the first new change. */
    var restoredFromDraft by mutableStateOf(false)
        private set
    var draftStatus by mutableStateOf(DraftStatus.NONE)
        private set

    private var pending = Channel<EditDraftOp>(Channel.CONFLATED)
    private var writer: Job? = null
    private var canonicalDraftTemplate: EditorSessionDraft? = null
    private val canonicalDraftOwnerId: String get() = "edit:$groupKey"
    /** Set after a successful save or a discard: the screen is finished and no draft may be written any more. */
    private var finished = false

    init {
        viewModelScope.launch {
            val group = repository.loadGroup(topicId, groupKey)
            if (group == null) {
                // The card is gone: an old draft for it can never be used again.
                repository.discardEditDraft(groupKey)
                runCatching { editorDraftRepository?.discard("type_cq", canonicalDraftOwnerId) }
                load = EditLoad.MISSING
            } else {
                val t = MutableList(4) { "" }
                val a = MutableList(4) { "" }
                val r = MutableList<Int?>(4) { null }
                val b = MutableList<List<BoardTag>>(4) { emptyList() }
                val categoryRows = MutableList(4) { emptyList<String>() }
                for (sub in group.subQuestions) {
                    val label = sub.label ?: continue
                    categoryRows[label.sortOrder - 1] = sub.categoryIds
                    t[label.sortOrder - 1] = sub.text
                    a[label.sortOrder - 1] = sub.shortAnswer
                    r[label.sortOrder - 1] = sub.rating
                    b[label.sortOrder - 1] = sub.boards
                }
                original = group
                stimulus = group.stimulusText
                referenceText = group.referenceText
                texts = t
                answers = a
                stimulusRating = group.stimulusRating
                ratings = r
                stimulusBoards = group.stimulusBoards
                boards = b
                categoryIdsByLabel = categoryRows
                cardCategoryId = group.cardCategoryId
                val typeRows = CqLabel.entries.map { label -> group.subQuestions.firstOrNull { it.label == label }?.questionTypeId ?: label.typeId }
                val markRows = CqLabel.entries.map { label -> group.subQuestions.firstOrNull { it.label == label }?.marks ?: label.marks }
                val solutionRows = CqLabel.entries.map { label -> group.subQuestions.firstOrNull { it.label == label }?.solutionParts.orEmpty() }
                questionTypeIds = typeRows
                marks = markRows
                solutionTexts = solutionRows
                stimulusImages = group.stimulusImages
                solutionPartsByLabel = CqLabel.entries.map { label ->
                    group.subQuestions.firstOrNull { it.label == label }?.orderedSolutionParts.orEmpty().ifEmpty {
                        group.subQuestions.firstOrNull { it.label == label }?.solutionParts.orEmpty().mapIndexed { index, value ->
                            QuestionSolutionPart("type_cq:$groupKey:${label.letter}:text:$index", "TEXT", index.toLong(), textContent = value)
                        }
                    }
                }
                load = EditLoad.READY
                restoreDraft(group)
                history.reset(snapshot())
                startWriter()
                if (canonicalDraftTemplate == null && changed) pending.trySend(EditDraftOp(currentDraft()))
            }
        }
    }

    /** Puts a saved edit draft on top of the stored text. Only the blocks this screen can edit are taken from it. */
    private suspend fun restoreDraft(group: SavedGroup) {
        val canonical = runCatching { editorDraftRepository?.load("type_cq", canonicalDraftOwnerId)?.let(EditorSessionDraftCodec::decode) }
            .getOrNull()?.takeIf { it.scope == CanonicalEditorScope.TYPE_CQ && it.ownerId == canonicalDraftOwnerId }
        canonicalDraftTemplate = canonical
        val legacyRecoveryDraft = repository.loadEditDraft(groupKey)
        val canonicalRecoveryDraft = canonical?.let(TypeCqDraftAdapter::toLegacy)
        val stored = when {
            canonicalRecoveryDraft == null -> legacyRecoveryDraft
            legacyRecoveryDraft == null -> canonicalRecoveryDraft
            canonicalRecoveryDraft.cardCategoryTouched || canonicalRecoveryDraft.cardCategoryId != null -> canonicalRecoveryDraft
            legacyRecoveryDraft.cardCategoryTouched || legacyRecoveryDraft.cardCategoryId != null -> canonicalRecoveryDraft.copy(
                cardCategoryId = legacyRecoveryDraft.cardCategoryId,
                cardCategoryTouched = legacyRecoveryDraft.cardCategoryTouched,
            )
            else -> canonicalRecoveryDraft
        } ?: return
        if (canonical != null) editorMode = if (canonical.mode == CanonicalEditorMode.FULL) EditorMode.FULL else EditorMode.MINIMUM
        if (group.stimulusId != null) {
            stimulus = stored.stimulus
            referenceText = stored.referenceText
            stimulusRating = stored.stimulusRating
            stimulusBoards = stored.stimulusBoards
            stimulusImages = stored.stimulusImages ?: group.stimulusImages
        }
        val t = texts.toMutableList()
        val a = answers.toMutableList()
        val r = ratings.toMutableList()
        val b = boards.toMutableList()
        val qTypes = questionTypeIds.toMutableList()
        val markValues = marks.toMutableList()
        val solutionValues = solutionTexts.toMutableList()
        for (label in CqLabel.entries) {
            val i = label.sortOrder - 1
            t[i] = stored.texts[i]
            a[i] = stored.answers[i]
            r[i] = stored.ratings[i]
            b[i] = stored.boards[i]
            qTypes[i] = stored.questionTypeIds[i]
            markValues[i] = stored.marks[i]
            solutionValues[i] = stored.solutionTexts[i]
        }
        texts = t
        answers = a
        ratings = r
        boards = b
        questionTypeIds = qTypes
        marks = markValues
        solutionTexts = solutionValues
        if (stored.solutionPartsByLabel != null) solutionPartsByLabel = stored.solutionPartsByLabel
        if (stored.conceptPartsByLabel != null) {
            pendingConceptPartsByLabel = CqLabel.entries.map { label ->
                val existing = original?.subQuestions?.any { it.label == label && it.id !in deletedQuestionIds } == true
                if (existing) emptyList() else stored.conceptPartsByLabel.getOrNull(label.sortOrder - 1).orEmpty()
            }
        }
        // Old CIfix6 drafts mirrored a card choice into each label's legacy category list.
        // Do not restore those rows over the saved per-question links. Restore only the independent new field.
        if (stored.cardCategoryTouched || stored.cardCategoryId != null) cardCategoryId = stored.cardCategoryId
        else cardCategoryId = group.cardCategoryId
        deletedQuestionIds = canonical?.deletedQuestionIds?.toSet().orEmpty()
        if (changed || canonical != null) {
            restoredFromDraft = true
            draftStatus = DraftStatus.SAVED
        } else {
            // The draft says the same as the stored question (for example the same text was typed back): nothing to keep.
            repository.discardEditDraft(groupKey)
            runCatching { editorDraftRepository?.discard("type_cq", canonicalDraftOwnerId) }
            canonicalDraftTemplate = null
        }
    }

    private fun startWriter() {
        val queue = Channel<EditDraftOp>(Channel.CONFLATED)
        pending = queue
        writer = draftScope.launch {
            for (op in queue) {
                val snapshot = op.snapshot
                if (snapshot == null) {
                    repository.discardEditDraft(groupKey)
                    try { editorDraftRepository?.discard("type_cq", canonicalDraftOwnerId) } catch (_: Exception) { }
                } else {
                    repository.saveEditDraft(groupKey, snapshot.text)
                    val prior = canonicalDraftTemplate
                    val ids = original?.subQuestions?.sortedBy { it.label?.sortOrder ?: Int.MAX_VALUE }?.map { it.id }.orEmpty()
                    val canonical = canonicalDraft(snapshot, prior, ids)
                    canonicalDraftTemplate = canonical
                    try { editorDraftRepository?.save("type_cq", canonicalDraftOwnerId, EditorSessionDraftCodec.encode(canonical)) } catch (_: Exception) { }
                }
                if (snapshot == currentDraft()) draftStatus = if (snapshot == null) DraftStatus.NONE else DraftStatus.SAVED
            }
        }
    }

    private fun canonicalDraft(draft: EditDraftSnapshot, previous: EditorSessionDraft?, ids: List<String>): EditorSessionDraft {
        val base = TypeCqDraftAdapter.fromLegacy(
            ownerId = canonicalDraftOwnerId,
            draft = draft.text,
            mode = if (draft.mode == EditorMode.FULL) CanonicalEditorMode.FULL else CanonicalEditorMode.MINIMUM,
            existingStimulusId = original?.stimulusId,
            existingQuestionIds = ids,
            questionIdsByLabel = original?.subQuestions?.mapNotNull { sub -> sub.label?.let { it.letter to sub.id } }?.toMap(),
            previous = previous,
        )
        return base.copy(
            questionBlocks = base.questionBlocks.map { block ->
                val label = CqLabel.fromLetter(block.label)
                if (label == null) block else block.copy(categoryIds = draft.categoryIdsByLabel[label.sortOrder - 1].toList())
            },
            deletedQuestionIds = draft.deletedQuestionIds.toList().sorted(),
            cardCategoryId = draft.text.cardCategoryId,
            cardCategoryTouched = draft.text.cardCategoryTouched,
        )
    }

    private fun currentDraft(): EditDraftSnapshot? =
        if (changed || canonicalDraftTemplate != null) {
            EditDraftSnapshot(
                text = draftOf(),
                categoryIdsByLabel = categoryIdsByLabel.map { it.toList() },
                deletedQuestionIds = deletedQuestionIds.toSet(),
                mode = editorMode,
            )
        } else null

    private fun draftOf(): DraftText =
        DraftText(
            stimulus = stimulus, texts = texts, answers = answers, stimulusRating = stimulusRating, ratings = ratings,
            stimulusBoards = stimulusBoards, boards = boards, referenceText = referenceText,
            questionTypeIds = questionTypeIds, marks = marks, solutionTexts = solutionTexts,
            stimulusImages = stimulusImages,
            solutionPartsByLabel = solutionPartsByLabel,
            conceptPartsByLabel = CqLabel.entries.map { label ->
                val existing = original?.subQuestions?.firstOrNull { it.label == label && it.id !in deletedQuestionIds }
                if (existing != null) existing.conceptParts else pendingConceptPartsByLabel[label.sortOrder - 1]
            },
            categoryIdsByLabel = categoryIdsByLabel,
            cardCategoryId = cardCategoryId,
            cardCategoryTouched = cardCategoryId != original?.cardCategoryId,
        )

    private fun queueDraft() {
        if (finished || load != EditLoad.READY) return
        restoredFromDraft = false
        draftStatus = DraftStatus.WAITING
        pending.trySend(EditDraftOp(currentDraft()))
    }

    /** True for a card with a stimulus: all four blocks and the stimulus can be edited. A single question edits only its own block. */
    val hasStimulus: Boolean get() = original?.stimulusId != null

    /** The sub-question blocks shown on screen; Minimum keeps G/Gh and any saved or Full-added K/Kh cards. */
    val editableLabels: List<CqLabel>
        get() {
            val group = original ?: return emptyList()
            val labels = if (group.stimulusId != null) listOf(CqLabel.GA, CqLabel.GHA, CqLabel.KA, CqLabel.KHA)
                else group.subQuestions.mapNotNull { it.label }
            return labels.filter { label ->
                val index = label.sortOrder - 1
                val savedId = group.subQuestions.firstOrNull { it.label == label }?.id
                val notDeleted = savedId == null || savedId !in deletedQuestionIds
                val alreadyHasData = savedId != null || texts.getOrNull(index).orEmpty().isNotBlank() ||
                    answers.getOrNull(index).orEmpty().isNotBlank() ||
                    solutionTexts.getOrNull(index).orEmpty().any { it.isNotBlank() } ||
                    solutionPartsByLabel.getOrNull(index).orEmpty().any { it.partType == "IMAGE" } ||
                    boards.getOrNull(index).orEmpty().isNotEmpty() || ratings.getOrNull(index) != null ||
                    pendingConceptPartsByLabel.getOrNull(index).orEmpty().isNotEmpty() ||
                    questionTypeIds.getOrNull(index) != label.typeId || marks.getOrNull(index) != label.marks
                val explicitlyAdded = label in addedOptionalQuestionLabels
                val visibleInMode = when {
                    !hasStimulus -> alreadyHasData
                    editorMode == EditorMode.FULL -> alreadyHasData || explicitlyAdded
                    // Minimum shows the normal G/Gh cards plus any K/Kh question explicitly added in Full or already saved.
                    else -> label in setOf(CqLabel.GA, CqLabel.GHA) || alreadyHasData || explicitlyAdded
                }
                notDeleted && visibleInMode
            }.sortedBy { it.sortOrder }
        }

    /** K/Kh are optional on an existing stimulus group and appear only after an explicit Full Editor action. */
    fun canAddOptionalQuestion(label: CqLabel): Boolean {
        if (saving || finished || editorMode != EditorMode.FULL || !hasStimulus || label !in setOf(CqLabel.KA, CqLabel.KHA)) return false
        val group = original ?: return false
        val existsInStoredGroup = group.subQuestions.any { it.label == label }
        return !existsInStoredGroup && label !in addedOptionalQuestionLabels
    }

    fun addOptionalQuestion(label: CqLabel) {
        ActivityLog.action("EDIT", "addOptionalQuestion pressed", "label=${label.letter} saving=$saving finished=$finished")
        if (!canAddOptionalQuestion(label)) return
        addedOptionalQuestionLabels = addedOptionalQuestionLabels + label
        record("add-optional-${label.letter}")
    }

    val deletedQuestionLabels: List<CqLabel>
        get() = original?.subQuestions.orEmpty().filter { it.id in deletedQuestionIds }.mapNotNull { it.label }

    fun hasQuestionCard(label: CqLabel): Boolean = label in editableLabels

    fun shouldShowDeleteButton(label: CqLabel): Boolean {
        val group = original ?: return false
        return group.stimulusId != null &&
            (group.subQuestions.any { it.label == label && it.id !in deletedQuestionIds } || label in addedOptionalQuestionLabels)
    }

    fun canDeleteQuestion(label: CqLabel): Boolean {
        val group = original ?: return false
        if (group.stimulusId == null || !shouldShowDeleteButton(label)) return false
        val row = group.subQuestions.firstOrNull { it.label == label && it.id !in deletedQuestionIds }
        val remainingStored = group.subQuestions.count { it.id !in deletedQuestionIds && it.label != label }
        val pendingNew = editableLabels.count { candidate ->
            candidate != label && group.subQuestions.none { it.label == candidate } &&
                texts[candidate.sortOrder - 1].isNotBlank()
        }
        return remainingStored + pendingNew > 0 && (row != null || label in addedOptionalQuestionLabels)
    }

    private fun buildInput(): GroupEditInput =
        GroupEditInput(
            topicId = topicId,
            groupKey = groupKey,
            stimulusText = stimulus,
            subQuestions = editableLabels.map { label ->
                val i = label.sortOrder - 1
                SubQuestionInput(label, texts[i], answers[i], questionTypeIds[i], marks[i], solutionTexts[i])
            },
            // The ratings of exactly the blocks this screen shows; the stimulus rating only for a card that has a stimulus.
            ratings = RatingsInput(
                stimulus = if (hasStimulus) stimulusRating else null,
                byLabel = editableLabels.associateWith { ratings[it.sortOrder - 1] },
            ),
            // The tags of exactly the blocks this screen shows; the stimulus tags only for a card that has a stimulus.
            boards = BoardsInput(
                stimulus = if (hasStimulus) stimulusBoards else emptyList(),
                byLabel = editableLabels.associateWith { boards[it.sortOrder - 1] },
            ),
            referenceText = if (hasStimulus) referenceText else null,
            questionTypes = editableLabels.associateWith { questionTypeIds[it.sortOrder - 1] },
            marksByLabel = editableLabels.associateWith { marks[it.sortOrder - 1] },
            solutionsByLabel = editableLabels.associateWith { solutionTexts[it.sortOrder - 1] },
            categoriesByLabel = editableLabels.associateWith { categoryIdsByLabel[it.sortOrder - 1] },
            deletedQuestionIds = deletedQuestionIds,
            editorDraftKey = if (editorDraftRepository != null) "draft:type_cq:editor:$canonicalDraftOwnerId" else null,
            stimulusImages = if (hasStimulus) stimulusImages else null,
            solutionPartsByLabel = editableLabels.associateWith { label -> solutionPartsByLabel[label.sortOrder - 1] },
            conceptsByLabel = editableLabels.filter { label -> original?.subQuestions?.none { it.label == label } == true }
                .associateWith { label -> pendingConceptPartsByLabel[label.sortOrder - 1] },
            cardCategoryId = cardCategoryId,
            changeCardCategory = cardCategoryId != original?.cardCategoryId,
        )

    private fun snapshot() = EditSnapshot(
        stimulus, referenceText, texts, answers, ratings, stimulusRating, boards, stimulusBoards,
        questionTypeIds, marks, solutionTexts, categoryIdsByLabel, deletedQuestionIds, addedOptionalQuestionLabels, stimulusImages, solutionPartsByLabel, pendingConceptPartsByLabel, cardCategoryId,
    )

    private fun record(group: String) {
        history.record(snapshot(), group)
        ActivityLog.changed(group, 1, stimulus, referenceText, texts, answers, solutionTexts)
    }

    private fun applySnapshot(value: EditSnapshot) {
        stimulus = value.stimulus; referenceText = value.referenceText; texts = value.texts; answers = value.answers
        ratings = value.ratings; stimulusRating = value.stimulusRating; boards = value.boards; stimulusBoards = value.stimulusBoards
        questionTypeIds = value.questionTypeIds; marks = value.marks; solutionTexts = value.solutionTexts
        categoryIdsByLabel = value.categoryIdsByLabel; deletedQuestionIds = value.deletedQuestionIds
        addedOptionalQuestionLabels = value.addedOptionalQuestionLabels
        stimulusImages = value.stimulusImages; solutionPartsByLabel = value.solutionPartsByLabel
        pendingConceptPartsByLabel = value.conceptPartsByLabel
        cardCategoryId = value.cardCategoryId
        result = null
        queueDraft()
    }

    @JvmName("applyEditorMode")
    fun setEditorMode(mode: EditorMode) {
        if (saving || finished || editorMode == mode) return
        ActivityLog.action("EDIT", "editor mode switched", "$editorMode -> $mode")
        editorMode = mode
        queueDraft()
    }
    fun undo() { ActivityLog.action("EDIT", "UNDO pressed"); if (!saving && !finished) history.undo()?.let(::applySnapshot) }
    fun redo() { ActivityLog.action("EDIT", "REDO pressed"); if (!saving && !finished) history.redo()?.let(::applySnapshot) }

    /** True when the typed text differs from what is stored (after the same cleaning a save does). Blanking something counts as a change. */
    val changed: Boolean
        get() {
            val group = original ?: return false
            val relationalChange = stimulusImages != group.stimulusImages || pendingConceptPartsByLabel.any { it.isNotEmpty() } || editableLabels.any { label ->
                solutionPartsByLabel[label.sortOrder - 1].sortedBy { it.position } !=
                    group.subQuestions.firstOrNull { it.label == label }?.orderedSolutionParts.orEmpty().sortedBy { it.position }
            }
            return relationalChange || QuestionEditRules.check(group, buildInput()) != QuestionEditRules.Checked.NoChange
        }

    fun changeStimulus(value: String) {
        if (saving || finished) return
        stimulus = value
        record("stimulus")
        result = null
        queueDraft()
    }

    fun setText(label: CqLabel, value: String) {
        if (saving || finished) return
        texts = texts.toMutableList().also { it[label.sortOrder - 1] = value }
        record("question-${label.sortOrder}")
        result = null
        queueDraft()
    }

    fun setAnswer(label: CqLabel, value: String) {
        if (saving || finished) return
        answers = answers.toMutableList().also { it[label.sortOrder - 1] = value }
        record("answer-${label.sortOrder}")
        result = null
        queueDraft()
    }

    /** [value] 1-5, or null to clear. Only meaningful for a card with a stimulus (the screen shows the buttons only then). */
    fun changeStimulusRating(value: Int?) {
        if (saving || finished) return
        stimulusRating = value
        record("stimulus-rating")
        result = null
        queueDraft()
    }

    fun changeRating(label: CqLabel, value: Int?) {
        if (saving || finished) return
        ratings = ratings.toMutableList().also { it[label.sortOrder - 1] = value }
        record("rating-${label.sortOrder}")
        result = null
        queueDraft()
    }

    /** The full wanted tag list of the stimulus (an empty list clears). Only meaningful for a card with a stimulus. */
    fun changeStimulusBoards(value: List<BoardTag>) {
        if (saving || finished) return
        stimulusBoards = value
        record("stimulus-boards")
        result = null
        queueDraft()
    }

    fun changeBoards(label: CqLabel, value: List<BoardTag>) {
        if (saving || finished) return
        boards = boards.toMutableList().also { it[label.sortOrder - 1] = value }
        record("boards-${label.sortOrder}")
        result = null
        queueDraft()
    }

    fun changeCategory(label: CqLabel, categoryId: String, checked: Boolean) {
        if (saving || finished || label !in editableLabels || categoryId.isBlank()) return
        val index = label.sortOrder - 1
        val current = categoryIdsByLabel[index]
        val next = if (checked) (current + categoryId).distinct() else current.filterNot { it == categoryId }
        if (next == current) return
        categoryIdsByLabel = categoryIdsByLabel.toMutableList().also { it[index] = next }
        ActivityLog.action("EDIT", "category ${if (checked) "selected" else "unselected"}", "label=${label.letter} categoryId=$categoryId")
        record("categories-${label.sortOrder}")
        result = null
        queueDraft()
    }

    /** Changes only the new card-level category. Legacy per-question links remain unchanged. */
    fun changeGroupCategory(categoryId: String?) {
        if (saving || finished) return
        val selected = categoryId?.takeIf { it.isNotBlank() }
        if (cardCategoryId == selected) return
        cardCategoryId = selected
        ActivityLog.action("EDIT", "card category changed", "categoryId=${categoryId.orEmpty()}")
        record("card-category")
        result = null
        queueDraft()
    }

    fun conceptQuestionId(label: CqLabel): String? =
        original?.subQuestions?.firstOrNull { it.label == label && it.id !in deletedQuestionIds }?.id

    fun canEditConcept(label: CqLabel): Boolean =
        conceptQuestionId(label) != null || texts.getOrNull(label.sortOrder - 1).orEmpty().isNotBlank()

    fun conceptParts(label: CqLabel): List<ConceptContentPart> {
        val savedQuestion = original?.subQuestions?.firstOrNull { it.label == label && it.id !in deletedQuestionIds }
        return if (savedQuestion != null) savedQuestion.conceptParts
        else pendingConceptPartsByLabel.getOrNull(label.sortOrder - 1).orEmpty()
    }

    suspend fun persistConcept(label: CqLabel, parts: List<ConceptContentPart>): Boolean {
        if (saving || finished || label !in editableLabels) return false
        val normalized = parts.mapIndexed { index, part -> part.copy(position = index.toLong()) }
        val questionId = conceptQuestionId(label)
        if (questionId == null && texts.getOrNull(label.sortOrder - 1).orEmpty().isBlank() && normalized.isNotEmpty()) return false
        if (questionId != null) {
            val saved = repository.saveConcept(questionId, normalized)
            if (!saved) return false
            original = original?.let { current ->
                current.copy(subQuestions = current.subQuestions.map { question ->
                    if (question.id == questionId) question.copy(conceptParts = normalized) else question
                })
            }
            return true
        }
        val index = label.sortOrder - 1
        if (pendingConceptPartsByLabel.getOrNull(index) != normalized) {
            pendingConceptPartsByLabel = pendingConceptPartsByLabel.toMutableList().also { it[index] = normalized }
            record("concept-${label.sortOrder}")
            result = null
            queueDraft()
        }
        return true
    }

    suspend fun addCategory(name: String): Boolean =
        if (saving || finished || name.isBlank()) false else runCatching { addCategoryAction(name.trim()) }.getOrDefault(false)

    fun deleteQuestion(label: CqLabel) {
        ActivityLog.action("EDIT", "deleteQuestion pressed", "label=${label.letter} saving=$saving finished=$finished")
        if (saving || finished || !canDeleteQuestion(label)) return
        val rowId = original?.subQuestions?.firstOrNull { it.label == label && it.id !in deletedQuestionIds }?.id
        if (rowId != null) {
            deletedQuestionIds = deletedQuestionIds + rowId
        } else if (label in addedOptionalQuestionLabels) {
            // An optional K/Kh card added in this Full session has no database row yet; remove its draft slot.
            val i = label.sortOrder - 1
            addedOptionalQuestionLabels = addedOptionalQuestionLabels - label
            texts = texts.toMutableList().also { it[i] = "" }
            answers = answers.toMutableList().also { it[i] = "" }
            ratings = ratings.toMutableList().also { it[i] = null }
            boards = boards.toMutableList().also { it[i] = emptyList() }
            questionTypeIds = questionTypeIds.toMutableList().also { it[i] = label.typeId }
            marks = marks.toMutableList().also { it[i] = label.marks }
            solutionTexts = solutionTexts.toMutableList().also { it[i] = emptyList() }
            // Card category is shared by every current/future sub-question; retain the slot when an optional block is removed.
            solutionPartsByLabel = solutionPartsByLabel.toMutableList().also { it[i] = emptyList() }
            pendingConceptPartsByLabel = pendingConceptPartsByLabel.toMutableList().also { it[i] = emptyList() }
        } else return
        record("delete-${label.sortOrder}")
        result = null
        queueDraft()
    }

    fun restoreDeletedQuestion(label: CqLabel) {
        ActivityLog.action("EDIT", "restoreDeletedQuestion pressed", "label=${label.letter} saving=$saving finished=$finished")
        if (saving || finished) return
        val rowId = original?.subQuestions?.firstOrNull { it.label == label }?.id ?: return
        if (rowId !in deletedQuestionIds) return
        deletedQuestionIds = deletedQuestionIds - rowId
        record("restore-delete-${label.sortOrder}")
        result = null
        queueDraft()
    }

    fun changeStimulusImages(value: List<QuestionStimulusImage>) { if (saving || finished || !hasStimulus) return; stimulusImages = value.mapIndexed { index, row -> row.copy(position = index.toLong()) }; record("stimulus-images"); result = null; queueDraft() }
    fun changeSolutionImageParts(label: CqLabel, value: List<QuestionSolutionPart>) {
        ActivityLog.action("EDIT", "solution images/parts changed", "label=${label.letter} parts=" + value.joinToString { "${it.partType}#${it.position}:${it.partId}" })
        if (saving || finished) return
        val index = label.sortOrder - 1
        val sorted = value.sortedBy { it.position }
        val withText = if (sorted.any { it.partType != "IMAGE" }) sorted else sorted + QuestionSolutionPart(
            "type_cq:$groupKey:${label.letter}:text:auto",
            "TEXT",
            sorted.size.toLong(),
            textContent = "",
        )
        val ordered = withText.mapIndexed { position, part -> part.copy(position = position.toLong()) }
        solutionPartsByLabel = solutionPartsByLabel.toMutableList().also { it[index] = ordered }
        solutionTexts = solutionTexts.toMutableList().also { rows -> rows[index] = ordered.filter { it.partType != "IMAGE" }.mapNotNull { it.textContent } }
        record("solution-mixed-${label.sortOrder}"); result = null; queueDraft()
    }
    fun changeReferenceText(value: String) { if (saving || finished || !hasStimulus) return; referenceText = value; record("reference"); result = null; queueDraft() }
    fun changeQuestionType(label: CqLabel, value: String) { if (saving || finished) return; questionTypeIds = questionTypeIds.toMutableList().also { it[label.sortOrder - 1] = value }; record("type-${label.sortOrder}"); result = null; queueDraft() }
    fun changeMarks(label: CqLabel, value: Double) { if (saving || finished || !value.isFinite() || value <= 0.0) return; marks = marks.toMutableList().also { it[label.sortOrder - 1] = value }; record("marks-${label.sortOrder}"); result = null; queueDraft() }
    fun changeSolutionText(label: CqLabel, part: Int, value: String) { if (saving || finished) return; val i = label.sortOrder - 1; solutionTexts = solutionTexts.toMutableList().also { rows -> rows[i] = rows[i].toMutableList().also { if (part in it.indices) it[part] = value } }; syncMixedSolutionText(i); record("solution-${label.sortOrder}-$part"); result = null; queueDraft() }
    fun ensureSolutionText(label: CqLabel) { if (saving || finished) return; val i = label.sortOrder - 1; if (solutionTexts[i].isNotEmpty()) return; solutionTexts = solutionTexts.toMutableList().also { rows -> rows[i] = listOf("") }; syncMixedSolutionText(i); record("solution-init-${label.sortOrder}"); result = null; queueDraft() }
    fun addSolutionText(label: CqLabel) { if (saving || finished) return; val i = label.sortOrder - 1; solutionTexts = solutionTexts.toMutableList().also { rows -> rows[i] = if (rows[i].isEmpty()) listOf("", "") else rows[i] + "" }; syncMixedSolutionText(i); record("solution-add-${label.sortOrder}"); result = null; queueDraft() }
    fun removeSolutionText(label: CqLabel, part: Int) {
        if (saving || finished) return
        val i = label.sortOrder - 1
        val currentTexts = solutionTexts.getOrNull(i).orEmpty()
        if (part !in currentTexts.indices || currentTexts.size <= 1) return
        val existing = solutionPartsByLabel.getOrNull(i).orEmpty().ifEmpty {
            currentTexts.mapIndexed { textIndex, text ->
                QuestionSolutionPart(
                    "type_cq:$groupKey:${label.letter}:text:$textIndex",
                    "TEXT",
                    textIndex.toLong(),
                    textContent = text,
                )
            }
        }
        val ordered = existing.sortedBy { it.position }
        val target = ordered.filter { it.partType != "IMAGE" }.getOrNull(part) ?: return
        val remaining = ordered.filterNot { it.partId == target.partId }
            .mapIndexed { position, item -> item.copy(position = position.toLong()) }
        solutionPartsByLabel = solutionPartsByLabel.toMutableList().also { it[i] = remaining }
        solutionTexts = solutionTexts.toMutableList().also { rows ->
            rows[i] = remaining.filter { it.partType != "IMAGE" }.map { it.textContent.orEmpty() }
        }
        record("solution-remove-${label.sortOrder}")
        result = null
        queueDraft()
    }
    /** Reconcile legacy text controls with the ordered mixed parts while retaining IMAGE rows and their IDs. */
    private fun syncMixedSolutionText(index: Int) {
        val previous = solutionPartsByLabel.getOrNull(index).orEmpty().sortedBy { it.position }
        val textsForLabel = solutionTexts.getOrNull(index).orEmpty()
        val next = mutableListOf<QuestionSolutionPart>()
        var textIndex = 0
        previous.forEach { part ->
            if (part.partType == "IMAGE") next += part.copy(position = next.size.toLong())
            else if (textIndex < textsForLabel.size) {
                next += part.copy(textContent = textsForLabel[textIndex], imageId = null, position = next.size.toLong())
                textIndex++
            }
        }
        while (textIndex < textsForLabel.size) {
            next += QuestionSolutionPart("type_cq:$groupKey:${CqLabel.entries[index].letter}:text:$textIndex", "TEXT", next.size.toLong(), textContent = textsForLabel[textIndex])
            textIndex++
        }
        solutionPartsByLabel = solutionPartsByLabel.toMutableList().also { it[index] = next }
    }

    suspend fun addBoard(code: String, name: String): AddBoardResult = repository.addCustomBoard(code, name)

    fun save(onSaved: () -> Unit) {
        if (saving || finished || load != EditLoad.READY) return
        val orphanedConcept = editableLabels.firstOrNull { label ->
            conceptQuestionId(label) == null && pendingConceptPartsByLabel[label.sortOrder - 1].isNotEmpty() &&
                texts[label.sortOrder - 1].isBlank()
        }
        if (orphanedConcept != null) {
            result = UpdateResult.MissingQuestionText(orphanedConcept)
            return
        }
        saving = true
        result = null
        val input = buildInput()
        ActivityLog.action("EDIT", "SAVE (✓) pressed", "group=$groupKey")
        ActivityLog.event(
            "SAVE-DATA",
            "solution parts sent: " + input.solutionPartsByLabel.orEmpty().entries.joinToString("; ") { (l, ps) ->
                "${l.letter}=[" + ps.joinToString(", ") { "${it.partType}#${it.position}:${it.partId}" } + "]"
            },
        )
        val snapshot = currentDraft() ?: EditDraftSnapshot(
            text = draftOf(),
            categoryIdsByLabel = categoryIdsByLabel.map { it.toList() },
            deletedQuestionIds = deletedQuestionIds.toSet(),
            mode = editorMode,
        )
        viewModelScope.launch {
            // No draft write may run or follow the save: stop the writer first.
            pending.close()
            writer?.cancelAndJoin()
            // NonCancellable: if the person leaves while saving, the transaction still finishes (it is atomic either way).
            val outcome = withContext(NonCancellable) { repository.updateGroup(input) }
            result = outcome
            ActivityLog.event("SAVE-RESULT", "edit save outcome = $outcome")
            if (outcome is UpdateResult.Updated) {
                // The repository removed the draft in the same transaction.
                finished = true
                canonicalDraftTemplate = null
                draftStatus = DraftStatus.NONE
                saving = false
                if (isActive) onSaved()
            } else {
                // Nothing was stored: keep every typed character and write the draft again right now.
                startWriter()
                if (outcome != UpdateResult.NoChange && outcome != UpdateResult.GroupMissing) {
                    withContext(NonCancellable) {
                        repository.saveEditDraft(groupKey, snapshot.text)
                        val canonical = canonicalDraft(
                            snapshot,
                            canonicalDraftTemplate,
                            original?.subQuestions?.map { it.id }.orEmpty(),
                        )
                        canonicalDraftTemplate = canonical
                        try { editorDraftRepository?.save("type_cq", canonicalDraftOwnerId, EditorSessionDraftCodec.encode(canonical)) } catch (_: Exception) { }
                    }
                    draftStatus = DraftStatus.SAVED
                }
                saving = false
            }
        }
    }

    /** "Discard" (the person chose to throw the typed changes away): stops the writer, removes the draft, then calls [onDone]. */
    fun discard(onDone: () -> Unit) {
        ActivityLog.action("EDIT", "DISCARD (clear all / throw away changes) pressed", "group=$groupKey")
        if (saving || finished) return
        finished = true
        viewModelScope.launch {
            pending.close()
            writer?.cancelAndJoin()
            withContext(NonCancellable) {
                repository.discardEditDraft(groupKey)
                try { editorDraftRepository?.discard("type_cq", canonicalDraftOwnerId) } catch (_: Exception) { }
            }
            canonicalDraftTemplate = null
            draftStatus = DraftStatus.NONE
            onDone()
        }
    }

    override fun onCleared() {
        // Let the writer finish the newest queued text, then stop. It runs in the application scope, so it is not cancelled.
        pending.close()
        super.onCleared()
    }

    companion object {
        fun factory(create: () -> QuestionEditViewModel) = viewModelFactory { initializer { create() } }
    }
}
