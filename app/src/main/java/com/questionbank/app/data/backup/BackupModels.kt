package com.questionbank.app.data.backup

/** Row counts of the Type_CQ tables the owner cares about. Used to show what a backup contains and to compare copies. */
data class DbCounts(
    /** Type_CQ counts. Kept under their legacy field names for source compatibility. */
    val subjects: Long,
    val chapters: Long,
    val topics: Long,
    val stimuli: Long,
    val questions: Long,
    /** Chapter_CQ counts; that scope has no Topic level. */
    val chapterSubjects: Long = 0,
    val chapterChapters: Long = 0,
    val chapterStimuli: Long = 0,
    val chapterQuestions: Long = 0,
) {
    val totalQuestions: Long get() = questions + chapterQuestions
}

/** Result of looking inside a database file. [ok] is true only when every check passed; otherwise [problem] says why (Bengali, shown to the owner). */
data class InspectResult(
    val ok: Boolean,
    val problem: String?,
    val identityHash: String?,
    val counts: DbCounts?,
    val databaseVersion: Int? = null,
) {
    companion object {
        fun bad(problem: String) = InspectResult(false, problem, null, null, null)
    }
}
