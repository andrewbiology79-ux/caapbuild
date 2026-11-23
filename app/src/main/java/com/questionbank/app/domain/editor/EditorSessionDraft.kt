package com.questionbank.app.domain.editor

import org.json.JSONArray
import org.json.JSONObject

/** Canonical draft shared by Type_CQ and Chapter_CQ editors (schema v2). */
enum class EditorScope { TYPE_CQ, CHAPTER_CQ }
enum class EditorMode { MINIMUM, FULL }
enum class EditorPartKind { TEXT, IMAGE }

data class EditorBoardYear(val boardCode: String, val year: Int)

data class EditorImageRef(
    val imageId: String,
    val placement: String = "TOP",
    val position: Long = 0L,
)

data class EditorSolutionPart(
    val partId: String,
    val kind: EditorPartKind,
    val position: Long,
    val text: String? = null,
    val imageId: String? = null,
)

data class EditorStimulusDraft(
    val stimulusId: String? = null,
    val text: String = "",
    val referenceText: String = "",
    val rating: Int? = null,
    val images: List<EditorImageRef> = emptyList(),
    val boardYears: List<EditorBoardYear> = emptyList(),
)

data class EditorQuestionBlockDraft(
    /** Stable identity is retained through edits, undo/redo and reorder. */
    val blockId: String,
    val questionId: String? = null,
    val label: String = "",
    val questionText: String = "",
    val shortAnswer: String = "",
    /** Raw text is kept until validation; invalid intermediate input is never truncated. */
    val rawMarks: String = "",
    val questionTypeId: String? = null,
    val rating: Int? = null,
    val boardYears: List<EditorBoardYear> = emptyList(),
    val categoryIds: List<String> = emptyList(),
    val solutionParts: List<EditorSolutionPart> = emptyList(),
    val conceptParts: List<EditorSolutionPart> = emptyList(),
)

data class EditorSessionDraft(
    val schemaVersion: Int = 2,
    val scope: EditorScope,
    val ownerId: String,
    val parentId: String = "",
    val hierarchyIds: List<String> = emptyList(),
    val existingStimulusId: String? = null,
    val existingQuestionIds: List<String> = emptyList(),
    val stimulus: EditorStimulusDraft = EditorStimulusDraft(),
    val questionBlocks: List<EditorQuestionBlockDraft> = emptyList(),
    val deletedQuestionIds: List<String> = emptyList(),
    val mode: EditorMode = EditorMode.MINIMUM,
    /** Independent category of the complete Type CQ card. */
    val cardCategoryId: String? = null,
    /** Edit drafts use this bit to distinguish an explicit clear from an older draft without the field. */
    val cardCategoryTouched: Boolean = false,
    /** The original JSON is retained as a merge base so fields written by newer/older clients are not erased. */
    val preservedJson: String? = null,
) {
    init {
        require(ownerId.isNotBlank()) { "Editor draft owner is required" }
        require(questionBlocks.map { it.blockId }.distinct().size == questionBlocks.size) { "Editor block IDs must be unique" }
    }
}

/** Versioned JSON codec. Known fields are updated over the previous JSON object; unknown keys survive round-trips. */
object EditorSessionDraftCodec {
    fun encode(draft: EditorSessionDraft): String {
        val base = runCatching { draft.preservedJson?.let(::JSONObject) ?: JSONObject() }.getOrElse { JSONObject() }
        val next = JSONObject()
            .put("schemaVersion", 2)
            .put("scope", draft.scope.name)
            .put("ownerId", draft.ownerId)
            .put("parentId", draft.parentId)
            .put("hierarchyIds", JSONArray(draft.hierarchyIds))
            .put("existingStimulusId", jsonOrNull(draft.existingStimulusId))
            .put("existingQuestionIds", JSONArray(draft.existingQuestionIds))
            .put("stimulus", stimulusJson(draft.stimulus))
            .put("questionBlocks", JSONArray().apply { draft.questionBlocks.forEach { put(blockJson(it)) } })
            .put("deletedQuestionIds", JSONArray(draft.deletedQuestionIds))
            .put("mode", draft.mode.name)
            .put("cardCategoryId", jsonOrNull(draft.cardCategoryId))
            .put("cardCategoryTouched", draft.cardCategoryTouched)
        return mergeObject(base, next).toString()
    }

