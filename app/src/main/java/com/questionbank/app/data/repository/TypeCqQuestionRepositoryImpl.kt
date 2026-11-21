package com.questionbank.app.data.repository

import com.questionbank.app.data.local.dao.BoardRowDb
import com.questionbank.app.data.local.dao.NewQuestionRow
import com.questionbank.app.data.local.dao.NewTagRow
import com.questionbank.app.data.local.dao.QuestionBoardsDb
import com.questionbank.app.data.local.dao.QuestionCategoriesDb
import com.questionbank.app.data.local.dao.QuestionRatingDb
import com.questionbank.app.data.local.dao.QuestionRowDb
import com.questionbank.app.data.local.dao.QuestionTextUpdate
import com.questionbank.app.data.local.dao.QuestionMetadataUpdate as DbQuestionMetadataUpdate
import com.questionbank.app.data.local.dao.QuestionSolutionUpdate as DbQuestionSolutionUpdate
import com.questionbank.app.data.local.dao.NewSolutionPartRow
import com.questionbank.app.data.local.dao.NewStimulusImageRow
import com.questionbank.app.data.local.dao.QuestionSolutionPartsDb
import com.questionbank.app.data.local.dao.TypeCqQuestionDao
import com.questionbank.app.data.local.entity.BoardCatalogEntity
import com.questionbank.app.domain.question.AddBoardResult
import com.questionbank.app.domain.question.BoardFilter
import com.questionbank.app.domain.question.BoardItem
import com.questionbank.app.domain.question.BoardRules
import com.questionbank.app.domain.question.BoardTag
import com.questionbank.app.domain.question.CqLabel
import com.questionbank.app.domain.question.DraftText
import com.questionbank.app.domain.question.GroupEditInput
import com.questionbank.app.domain.question.QuestionEditRules
import com.questionbank.app.domain.question.QuestionGroupKey
import com.questionbank.app.domain.question.UpdateResult
import com.questionbank.app.domain.question.QuestionGroupInput
import com.questionbank.app.domain.question.RatingsInput
import com.questionbank.app.domain.question.BoardsInput
import com.questionbank.app.domain.question.QuestionSolutionPart
import com.questionbank.app.domain.question.QuestionStimulusImage
import com.questionbank.app.domain.question.PaperUsage
import com.questionbank.app.domain.question.QuestionCategoryUpdate
import com.questionbank.app.domain.question.QuestionRules
import com.questionbank.app.domain.question.RatingRules
import com.questionbank.app.domain.question.QuestionSearchRules
import com.questionbank.app.domain.question.SearchOutcome
import com.questionbank.app.domain.question.SaveResult
import com.questionbank.app.domain.question.SavedGroup
import com.questionbank.app.domain.question.SavedSubQuestion
import com.questionbank.app.domain.question.TypeCqQuestionRepository
import java.util.UUID
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.mapLatest
import org.json.JSONArray
import org.json.JSONObject

/**
 * [beforeWrite] runs before every question save; the app uses it to force `PRAGMA synchronous=FULL` on the writer
 * connection (every commit is flushed to storage). Ids and the clock can be replaced in tests.
 *
 * [ftsMatch] runs the FTS5 query of the search: (topicId, MATCH string) -> ids of the matching questions in that topic. It is a
 * function because Room cannot check a query on an FTS virtual table at compile time; the app wires `QuestionBankDatabase.typeCqFtsMatch`.
 * The default throws on purpose: a repository that was not wired for search must fail loudly, not return "nothing found".
 */
