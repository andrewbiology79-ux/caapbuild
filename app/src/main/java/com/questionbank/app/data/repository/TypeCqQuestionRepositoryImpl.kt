package com.questionbank.app.data.repository

import com.questionbank.app.data.local.dao.BoardRowDb
import com.questionbank.app.data.local.dao.NewQuestionRow
import com.questionbank.app.data.local.dao.NewTagRow
import com.questionbank.app.data.local.dao.QuestionBoardsDb
import com.questionbank.app.data.local.dao.QuestionRatingDb
import com.questionbank.app.data.local.dao.QuestionRowDb
import com.questionbank.app.data.local.dao.QuestionTextUpdate
import com.questionbank.app.data.local.dao.TypeCqQuestionDao
import com.questionbank.app.data.local.entity.BoardCatalogEntity
import com.questionbank.app.domain.question.AddBoardResult
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
        dao.observeByTopic(topicId).map { rows -> group(rows, tagsOfTopic(topicId)) }

    override suspend fun saveGroup(input: QuestionGroupInput): SaveResult {
        val ok = when (val checked = QuestionRules.check(input)) {
            QuestionRules.Checked.Empty -> return SaveResult.Empty
            is QuestionRules.Checked.MissingText -> return SaveResult.MissingQuestionText(checked.label)
            is QuestionRules.Checked.TooLong -> return SaveResult.TooLong(checked.field)
            QuestionRules.Checked.BadRating -> return SaveResult.Failed("রেটিং ১ থেকে ৫-এর মধ্যে হতে হবে")
            QuestionRules.Checked.BadBoard -> return SaveResult.Failed(BAD_BOARD_MESSAGE)
            is QuestionRules.Checked.Ok -> checked
        }
        return try {
            val unknownBoard = unknownBoardCode(ok.stimulusBoards + ok.boards.values.flatten())
            if (unknownBoard != null) return SaveResult.Failed("অজানা বোর্ড: $unknownBoard")
            beforeWrite()
            val stimulusId = if (ok.stimulusText.isNotEmpty()) newId() else null
            val rows = ok.items.map {
                NewQuestionRow(
                    newId(), it.label.typeId, it.label.letter, it.label.marks, it.text, it.shortAnswer, ok.ratings[it.label],
                    tagRows(ok.boards[it.label].orEmpty()),
                )
            }
            val stimulusRating = if (stimulusId != null) ok.stimulusRating else null
            val stimulusTags = if (stimulusId != null) tagRows(ok.stimulusBoards) else emptyList()
            val written = dao.insertGroup(input.topicId, stimulusId, ok.stimulusText, stimulusRating, stimulusTags, rows, clock(), draftKey(input.topicId))
            if (!written) return SaveResult.TopicMissing

            // Read-back: "saved" is reported only when the rows are really in the database with the same text.
            val stored = dao.readBack(rows.map { it.id }).associateBy { it.questionId }
            val questionsOk = rows.all { r ->
                val s = stored[r.id]
                s != null && s.questionText == r.text && s.shortAnswer == r.answer && s.rating == r.rating
            }
            val stimulusOk = stimulusId == null ||
                (dao.readStimulusText(stimulusId) == ok.stimulusText && dao.readStimulusRating(stimulusId) == stimulusRating)
            val boardsOk = boardsMatch(
                stimulusId?.let { it to ok.stimulusBoards },
                ok.items.zip(rows).associate { (item, row) -> row.id to ok.boards[item.label].orEmpty() },
            )
            if (questionsOk && stimulusOk && boardsOk) {
                SaveResult.Saved(stimulusId, rows.map { it.id })
            } else {
                SaveResult.Failed("read-back mismatch")
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            SaveResult.Failed(e.message ?: e.javaClass.simpleName)
        }
    }

    override suspend fun search(topicId: String, rawQuery: String): SearchOutcome {
        val tokens = QuestionSearchRules.tokens(rawQuery)
        if (tokens.isEmpty()) return SearchOutcome.NoTerms
        // null when every word is a hashtag word: then nothing is asked from FTS5 and the hashtag rule alone decides (v0.2.29).
        val match = QuestionSearchRules.ftsQuery(tokens)
        return try {
            val groups = group(dao.selectByTopic(topicId), tagsOfTopic(topicId))
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
            SearchOutcome.Found(QuestionSearchRules.filter(groups, matchedQuestions, matchedStimuli))
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
        )
        return group(rows, tags).firstOrNull()
    }

    override suspend fun updateGroup(input: GroupEditInput): UpdateResult {
        return try {
            val original = loadOriginal(input.topicId, input.groupKey) ?: return UpdateResult.GroupMissing
            val ok = when (val checked = QuestionEditRules.check(original, input)) {
                QuestionEditRules.Checked.NoChange -> return UpdateResult.NoChange
                QuestionEditRules.Checked.BlankedStimulus -> return UpdateResult.BlankedStimulus
                is QuestionEditRules.Checked.BlankedQuestion -> return UpdateResult.BlankedQuestion(checked.label)
                is QuestionEditRules.Checked.MissingText -> return UpdateResult.MissingQuestionText(checked.label)
                is QuestionEditRules.Checked.TooLong -> return UpdateResult.TooLong(checked.field)
                QuestionEditRules.Checked.BadRating -> return UpdateResult.Failed("রেটিং ১ থেকে ৫-এর মধ্যে হতে হবে")
                is QuestionEditRules.Checked.Ok -> checked
            }
            val wantedTags = (ok.stimulusBoards?.tags.orEmpty()) + ok.boardUpdates.flatMap { it.change.tags } + ok.addBoards.values.flatten()
            val unknownBoard = unknownBoardCode(wantedTags)
            if (unknownBoard != null) return UpdateResult.Failed("অজানা বোর্ড: $unknownBoard")
            beforeWrite()
            val rows = ok.adds.map {
                NewQuestionRow(
                    newId(), it.label.typeId, it.label.letter, it.label.marks, it.text, it.shortAnswer, ok.addRatings[it.label],
                    tagRows(ok.addBoards[it.label].orEmpty()),
                )
            }
            val written = dao.updateGroup(
                topicId = input.topicId,
                stimulusId = original.stimulusId,
                newStimulusText = ok.stimulusText,
                updates = ok.updates.map { QuestionTextUpdate(it.questionId, it.text, it.answer) },
                adds = rows,
                now = clock(),
                draftKey = editDraftKey(input.groupKey),
                changeStimulusRating = ok.stimulusRating != null,
                newStimulusRating = ok.stimulusRating?.value,
                ratingUpdates = ok.ratingUpdates.map { QuestionRatingDb(it.questionId, it.change.value) },
                changeStimulusBoards = ok.stimulusBoards != null,
                newStimulusBoards = ok.stimulusBoards?.let { tagRows(it.tags) } ?: emptyList(),
                boardUpdates = ok.boardUpdates.map { QuestionBoardsDb(it.questionId, tagRows(it.change.tags)) },
            )
            if (!written) return UpdateResult.GroupMissing

            // Read-back: "updated" is reported only when the rows really hold the new text.
            val expected = ok.updates.associate { it.questionId to (it.text to it.answer) } +
                rows.associate { it.id to (it.text to it.answer) }
            val stored = dao.readBack(expected.keys.toList()).associateBy { it.questionId }
            val wantRating = ok.ratingUpdates.associate { it.questionId to it.change.value } +
                rows.associate { it.id to it.rating }
            val ratingIds = wantRating.keys - expected.keys
            val storedRatingOnly = if (ratingIds.isEmpty()) emptyMap() else dao.readBack(ratingIds.toList()).associateBy { it.questionId }
            val questionsOk = expected.all { (id, want) ->
                val s = stored[id]
                s != null && s.questionText == want.first && s.shortAnswer == want.second &&
                    (!wantRating.containsKey(id) || s.rating == wantRating[id])
            } && ratingIds.all { id -> storedRatingOnly[id] != null && storedRatingOnly[id]!!.rating == wantRating[id] }
            val stimulusId = original.stimulusId
            val stimulusTextOk = ok.stimulusText == null || (stimulusId != null && dao.readStimulusText(stimulusId) == ok.stimulusText)
            val stimulusRatingOk = ok.stimulusRating == null || (stimulusId != null && dao.readStimulusRating(stimulusId) == ok.stimulusRating.value)
            val stimulusOk = stimulusTextOk && stimulusRatingOk
            val wantedQuestionTags = ok.boardUpdates.associate { it.questionId to it.change.tags } +
                ok.adds.zip(rows).associate { (add, row) -> row.id to ok.addBoards[add.label].orEmpty() }
            val boardsOk = boardsMatch(
                if (stimulusId != null && ok.stimulusBoards != null) stimulusId to ok.stimulusBoards.tags else null,
                wantedQuestionTags,
            )
            if (questionsOk && stimulusOk && boardsOk) UpdateResult.Updated else UpdateResult.Failed("read-back mismatch")
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

    private class Tags(val stimulus: Map<String, List<BoardTag>>, val question: Map<String, List<BoardTag>>)

    private fun toTags(rows: List<BoardRowDb>): Map<String, List<BoardTag>> =
        rows.groupBy({ it.ownerId }, { BoardTag(it.boardCode, it.year) })

    private suspend fun tagsOfTopic(topicId: String): Tags =
        Tags(toTags(dao.stimulusBoardsOfTopic(topicId)), toTags(dao.questionBoardsOfTopic(topicId)))

    private fun tagRows(tags: List<BoardTag>): List<NewTagRow> = tags.map { NewTagRow(newId(), it.boardCode, it.year) }

    /** The first board code that is not in the catalog, or null. Checked before the write so the person gets a clear message, not a foreign-key error. */
    private suspend fun unknownBoardCode(tags: List<BoardTag>): String? {
        if (tags.isEmpty()) return null
        val known = dao.boardCodes().toSet()
        return tags.firstOrNull { it.boardCode !in known }?.boardCode
    }

    /** Read-back of board tags: every wanted list must be stored exactly (same tags, same order). */
    private suspend fun boardsMatch(wantStimulus: Pair<String, List<BoardTag>>?, wantQuestions: Map<String, List<BoardTag>>): Boolean {
        if (wantStimulus != null) {
            val got = toTags(dao.stimulusBoardsIn(listOf(wantStimulus.first)))[wantStimulus.first].orEmpty()
            if (got != wantStimulus.second) return false
        }
        if (wantQuestions.isNotEmpty()) {
            val got = toTags(dao.questionBoardsIn(wantQuestions.keys.toList()))
            if (!wantQuestions.all { (id, want) -> got[id].orEmpty() == want }) return false
        }
        return true
    }

    private fun toItem(e: BoardCatalogEntity) = BoardItem(e.code, e.displayName, e.boardKind == "CUSTOM", e.isArchived == 1L)

    private fun group(rows: List<QuestionRowDb>, tags: Tags): List<SavedGroup> {
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
                            tags.question[it.questionId].orEmpty(),
                        )
                    },
                stimulusBoards = first.stimulusId?.let { tags.stimulus[it] }.orEmpty(),
            )
        }
    }

    companion object {
        private const val BAD_BOARD_MESSAGE = "বোর্ড বা সাল ঠিক নেই (সাল ১৯০০ থেকে ২২০০-এর মধ্যে হতে হবে)"

        fun draftKey(topicId: String) = "draft:type_cq:$topicId"

        /** v0.2.29: one edit draft per card. [groupKey] is "s-<stimulusId>" or "q-<questionId>" (see QuestionGroupKey). */
        fun editDraftKey(groupKey: String) = "draft:type_cq:edit:$groupKey"

        internal fun encode(d: DraftText): String = JSONObject()
            .put("v", 1)
            .put("stimulus", d.stimulus)
            .put("texts", JSONArray(d.texts))
            .put("answers", JSONArray(d.answers))
            .put("stimulusRating", d.stimulusRating ?: 0) // 0 = no rating (a rating is 1-5)
            .put("ratings", JSONArray(d.ratings.map { it ?: 0 }))
            .toString()

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
            )
        } catch (e: Exception) {
            null
        }
    }
}