    fun decode(raw: String): EditorSessionDraft? = runCatching {
        val root = JSONObject(raw)
        if (root.optInt("schemaVersion", 0) != 2) return@runCatching null
        val scope = EditorScope.valueOf(root.getString("scope"))
        val stimulus = root.optJSONObject("stimulus")?.let(::readStimulus) ?: EditorStimulusDraft()
        val blocks = root.optJSONArray("questionBlocks")?.let { array ->
            List(array.length()) { index -> readBlock(array.getJSONObject(index)) }
        }.orEmpty()
        EditorSessionDraft(
            schemaVersion = 2,
            scope = scope,
            ownerId = root.getString("ownerId"),
            parentId = root.optString("parentId"),
            hierarchyIds = stringList(root.optJSONArray("hierarchyIds")),
            existingStimulusId = root.optString("existingStimulusId").takeIf { it.isNotBlank() && it != "null" },
            existingQuestionIds = stringList(root.optJSONArray("existingQuestionIds")),
            stimulus = stimulus,
            questionBlocks = blocks,
            deletedQuestionIds = stringList(root.optJSONArray("deletedQuestionIds")),
            mode = runCatching { EditorMode.valueOf(root.optString("mode", "MINIMUM")) }.getOrDefault(EditorMode.MINIMUM),
            cardCategoryId = root.optString("cardCategoryId").takeIf { it.isNotBlank() && it != "null" },
            cardCategoryTouched = root.optBoolean("cardCategoryTouched", false),
            preservedJson = raw,
        )
    }.getOrNull()

    /**
     * org.json removes a key when put(key, null) is used, and the merge below would then keep the OLD value
     * from preservedJson. An explicit JSONObject.NULL overwrites it, so clearing a field really persists.
     */
    private fun jsonOrNull(value: Any?): Any = value ?: JSONObject.NULL

    private fun stimulusJson(value: EditorStimulusDraft) = JSONObject()
        .put("stimulusId", jsonOrNull(value.stimulusId))
        .put("text", value.text)
        .put("referenceText", value.referenceText)
        .put("rating", jsonOrNull(value.rating))
        .put("images", JSONArray().apply { value.images.forEach { put(JSONObject().put("imageId", it.imageId).put("placement", it.placement).put("position", it.position)) } })
        .put("boardYears", JSONArray().apply { value.boardYears.forEach { put(JSONObject().put("boardCode", it.boardCode).put("year", it.year)) } })

    private fun blockJson(value: EditorQuestionBlockDraft) = JSONObject()
        .put("blockId", value.blockId)
        .put("questionId", jsonOrNull(value.questionId))
        .put("label", value.label)
        .put("questionText", value.questionText)
        .put("shortAnswer", value.shortAnswer)
        .put("rawMarks", value.rawMarks)
        .put("questionTypeId", jsonOrNull(value.questionTypeId))
        .put("rating", jsonOrNull(value.rating))
        .put("boardYears", JSONArray().apply { value.boardYears.forEach { put(JSONObject().put("boardCode", it.boardCode).put("year", it.year)) } })
        .put("categoryIds", JSONArray(value.categoryIds))
        .put("solutionParts", JSONArray().apply {
            value.solutionParts.forEach { part ->
                put(JSONObject().put("partId", part.partId).put("kind", part.kind.name).put("position", part.position).put("text", jsonOrNull(part.text)).put("imageId", jsonOrNull(part.imageId)))
            }
        })
        .put("conceptParts", JSONArray().apply {
            value.conceptParts.forEach { part ->
                put(JSONObject().put("partId", part.partId).put("kind", part.kind.name).put("position", part.position).put("text", jsonOrNull(part.text)).put("imageId", jsonOrNull(part.imageId)))
            }
        })

    private fun readStimulus(value: JSONObject) = EditorStimulusDraft(
        stimulusId = value.optString("stimulusId").takeIf { it.isNotBlank() && it != "null" },
        text = value.optString("text"),
        referenceText = value.optString("referenceText"),
        rating = value.optInt("rating").takeIf { value.has("rating") && !value.isNull("rating") },
        images = value.optJSONArray("images")?.let { array -> List(array.length()) { i ->
            val row = array.getJSONObject(i); EditorImageRef(row.optString("imageId"), row.optString("placement", "TOP"), row.optLong("position"))
        } }.orEmpty(),
        boardYears = readBoardYears(value.optJSONArray("boardYears")),
    )