class TypeCqQuestionRepositoryImpl(
    private val dao: TypeCqQuestionDao,
    private val beforeWrite: suspend () -> Unit = {},
    private val clock: () -> Long = { System.currentTimeMillis() },
    private val newId: () -> String = { UUID.randomUUID().toString() },
    private val ftsMatch: suspend (topicId: String, match: String) -> List<String> =
        { _, _ -> throw IllegalStateException("ftsMatch is not wired") },
) : TypeCqQuestionRepository {

    override fun observeTopicName(topicId: String): Flow<String?> = dao.observeTopicName(topicId)

    override fun observeGroups(topicId: String): Flow<List<SavedGroup>> =
        dao.observeByTopic(topicId).mapLatest { rows ->
            if (rows.isEmpty()) emptyList() else enrichGroups(group(rows, tagsOfTopic(topicId)))
        }

    /** Attach ordered solution text/images and stimulus image placement for both normal and searched card results. */
    private suspend fun enrichGroups(groups: List<SavedGroup>): List<SavedGroup> {
        if (groups.isEmpty()) return emptyList()
        val questionIds = groups.flatMap { it.subQuestions }.map { it.id }.distinct()
        val solutionRows = dao.solutionPartsIn(questionIds).groupBy { it.questionId }
        val paperRows = dao.paperUsagesForQuestions(questionIds).groupBy { it.questionId }
        val imageRows = groups.mapNotNull { it.stimulusId }.distinct().associateWith { dao.stimulusImagesFor(it) }
        return groups.map { saved ->
            saved.copy(
                stimulusImages = imageRows[saved.stimulusId].orEmpty().map { QuestionStimulusImage(it.imageId, it.placement, it.position) },
                paperUsages = saved.subQuestions.flatMap { question ->
                    paperRows[question.id].orEmpty().map { PaperUsage(it.paperId, it.shortName, it.title) }
                }.distinctBy { it.paperId },
                subQuestions = saved.subQuestions.map { question ->
                    val parts = solutionRows[question.id].orEmpty().map { part ->
                        QuestionSolutionPart(part.partId, part.partType, part.position, part.textContent, part.imageId)
                    }
                    question.copy(
                        solutionParts = parts.filter { it.partType == "TEXT" }.mapNotNull { it.textContent },
                        orderedSolutionParts = parts,
                    )
                },
            )
        }
    }

    override suspend fun saveGroup(input: QuestionGroupInput): SaveResult {
        val snapshot = try {
            com.questionbank.app.domain.editor.EditorSaveCommand.typeCqCreate(input).input
        } catch (e: Exception) {
            return SaveResult.Failed(e.message ?: "Invalid Type_CQ save scope")
        }
        val ok = when (val checked = QuestionRules.check(snapshot)) {
            QuestionRules.Checked.Empty -> return SaveResult.Empty
            is QuestionRules.Checked.MissingText -> return SaveResult.MissingQuestionText(checked.label)
            is QuestionRules.Checked.TooLong -> return SaveResult.TooLong(checked.field)
            QuestionRules.Checked.BadRating -> return SaveResult.Failed("রেটিং ১ থেকে ৫-এর মধ্যে হতে হবে")
            QuestionRules.Checked.BadBoard -> return SaveResult.Failed(BAD_BOARD_MESSAGE)
            QuestionRules.Checked.BadCategories -> return SaveResult.Failed("ক্যাটাগরি আইডি সঠিক নয়")
            is QuestionRules.Checked.Ok -> checked
        }
        return try {
            val unknownBoard = unknownBoardCode(ok.stimulusBoards + ok.boards.values.flatten())
            if (unknownBoard != null) return SaveResult.Failed("অজানা বোর্ড: $unknownBoard")
            beforeWrite()
            val stimulusId = if (ok.stimulusText.isNotEmpty() || ok.referenceText.isNotEmpty() || snapshot.stimulusImages.isNotEmpty()) newId() else null
            val rows = ok.items.map {
                NewQuestionRow(
                    newId(), it.questionTypeId, it.label.letter, it.marks, it.text, it.shortAnswer, ok.ratings[it.label],
                    tagRows(ok.boards[it.label].orEmpty()), it.solutionParts, ok.categories[it.label].orEmpty(),
                    snapshot.solutionPartsByLabel[it.label].orEmpty().map { part ->
                        NewSolutionPartRow(part.partId, part.partType, part.position, part.textContent, part.imageId)
                    },
                )
            }
            val stimulusRating = if (stimulusId != null) ok.stimulusRating else null
            val stimulusTags = if (stimulusId != null) tagRows(ok.stimulusBoards) else emptyList()
            val written = dao.insertGroup(
                snapshot.topicId, stimulusId, ok.stimulusText, ok.referenceText, stimulusRating, stimulusTags,
                rows, clock(), draftKey(snapshot.topicId), snapshot.editorDraftKey,
                snapshot.stimulusImages.map { NewStimulusImageRow(it.imageId, it.placement, it.position) },
            )
            if (!written) return SaveResult.TopicMissing
            // The DAO performs all read-back checks before removing the draft, inside the same Room transaction.
            SaveResult.Saved(stimulusId, rows.map { it.id })
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            SaveResult.Failed(e.message ?: e.javaClass.simpleName)
        }
    }

    override suspend fun search(topicId: String, rawQuery: String, filter: BoardFilter?): SearchOutcome {
        val f = filter?.takeIf { !it.isEmpty }
        val tokens = QuestionSearchRules.tokens(rawQuery)
        // Text that was typed but has no usable word is NoTerms (also with a filter); no text and no filter is NoTerms too.
        if (tokens.isEmpty() && (rawQuery.isNotBlank() || f == null)) return SearchOutcome.NoTerms
        // null when every word is a hashtag word (or there is no word): then nothing is asked from FTS5 (v0.2.29).
        val match = QuestionSearchRules.ftsQuery(tokens)
        return try {
            val groups = enrichGroups(group(dao.selectByTopic(topicId), tagsOfTopic(topicId)))
            val found = if (tokens.isEmpty()) {
                // No text, only the board / year filter (v0.2.30c-3).
                QuestionSearchRules.filterByBoards(groups, null, emptySet(), f!!)
            } else {
                val ftsIds = if (match == null) null else ftsMatch(topicId, match).toSet()
                val matchedQuestions = groups.asSequence()
                    .flatMap { it.subQuestions.asSequence() }
                    .filter { (ftsIds == null || it.id in ftsIds) && QuestionSearchRules.hashWordsMatch(it.text, it.shortAnswer, tokens) }
                    .map { it.id }
                    .toSet()
                val matchedStimuli = dao.stimuliOfTopic(topicId)
                    .filter { QuestionSearchRules.containsAll(it.stimulusText, tokens) }
                    .map { it.stimulusId }
                    .toSet()
                if (f == null) {
                    QuestionSearchRules.filter(groups, matchedQuestions, matchedStimuli)
                } else {
                    QuestionSearchRules.filterByBoards(groups, matchedQuestions, matchedStimuli, f)
                }
            }
            SearchOutcome.Found(found)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            SearchOutcome.Failed(e.message ?: e.javaClass.simpleName)
        }
    }

    override suspend fun loadGroup(topicId: String, groupKey: String): SavedGroup? = try {
        loadOriginal(topicId, groupKey)
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        null
    }

    override suspend fun deleteGroup(topicId: String, groupKey: String): Boolean = try {
        val current = loadOriginal(topicId, groupKey) ?: return false
        val ids = current.subQuestions.map { it.id }
        if (ids.isEmpty()) return false
        beforeWrite()
        dao.deleteGroup(topicId, current.stimulusId, ids)
    } catch (e: CancellationException) {
        throw e
    } catch (_: Exception) {
        false
    }

    override suspend fun deleteGroups(topicId: String, groupKeys: List<String>): Boolean = try {
        if (groupKeys.isEmpty() || groupKeys.distinct().size != groupKeys.size) return false
        val targets = groupKeys.map { key -> loadOriginal(topicId, key) ?: return false }
        val ids = targets.flatMap { it.subQuestions.map(SavedSubQuestion::id) }
        if (ids.isEmpty() || ids.distinct().size != ids.size) return false
        beforeWrite()
        dao.deleteQuestionGroups(topicId, ids)
    } catch (e: CancellationException) {
        throw e
    } catch (_: Exception) {
        false
    }

    override suspend fun duplicateGroup(topicId: String, groupKey: String): SaveResult {
        val original = loadOriginal(topicId, groupKey) ?: return SaveResult.Failed("প্রশ্ন কার্ডটি আর পাওয়া যাচ্ছে না")
        val subQuestions = original.subQuestions.mapNotNull { question ->
            val label = question.label ?: return@mapNotNull null
            com.questionbank.app.domain.question.SubQuestionInput(
                label = label, text = question.text, shortAnswer = question.shortAnswer,
                questionTypeId = question.questionTypeId, marks = question.marks, solutionParts = question.solutionParts,
            )
        }
        if (subQuestions.isEmpty()) return SaveResult.Failed("নকল করার মতো প্রশ্ন পাওয়া যায়নি")
        val input = QuestionGroupInput(
            topicId = topicId, stimulusText = original.stimulusText, subQuestions = subQuestions,
            ratings = RatingsInput(original.stimulusRating, original.subQuestions.mapNotNull { q -> q.label?.let { it to q.rating } }.toMap()),
            boards = BoardsInput(original.stimulusBoards, original.subQuestions.mapNotNull { q -> q.label?.let { it to q.boards } }.toMap()),
            referenceText = original.referenceText,
            categoriesByLabel = original.subQuestions.mapNotNull { q -> q.label?.let { it to q.categoryIds } }.toMap(),
            stimulusImages = original.stimulusImages,
            solutionPartsByLabel = original.subQuestions.mapNotNull { q -> q.label?.let { it to q.orderedSolutionParts.map { part -> part.copy(partId = newId()) } } }.toMap(),
        )
        return saveGroup(input)
    }

    private suspend fun loadOriginal(topicId: String, groupKey: String): SavedGroup? {
        val rows = when (val key = QuestionGroupKey.parse(groupKey)) {
            null -> return null
            is QuestionGroupKey.Parsed.Stimulus -> dao.selectByStimulus(topicId, key.id)
            is QuestionGroupKey.Parsed.Single -> dao.selectBySingle(topicId, key.id)
        }
        val stimulusIds = rows.mapNotNull { it.stimulusId }.distinct()
        val questionIds = rows.map { it.questionId }.distinct()
        val tags = Tags(
            stimulus = if (stimulusIds.isEmpty()) emptyMap() else toTags(dao.stimulusBoardsIn(stimulusIds)),
            question = if (questionIds.isEmpty()) emptyMap() else toTags(dao.questionBoardsIn(questionIds)),
            categories = if (questionIds.isEmpty()) emptyMap() else dao.categoryLinksIn(questionIds).groupBy({ it.questionId }, { it.categoryId }),
        )
        val solutions = if (questionIds.isEmpty()) emptyMap() else dao.solutionPartsIn(questionIds)
            .filter { it.partType == "TEXT" && it.textContent != null }
            .groupBy({ it.questionId }, { it.textContent.orEmpty() })
        val categories = if (questionIds.isEmpty()) emptyMap() else dao.categoryLinksIn(questionIds)
            .groupBy({ it.questionId }, { it.categoryId })
        val base = group(rows, tags, solutions, categories).firstOrNull() ?: return null
        val stimulusImageRows = stimulusIds.firstOrNull()?.let { dao.stimulusImagesFor(it) }.orEmpty()
            .map { com.questionbank.app.domain.question.QuestionStimulusImage(it.imageId, it.placement, it.position) }
        val orderedParts = if (questionIds.isEmpty()) emptyMap() else dao.solutionPartsIn(questionIds).groupBy({ it.questionId }, { part ->
            com.questionbank.app.domain.question.QuestionSolutionPart(part.partId, part.partType, part.position, part.textContent, part.imageId)
        })
        return base.copy(
            stimulusImages = stimulusImageRows,
            subQuestions = base.subQuestions.map { sub -> sub.copy(orderedSolutionParts = orderedParts[sub.id].orEmpty()) },
        )
    }

    override suspend fun updateGroup(input: GroupEditInput): UpdateResult {
        return try {
            val snapshot = com.questionbank.app.domain.editor.EditorSaveCommand.typeCqEdit(input).input
            val original = loadOriginal(snapshot.topicId, snapshot.groupKey) ?: return UpdateResult.GroupMissing
            val ok = when (val checked = QuestionEditRules.check(original, snapshot)) {
                QuestionEditRules.Checked.NoChange -> return UpdateResult.NoChange
                QuestionEditRules.Checked.BlankedStimulus -> return UpdateResult.BlankedStimulus
                is QuestionEditRules.Checked.BlankedQuestion -> return UpdateResult.BlankedQuestion(checked.label)
                is QuestionEditRules.Checked.MissingText -> return UpdateResult.MissingQuestionText(checked.label)
                is QuestionEditRules.Checked.TooLong -> return UpdateResult.TooLong(checked.field)
                QuestionEditRules.Checked.BadRating -> return UpdateResult.Failed("রেটিং ১ থেকে ৫-এর মধ্যে হতে হবে")
                QuestionEditRules.Checked.BadBoard -> return UpdateResult.Failed(BAD_BOARD_MESSAGE)
                QuestionEditRules.Checked.BadCategories -> return UpdateResult.Failed("ক্যাটাগরি আইডি সঠিক নয়")
                QuestionEditRules.Checked.BadDeletion -> return UpdateResult.Failed("যে প্রশ্নটি মুছতে বলা হয়েছে সেটি এই গ্রুপে নেই অথবা গ্রুপ খালি হয়ে যাবে")
                is QuestionEditRules.Checked.Ok -> checked
            }
            val wantedTags = (ok.stimulusBoards?.tags.orEmpty()) + ok.boardUpdates.flatMap { it.change.tags } + ok.addBoards.values.flatten()
            val unknownBoard = unknownBoardCode(wantedTags)
            if (unknownBoard != null) return UpdateResult.Failed("অজানা বোর্ড: $unknownBoard")
            beforeWrite()
            val rows = ok.adds.map {
                NewQuestionRow(
                    newId(), it.questionTypeId, it.label.letter, it.marks, it.text, it.shortAnswer, ok.addRatings[it.label],
                    tagRows(ok.addBoards[it.label].orEmpty()), it.solutionParts, ok.addCategories[it.label].orEmpty(),
                    snapshot.solutionPartsByLabel?.get(it.label).orEmpty().map { part ->
                        NewSolutionPartRow(part.partId, part.partType, part.position, part.textContent, part.imageId)
                    },
                )
            }
            val categoryUpdates = ok.categoryUpdates.map { QuestionCategoriesDb(it.questionId, it.categoryIds) }
            val written = dao.updateGroup(
                topicId = snapshot.topicId,
                stimulusId = original.stimulusId,
                newStimulusText = ok.stimulusText,
                newReferenceText = ok.referenceText,
                updates = ok.updates.map { QuestionTextUpdate(it.questionId, it.text, it.answer) },
                metadataUpdates = ok.metadataUpdates.map { DbQuestionMetadataUpdate(it.questionId, it.questionTypeId, it.marks) },
                solutionUpdates = ok.solutionUpdates.map { DbQuestionSolutionUpdate(it.questionId, it.parts) },
                adds = rows,
                now = clock(),
                draftKey = editDraftKey(snapshot.groupKey),
                changeStimulusRating = ok.stimulusRating != null,
                newStimulusRating = ok.stimulusRating?.value,
                ratingUpdates = ok.ratingUpdates.map { QuestionRatingDb(it.questionId, it.change.value) },
                changeStimulusBoards = ok.stimulusBoards != null,
                newStimulusBoards = ok.stimulusBoards?.let { tagRows(it.tags) } ?: emptyList(),
                boardUpdates = ok.boardUpdates.map { QuestionBoardsDb(it.questionId, tagRows(it.change.tags)) },
                deletes = ok.deletes,
                categoryUpdates = categoryUpdates,
                editorDraftKey = snapshot.editorDraftKey,
                solutionPartUpdates = snapshot.solutionPartsByLabel.orEmpty().mapNotNull { (label, parts) ->
                    val questionId = original.subQuestions.firstOrNull { it.label == label }?.id
                    questionId?.let { id -> QuestionSolutionPartsDb(id, parts.map { part ->
                        NewSolutionPartRow(part.partId, part.partType, part.position, part.textContent, part.imageId)
                    }) }
                },
                stimulusImageReplacement = snapshot.stimulusImages?.map { NewStimulusImageRow(it.imageId, it.placement, it.position) },
            )
            if (!written) return UpdateResult.GroupMissing
            // The DAO verifies the updated question/metadata/solution/stimulus/board rows before deleting the draft,
            // all inside the same Room transaction. No post-commit check can now report failure after a committed save.
            UpdateResult.Updated
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            UpdateResult.Failed(e.message ?: e.javaClass.simpleName)
        }
    }

    override suspend fun loadEditDraft(groupKey: String): DraftText? = try {
        dao.getMeta(editDraftKey(groupKey))?.let { decode(it) }
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        null
    }

    override suspend fun saveEditDraft(groupKey: String, draft: DraftText) {
        try {
            dao.putMeta(editDraftKey(groupKey), encode(draft), clock())
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // A draft must never break typing.
        }
    }

    override suspend fun discardEditDraft(groupKey: String) {
        try {
            dao.deleteMeta(editDraftKey(groupKey))
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Nothing to do: a leftover draft only offers the typed text again.
        }
    }

    override fun observeBoards(): Flow<List<BoardItem>> = dao.observeBoards().map { list -> list.map { toItem(it) } }

    override suspend fun addCustomBoard(rawCode: String, rawName: String): AddBoardResult {
        val code = BoardRules.cleanCode(rawCode) ?: return AddBoardResult.BadCode
        val name = BoardRules.cleanName(rawName) ?: return AddBoardResult.BadName
        return try {
            val existing = dao.boardsOnce()
            if (existing.any { it.code == code }) return AddBoardResult.CodeExists
            if (existing.any { it.displayName.trim().lowercase() == name.lowercase() }) return AddBoardResult.NameExists
            beforeWrite()
            val now = clock()
            val row = BoardCatalogEntity(
                boardId = "brd_" + newId(),
                code = code,
                displayName = name,
                boardKind = "CUSTOM",
                isArchived = 0L,
                sortOrder = dao.maxBoardSortOrder() + 1,
                createdAt = now,
                updatedAt = now,
            )
            dao.insertBoard(row)
            // Read-back: "added" is reported only when the catalog really holds the board.
            val stored = dao.boardsOnce().firstOrNull { it.code == code }
            if (stored != null && stored.displayName == name && stored.boardKind == "CUSTOM") {
                AddBoardResult.Added(toItem(stored))
            } else {
                AddBoardResult.Failed("read-back mismatch")
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            AddBoardResult.Failed(e.message ?: e.javaClass.simpleName)
        }
    }

    override suspend fun loadDraft(topicId: String): DraftText? = try {
        dao.getMeta(draftKey(topicId))?.let { decode(it) }
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        null
    }

    override suspend fun saveDraft(topicId: String, draft: DraftText) {
        try {
            if (draft.isBlank) dao.deleteMeta(draftKey(topicId)) else dao.putMeta(draftKey(topicId), encode(draft), clock())
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // A draft must never break typing.
        }
    }

    private class Tags(
        val stimulus: Map<String, List<BoardTag>>,
        val question: Map<String, List<BoardTag>>,
        val categories: Map<String, List<String>> = emptyMap(),
    )

    private fun toTags(rows: List<BoardRowDb>): Map<String, List<BoardTag>> =
        rows.groupBy({ it.ownerId }, { BoardTag(it.boardCode, it.year) })

    private suspend fun tagsOfTopic(topicId: String): Tags {
        val categories = dao.categoryLinksOfTopic(topicId).groupBy({ it.questionId }, { it.categoryId })
        return Tags(toTags(dao.stimulusBoardsOfTopic(topicId)), toTags(dao.questionBoardsOfTopic(topicId)), categories)
    }

    private fun tagRows(tags: List<BoardTag>): List<NewTagRow> = tags.map { NewTagRow(newId(), it.boardCode, it.year) }

    /** The first board code that is not in the catalog, or null. Checked before the write so the person gets a clear message, not a foreign-key error. */
    private suspend fun unknownBoardCode(tags: List<BoardTag>): String? {
        if (tags.isEmpty()) return null
        val known = dao.boardCodes().toSet()
        return tags.firstOrNull { it.boardCode !in known }?.boardCode
    }

    private fun toItem(e: BoardCatalogEntity) = BoardItem(e.code, e.displayName, e.boardKind == "CUSTOM", e.isArchived == 1L)

    private fun group(
        rows: List<QuestionRowDb>,
        tags: Tags,
        solutions: Map<String, List<String>> = emptyMap(),
        categories: Map<String, List<String>> = tags.categories,
    ): List<SavedGroup> {
        val buckets = LinkedHashMap<String, MutableList<QuestionRowDb>>()
        for (row in rows) {
            val key = row.stimulusId ?: ("single:" + row.questionId)
            buckets.getOrPut(key) { ArrayList() }.add(row)
        }
        return buckets.values.map { list ->
            val first = list.first()
            SavedGroup(
                stimulusId = first.stimulusId,
                stimulusText = first.stimulusText.orEmpty(),
                stimulusRating = first.stimulusRating,
                subQuestions = list
                    .sortedBy { CqLabel.fromLetter(it.label)?.sortOrder ?: 9 }
                    .map {
                        SavedSubQuestion(
                            it.questionId, CqLabel.fromLetter(it.label), it.marks, it.questionText, it.shortAnswer, it.rating,
                            tags.question[it.questionId].orEmpty(), it.questionTypeId, solutions[it.questionId].orEmpty(), categories[it.questionId].orEmpty(),
                        )
                    },
                stimulusBoards = first.stimulusId?.let { tags.stimulus[it] }.orEmpty(),
                referenceText = first.referenceText.orEmpty(),
                unfilteredFallbackRating = list.mapNotNull { it.rating }.takeIf { it.isNotEmpty() }
                    ?.let { kotlin.math.round(it.average()).toInt() },
            )
        }
    }

    companion object {
        private const val BAD_BOARD_MESSAGE = "বোর্ড বা সাল ঠিক নেই (সাল ১৯০০ থেকে ২২০০-এর মধ্যে হতে হবে)"

        fun draftKey(topicId: String) = "draft:type_cq:$topicId"

        /** v0.2.29: one edit draft per card. [groupKey] is "s-<stimulusId>" or "q-<questionId>" (see QuestionGroupKey). */
        fun editDraftKey(groupKey: String) = "draft:type_cq:edit:$groupKey"

        internal fun encode(d: DraftText): String = JSONObject()
            .put("v", 2)
            .put("stimulus", d.stimulus)
            .put("referenceText", d.referenceText)
            .put("questionTypeIds", JSONArray(d.questionTypeIds))
            .put("marks", JSONArray(d.marks))
            .put("solutionTexts", JSONArray(d.solutionTexts.map { JSONArray(it) }))
            .put("texts", JSONArray(d.texts))
            .put("answers", JSONArray(d.answers))
            .put("stimulusRating", d.stimulusRating ?: 0) // 0 = no rating (a rating is 1-5)
            .put("ratings", JSONArray(d.ratings.map { it ?: 0 }))
            .put("stimulusBoards", tagsToJson(d.stimulusBoards))
            .put("boards", JSONArray(d.boards.map { tagsToJson(it) }))
            .toString()

        /** One tag list as `[{"b":"DHA","y":2019}, ...]` (v0.2.30c-2). */
        private fun tagsToJson(tags: List<BoardTag>): JSONArray =
            JSONArray(tags.map { JSONObject().put("b", it.boardCode).put("y", it.year) })

        /** Bad entries are skipped; a missing array (a draft from before v0.2.30c-2) is an empty list. */
        private fun tagsFromJson(a: JSONArray?): List<BoardTag> {
            if (a == null) return emptyList()
            val out = ArrayList<BoardTag>()
            for (i in 0 until a.length()) {
                val o = a.optJSONObject(i) ?: continue
                val code = o.optString("b", "")
                val year = o.optInt("y", 0)
                if (code.isNotBlank() && BoardRules.isValidYear(year)) out.add(BoardTag(code, year))
            }
            return BoardRules.normalizeTags(out).take(BoardRules.MAX_TAGS_PER_BLOCK)
        }

        internal fun decode(json: String): DraftText? = try {
            val o = JSONObject(json)
            val t = o.getJSONArray("texts")
            val a = o.getJSONArray("answers")
            // Drafts written before v0.2.30 have no rating fields: they decode as "no rating".
            val r = o.optJSONArray("ratings")
            DraftText(
                stimulus = o.optString("stimulus", ""),
                texts = List(4) { t.optString(it, "") },
                answers = List(4) { a.optString(it, "") },
                stimulusRating = o.optInt("stimulusRating", 0).takeIf { it in RatingRules.MIN..RatingRules.MAX },
                ratings = List(4) { i -> r?.optInt(i, 0)?.takeIf { it in RatingRules.MIN..RatingRules.MAX } },
                stimulusBoards = tagsFromJson(o.optJSONArray("stimulusBoards")),
                boards = o.optJSONArray("boards").let { b -> List(4) { i -> tagsFromJson(b?.optJSONArray(i)) } },
                referenceText = o.optString("referenceText", ""),
                questionTypeIds = o.optJSONArray("questionTypeIds").let { a -> List(4) { i -> a?.optString(i, CqLabel.entries[i].typeId)?.takeIf { it.isNotBlank() } ?: CqLabel.entries[i].typeId } },
                marks = o.optJSONArray("marks").let { a -> List(4) { i -> a?.optDouble(i, CqLabel.entries[i].marks) ?: CqLabel.entries[i].marks } },
                solutionTexts = o.optJSONArray("solutionTexts").let { a -> List(4) { i -> a?.optJSONArray(i).let { row -> List(row?.length() ?: 0) { j -> row?.optString(j, "").orEmpty() } } } },
            )
        } catch (e: Exception) {
            null
        }
    }
}
