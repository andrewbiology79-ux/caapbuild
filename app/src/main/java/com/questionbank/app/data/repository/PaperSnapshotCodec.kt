package com.questionbank.app.data.repository

import com.questionbank.app.data.local.dao.PaperSourceRowDb
import com.questionbank.app.data.local.entity.PaperItemOverridesEntity
import org.json.JSONArray
import org.json.JSONObject

/** Immutable, versioned snapshot stored on each paper item. Never re-resolve it from a live question after insertion. */
object PaperSnapshotCodec {
    const val CURRENT_SCHEMA_VERSION = 1

    fun encode(
        source: PaperSourceRowDb,
        solutions: List<Pair<String, String?>>,
    ): String = JSONObject().apply {
        put("schemaVersion", CURRENT_SCHEMA_VERSION)
        put("scope", source.scope)
        put("sourceQuestionId", source.questionId)
        put("subject", JSONObject().put("id", source.subjectId).put("name", source.subjectName))
        put("chapter", JSONObject().put("id", source.chapterId).put("name", source.chapterName))
        put("container", JSONObject().put("id", source.containerId).put("name", source.containerName))
        put("stimulus", source.stimulusText)
        put("reference", source.referenceText)
        put("label", source.label)
        put("marks", source.marks)
        put("question", source.questionText)
        put("shortAnswer", source.shortAnswer)
        put("questionTypeId", source.questionTypeId)
        put("rating", source.rating)
        put("solutions", JSONArray().apply {
            solutions.forEachIndexed { index, part ->
                put(JSONObject().put("position", index).put("type", part.first).put("text", part.second))
            }
        })
    }.toString()

    fun title(json: String, override: PaperItemOverridesEntity? = null): String = runCatching {
        val root = JSONObject(json)
        require(root.getInt("schemaVersion") in 1..CURRENT_SCHEMA_VERSION) { "Unsupported paper snapshot version" }
        override?.questionTextOverride?.takeIf { it.isNotBlank() } ?: root.optString("question").ifBlank { "প্রশ্ন" }
    }.getOrDefault("সংরক্ষিত প্রশ্ন")

    fun stimulusPreview(json: String, override: PaperItemOverridesEntity? = null): String = runCatching {
        val root = JSONObject(json)
        require(root.getInt("schemaVersion") in 1..CURRENT_SCHEMA_VERSION) { "Unsupported paper snapshot version" }
        buildString {
            val stimulus = override?.stimulusTextOverride ?: root.optString("stimulus")
            val reference = root.optString("reference")
            if (stimulus.isNotBlank()) append("উদ্দীপক: ").append(stimulus).append("\n")
            if (reference.isNotBlank()) append("তথ্য: ").append(reference)
        }.trim()
    }.getOrDefault("Snapshot পড়া যায়নি")

    fun questionPreview(json: String, override: PaperItemOverridesEntity? = null): String = runCatching {
        val root = JSONObject(json)
        require(root.getInt("schemaVersion") in 1..CURRENT_SCHEMA_VERSION) { "Unsupported paper snapshot version" }
        buildString {
            val question = override?.questionTextOverride ?: root.optString("question")
            val answer = override?.shortAnswerOverride ?: root.optString("shortAnswer")
            append(question)
            if (answer.isNotBlank()) append("\nউত্তর: ").append(answer)
        }
    }.getOrDefault("Snapshot পড়া যায়নি")

    fun bodyPreview(json: String, override: PaperItemOverridesEntity? = null): String =
        listOf(stimulusPreview(json, override), questionPreview(json, override))
            .filter { it.isNotBlank() }.joinToString("\n")

    fun solutionPreview(json: String, override: PaperItemOverridesEntity? = null): String = runCatching {
        val root = JSONObject(json)
        require(root.getInt("schemaVersion") in 1..CURRENT_SCHEMA_VERSION) { "Unsupported paper snapshot version" }
        val rawOverride = override?.solutionJsonOverride?.takeIf { it.isNotBlank() }
        val solutions = if (rawOverride != null) {
            runCatching { JSONObject(rawOverride).optJSONArray("solutions") }.getOrNull()
                ?: runCatching { JSONArray(rawOverride) }.getOrNull()
        } else root.optJSONArray("solutions")
        buildString {
            if (solutions != null) for (index in 0 until solutions.length()) {
                val part = solutions.optJSONObject(index) ?: continue
                if (part.optString("type").equals("TEXT", true) && part.optString("text").isNotBlank()) {
                    append("সমাধান: ").append(part.optString("text")).append("\n")
                }
            }
        }.trim()
    }.getOrDefault("")

    fun preview(json: String, override: PaperItemOverridesEntity? = null): String =
        listOf(bodyPreview(json, override), solutionPreview(json, override))
            .filter { it.isNotBlank() }.joinToString("\n")

    fun marks(json: String): Double = runCatching {
        val root = JSONObject(json)
        require(root.getInt("schemaVersion") in 1..CURRENT_SCHEMA_VERSION)
        root.optDouble("marks", 0.0)
    }.getOrDefault(0.0)
}
