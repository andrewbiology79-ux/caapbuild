package com.questionbank.app.data.local

import androidx.room.useReaderConnection
import com.questionbank.app.domain.search.GlobalQuestionHit
import com.questionbank.app.domain.search.GlobalQuestionSearchFilters

private data class SearchArg(val text: String? = null, val number: Long? = null)

/**
 * One reader-connection query over the canonical FTS tables and both question scopes. The FTS match is combined with a
 * bounded LIKE fallback so stimulus text and hashtag terms are searchable too. Filters are correlated EXISTS predicates,
 * so they cannot multiply result rows or cross a scope boundary.
 */
suspend fun QuestionBankDatabase.searchAllQuestions(filters: GlobalQuestionSearchFilters): List<GlobalQuestionHit> {
    val tokens = com.questionbank.app.domain.question.QuestionSearchRules.tokens(filters.query)
    val hasFilters = filters.boardCode != null || filters.year != null || filters.categoryId != null ||
        filters.rating != null || filters.questionTypeId != null || filters.subjectId != null ||
        filters.chapterId != null || filters.topicId != null
    if (tokens.isEmpty() && !hasFilters) return emptyList()
    if (filters.scope !in setOf("ALL", "TYPE_CQ", "CHAPTER_CQ")) return emptyList()
    if (filters.scope == "CHAPTER_CQ" && (filters.questionTypeId != null || filters.topicId != null)) return emptyList()
    if (filters.categoryId != null && filters.categoryScope !in setOf("TYPE_CQ", "CHAPTER_CQ")) return emptyList()
    if (filters.rating != null && filters.rating !in 1..5) return emptyList()
    if (filters.year != null && filters.year !in 1900..2200) return emptyList()
    fun selectorScope(value: String?): String? = value?.substringBefore('|')?.takeIf { it in setOf("TYPE_CQ", "CHAPTER_CQ") }
    fun selectorId(value: String?): String? = value?.substringAfter('|', "")?.takeIf { it.isNotBlank() }
    val hierarchySelectors = listOf(filters.subjectId, filters.chapterId, filters.topicId)
    if (hierarchySelectors.filterNotNull().any { selectorScope(it) == null || selectorId(it) == null }) return emptyList()
    val selectorScopes = listOf(filters.subjectId, filters.chapterId, filters.topicId).mapNotNull(::selectorScope).distinct()
    if (selectorScopes.size > 1) return emptyList()
    val hierarchyScope = selectorScopes.firstOrNull()
    if (hierarchyScope != null && filters.scope != "ALL" && hierarchyScope != filters.scope) return emptyList()
    val match = com.questionbank.app.domain.question.QuestionSearchRules.ftsQuery(tokens)
    val branches = mutableListOf<Pair<String, List<SearchArg>>>()

    fun buildBranch(scope: String): Pair<String, List<SearchArg>> {
        val type = scope == "TYPE_CQ"
        val questionTable = if (type) "type_cq_questions" else "chapter_cq_questions"
        val stimulusTable = if (type) "type_cq_stimuli" else "chapter_cq_stimuli"
        val questionBoardTable = if (type) "type_cq_question_boards" else "chapter_cq_question_boards"
        val stimulusBoardTable = if (type) "type_cq_stimulus_boards" else "chapter_cq_stimulus_boards"
        val categoryLinkTable = if (type) "type_cq_question_category_links" else "chapter_cq_question_category_links"
        val categoryTable = if (type) "type_cq_question_categories" else "chapter_cq_question_categories"
        val ftsTable = if (type) "type_cq_question_fts" else "chapter_cq_question_fts"
        val subjectTable = if (type) "type_cq_subjects" else "chapter_cq_subjects"
        val chapterTable = if (type) "type_cq_chapters" else "chapter_cq_chapters"
        val containerJoin = if (type) "JOIN type_cq_topics tp ON tp.topic_id=q.topic_id JOIN type_cq_chapters ch ON ch.chapter_id=tp.chapter_id" else "JOIN chapter_cq_chapters ch ON ch.chapter_id=q.chapter_id"
        val containerName = if (type) "tp.name" else "ch.name"
        val chapterName = "ch.name"
        val subjectJoin = "JOIN $subjectTable sb ON sb.subject_id=ch.subject_id"
        val ratingSql = "CASE WHEN q.stimulus_id IS NULL THEN COALESCE(q.rating, 3) ELSE COALESCE(s.rating, (SELECT CAST(ROUND(AVG(qr.rating)) AS INTEGER) FROM $questionTable qr WHERE qr.stimulus_id=q.stimulus_id AND qr.rating IS NOT NULL), q.rating, 3) END"
        val selectedType = if (type) "q.question_type_id" else "NULL"
        val duplicateSql = if (type) {
            "(EXISTS (SELECT 1 FROM type_cq_questions dq WHERE dq.question_id<>q.question_id AND lower(trim(dq.question_text))=lower(trim(q.question_text)) AND trim(q.question_text)<>'') OR EXISTS (SELECT 1 FROM chapter_cq_questions dq WHERE lower(trim(dq.question_text))=lower(trim(q.question_text)) AND trim(q.question_text)<>''))"
        } else {
            "(EXISTS (SELECT 1 FROM chapter_cq_questions dq WHERE dq.question_id<>q.question_id AND lower(trim(dq.question_text))=lower(trim(q.question_text)) AND trim(q.question_text)<>'') OR EXISTS (SELECT 1 FROM type_cq_questions dq WHERE lower(trim(dq.question_text))=lower(trim(q.question_text)) AND trim(q.question_text)<>''))"
        }
        val sql = StringBuilder()
        val args = mutableListOf<SearchArg>()
        sql.append("SELECT '").append(scope).append("' AS scope, q.question_id, sb.name AS subject_name, ")
            .append(chapterName).append(" AS chapter_name, ").append(containerName).append(" AS container_name, ")
            .append("COALESCE(s.stimulus_text,''), q.subquestion_label, q.marks, q.question_text, q.short_answer, ")
            .append(ratingSql).append(" AS group_rating, ").append(selectedType).append(" AS question_type_id, ")
            .append("COALESCE((SELECT GROUP_CONCAT(board_code || ' ' || year, ', ') FROM $questionBoardTable qb WHERE qb.question_id=q.question_id),'') || ")
            .append("CASE WHEN q.stimulus_id IS NULL THEN '' ELSE COALESCE((SELECT CASE WHEN COUNT(*)=0 THEN '' ELSE ' · ' || GROUP_CONCAT(board_code || ' ' || year, ', ') END FROM $stimulusBoardTable sbx WHERE sbx.stimulus_id=q.stimulus_id),'') END AS board_years, ")
            .append("COALESCE((SELECT GROUP_CONCAT(c.name, ', ') FROM $categoryLinkTable cl JOIN $categoryTable c ON c.category_id=cl.category_id WHERE cl.question_id=q.question_id),'') AS categories, ")
            .append(duplicateSql).append(" AS possible_duplicate, ")
            .append(if (type) "q.topic_id" else "q.chapter_id").append(" AS container_id, q.stimulus_id AS stimulus_id ")
            .append("FROM $questionTable q $containerJoin $subjectJoin LEFT JOIN $stimulusTable s ON s.stimulus_id=q.stimulus_id WHERE 1=1")

        if (tokens.isNotEmpty()) {
            val likeTerms = tokens.joinToString(" AND ") { "(lower(q.question_text) LIKE ? OR lower(q.short_answer) LIKE ? OR lower(COALESCE(s.stimulus_text,'')) LIKE ?)" }
            if (match != null) {
                sql.append(" AND (q.fts_id IN (SELECT rowid FROM $ftsTable WHERE $ftsTable MATCH ?) OR (").append(likeTerms).append("))")
                args += SearchArg(text = match)
            } else {
                sql.append(" AND (").append(likeTerms).append(")")
            }
            tokens.forEach { token ->
                val like = "%${token.lowercase(java.util.Locale.ROOT)}%"
                args += SearchArg(text = like); args += SearchArg(text = like); args += SearchArg(text = like)
            }
            // Hashtags are not indexed by the FTS tokenizer (the '#' is significant), so each one must
            // independently match question text, answer, or stimulus even when the normal words match FTS.
            tokens.filter { com.questionbank.app.domain.question.QuestionSearchRules.isHashWord(it) }.forEach { token ->
                sql.append(" AND (lower(q.question_text) LIKE ? OR lower(q.short_answer) LIKE ? OR lower(COALESCE(s.stimulus_text,'')) LIKE ?)")
                val like = "%${token.lowercase(java.util.Locale.ROOT)}%"
                args += SearchArg(text = like); args += SearchArg(text = like); args += SearchArg(text = like)
            }
        }
        if (filters.boardCode != null || filters.year != null) {
            sql.append(" AND EXISTS (SELECT 1 FROM (SELECT board_code,year FROM $questionBoardTable WHERE question_id=q.question_id UNION ALL SELECT board_code,year FROM $stimulusBoardTable WHERE stimulus_id=q.stimulus_id) bt WHERE 1=1")
            filters.boardCode?.let { sql.append(" AND bt.board_code=?"); args += SearchArg(text = it) }
            filters.year?.let { sql.append(" AND bt.year=?"); args += SearchArg(number = it.toLong()) }
            sql.append(")")
        }
        if (filters.categoryId != null && filters.categoryScope == scope) {
            sql.append(" AND EXISTS (SELECT 1 FROM $categoryLinkTable cfl WHERE cfl.question_id=q.question_id AND cfl.category_id=?)")
            args += SearchArg(text = filters.categoryId)
        }
        if (filters.rating != null) {
            sql.append(" AND ").append(ratingSql).append("=?")
            args += SearchArg(number = filters.rating.toLong())
        }
        if (type && filters.questionTypeId != null) {
            sql.append(" AND q.question_type_id=?")
            args += SearchArg(text = filters.questionTypeId)
        }
        if (filters.subjectId != null && selectorScope(filters.subjectId) == scope) {
            sql.append(" AND sb.subject_id=?")
            args += SearchArg(text = selectorId(filters.subjectId))
        }
        if (filters.chapterId != null && selectorScope(filters.chapterId) == scope) {
            sql.append(" AND ch.chapter_id=?")
            args += SearchArg(text = selectorId(filters.chapterId))
        }
        if (type && filters.topicId != null && selectorScope(filters.topicId) == scope) {
            sql.append(" AND q.topic_id=?")
            args += SearchArg(text = selectorId(filters.topicId))
        }
        return sql.toString() to args
    }

    if ((filters.scope == "ALL" || filters.scope == "TYPE_CQ") && (hierarchyScope == null || hierarchyScope == "TYPE_CQ")) branches += buildBranch("TYPE_CQ")
    if ((filters.scope == "ALL" || filters.scope == "CHAPTER_CQ") && hierarchyScope != "TYPE_CQ" && filters.topicId == null) branches += buildBranch("CHAPTER_CQ")
    if (filters.categoryId != null && filters.categoryScope in setOf("TYPE_CQ", "CHAPTER_CQ")) {
        branches.removeAll { !it.first.startsWith("SELECT '${filters.categoryScope}' AS scope") }
    }
    if (branches.isEmpty()) return emptyList()
    val union = branches.joinToString(" UNION ALL ") { "SELECT * FROM (${it.first})" }
    val sql = "SELECT * FROM ($union) results ORDER BY subject_name COLLATE NOCASE, chapter_name COLLATE NOCASE, container_name COLLATE NOCASE, question_id LIMIT ${filters.limit.coerceIn(1, 500)}"
    val args = branches.flatMap { it.second }
    return useReaderConnection { connection ->
        connection.usePrepared(sql) { statement ->
            args.forEachIndexed { index, arg ->
                when {
                    arg.text != null -> statement.bindText(index + 1, arg.text)
                    arg.number != null -> statement.bindLong(index + 1, arg.number)
                }
            }
            val results = ArrayList<GlobalQuestionHit>()
            while (statement.step()) {
                results += GlobalQuestionHit(
                    scope = statement.getText(0), questionId = statement.getText(1), subjectName = statement.getText(2),
                    chapterName = statement.getText(3), containerName = statement.getText(4), stimulusText = statement.getText(5),
                    label = statement.getText(6), marks = statement.getDouble(7), questionText = statement.getText(8),
                    shortAnswer = statement.getText(9), groupRating = statement.getLong(10).toInt(),
                    questionTypeId = if (statement.isNull(11)) null else statement.getText(11),
                    boardYears = statement.getText(12), categories = statement.getText(13), possibleDuplicate = statement.getLong(14) != 0L,
                    containerId = statement.getText(15), stimulusId = if (statement.isNull(16)) null else statement.getText(16),
                )
            }
            results
        }
    }
}
