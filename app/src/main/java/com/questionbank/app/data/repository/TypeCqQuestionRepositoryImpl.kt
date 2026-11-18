package com.questionbank.app.data.repository

import com.questionbank.app.data.local.dao.NewQuestionRow
import com.questionbank.app.data.local.dao.QuestionRowDb
import com.questionbank.app.data.local.dao.TypeCqQuestionDao
import com.questionbank.app.domain.question.CqLabel
import com.questionbank.app.domain.question.DraftText
import com.questionbank.app.domain.question.QuestionGroupInput
import com.questionbank.app.domain.question.QuestionRules
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
        dao.observeByTopic(topicId).map { rows -> group(rows) }

    override suspend fun saveGroup(input: QuestionGroupInput): SaveResult {
        val ok = when (val checked = QuestionRules.check(input)) {
            QuestionRules.Checked.Empty -> return SaveResult.Empty
            is QuestionRules.Checked.MissingText -> return SaveResult.MissingQuestionText(checked.label)
            is QuestionRules.Checked.TooLong -> return SaveResult.TooLong(checked.field)
            is QuestionRules.Checked.Ok -> checked
        }
        return try {
            beforeWrite()
            val stimulusId = if (ok.stimulusText.isNotEmpty()) newId() else null
            val rows = ok.items.map {
                NewQuestionRow(newId(), it.label.typeId, it.label.letter, it.label.marks, it.text, it.shortAnswer)
            }
            val written = dao.insertGroup(input.topicId, stimulusId, ok.stimulusText, rows, clock(), draftKey(input.topicId))
            if (!written) return SaveResult.TopicMissing

            // Read-back: "saved" is reported only when the rows are really in the database with the same text.
            val stored = dao.readBack(rows.map { it.id }).associateBy { it.questionId }
            val questionsOk = rows.all { r ->
                val s = stored[r.id]
                s != null && s.questionText == r.text && s.shortAnswer == r.answer
            }
            val stimulusOk = stimulusId == null || dao.readStimulusText(stimulusId) == ok.stimulusText
            if (questionsOk && stimulusOk) {
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
        val match = QuestionSearchRules.ftsQuery(tokens) ?: return SearchOutcome.NoTerms
        return try {
            val groups = group(dao.selectByTopic(topicId))
            val matchedQuestions = ftsMatch(topicId, match).toSet()
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

    private fun group(rows: List<QuestionRowDb>): List<SavedGroup> {
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
                    .map { SavedSubQuestion(it.questionId, CqLabel.fromLetter(it.label), it.marks, it.questionText, it.shortAnswer, it.rating) },
            )
        }
    }

    companion object {
        fun draftKey(topicId: String) = "draft:type_cq:$topicId"

        internal fun encode(d: DraftText): String = JSONObject()
            .put("v", 1)
            .put("stimulus", d.stimulus)
            .put("texts", JSONArray(d.texts))
            .put("answers", JSONArray(d.answers))
            .toString()

        internal fun decode(json: String): DraftText? = try {
            val o = JSONObject(json)
            val t = o.getJSONArray("texts")
            val a = o.getJSONArray("answers")
            DraftText(
                stimulus = o.optString("stimulus", ""),
                texts = List(4) { t.optString(it, "") },
                answers = List(4) { a.optString(it, "") },
            )
        } catch (e: Exception) {
            null
        }
    }
}