    private fun readBlock(value: JSONObject) = EditorQuestionBlockDraft(
        blockId = value.getString("blockId"),
        questionId = value.optString("questionId").takeIf { it.isNotBlank() && it != "null" },
        label = value.optString("label"),
        questionText = value.optString("questionText"),
        shortAnswer = value.optString("shortAnswer"),
        rawMarks = value.optString("rawMarks"),
        questionTypeId = value.optString("questionTypeId").takeIf { it.isNotBlank() && it != "null" },
        rating = value.optInt("rating").takeIf { value.has("rating") && !value.isNull("rating") },
        boardYears = readBoardYears(value.optJSONArray("boardYears")),
        categoryIds = stringList(value.optJSONArray("categoryIds")),
        solutionParts = value.optJSONArray("solutionParts")?.let { array -> List(array.length()) { i ->
            val part = array.getJSONObject(i)
            EditorSolutionPart(
                partId = part.optString("partId"),
                kind = runCatching { EditorPartKind.valueOf(part.optString("kind", "TEXT")) }.getOrDefault(EditorPartKind.TEXT),
                position = part.optLong("position", i.toLong()),
                text = part.optString("text").takeIf { !part.isNull("text") },
                imageId = part.optString("imageId").takeIf { !part.isNull("imageId") },
            )
        } }.orEmpty(),
        conceptParts = value.optJSONArray("conceptParts")?.let { array -> List(array.length()) { i ->
            val part = array.getJSONObject(i)
            EditorSolutionPart(
                partId = part.optString("partId"),
                kind = runCatching { EditorPartKind.valueOf(part.optString("kind", "TEXT")) }.getOrDefault(EditorPartKind.TEXT),
                position = part.optLong("position", i.toLong()),
                text = part.optString("text").takeIf { !part.isNull("text") },
                imageId = part.optString("imageId").takeIf { !part.isNull("imageId") },
            )
        } }.orEmpty(),
    )

    private fun readBoardYears(array: JSONArray?): List<EditorBoardYear> = array?.let {
        List(it.length()) { i -> it.getJSONObject(i).let { row -> EditorBoardYear(row.getString("boardCode"), row.getInt("year")) } }
    }.orEmpty()

    private fun stringList(array: JSONArray?): List<String> = array?.let { List(it.length()) { index -> it.optString(index) } }.orEmpty()

    /** Object merge preserves unknown object keys, including unknown keys inside known nested objects and block records. */
    private fun mergeObject(old: JSONObject, updates: JSONObject): JSONObject {
        val merged = JSONObject(old.toString())
        val keys = updates.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            val newValue = updates.get(key)
            val oldValue = merged.opt(key)
            val value = when {
                oldValue is JSONObject && newValue is JSONObject -> mergeObject(oldValue, newValue)
                oldValue is JSONArray && newValue is JSONArray && key == "questionBlocks" -> mergeArrayByKey(oldValue, newValue, "blockId")
                oldValue is JSONArray && newValue is JSONArray && key == "solutionParts" -> mergeArrayByKey(oldValue, newValue, "partId")
                oldValue is JSONArray && newValue is JSONArray && key == "images" -> mergeArrayByKey(oldValue, newValue, "imageId")
                oldValue is JSONArray && newValue is JSONArray && key == "boardYears" -> mergeArrayByKey(oldValue, newValue, "boardCode", "year")
                else -> newValue
            }
            merged.put(key, value)
        }
        return merged
    }

    private fun mergeArrayByKey(old: JSONArray, updates: JSONArray, primaryKey: String, secondaryKey: String? = null): JSONArray {
        fun identity(row: JSONObject): String {
            val first = row.optString(primaryKey)
            val second = secondaryKey?.let { row.optString(it) }.orEmpty()
            return if (secondaryKey == null) first else "$first|$second"
        }
        val existing = buildMap<String, JSONObject> {
            for (i in 0 until old.length()) {
                val row = old.optJSONObject(i) ?: continue
                identity(row).takeIf { it.isNotBlank() && it != "|" }?.let { put(it, row) }
            }
        }
        return JSONArray().apply {
            for (i in 0 until updates.length()) {
                val row = updates.getJSONObject(i)
                val id = identity(row)
                put(existing[id]?.let { mergeObject(it, row) } ?: row)
            }
        }
    }
}
