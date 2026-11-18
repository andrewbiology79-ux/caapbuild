package com.questionbank.app.data.backup

/** Row counts of the Type_CQ tables the owner cares about. Used to show what a backup contains and to compare copies. */
data class DbCounts(
    val subjects: Long,
    val chapters: Long,
    val topics: Long,
    val stimuli: Long,
    val questions: Long,
)

/** Result of looking inside a database file. [ok] is true only when every check passed; otherwise [problem] says why (Bengali, shown to the owner). */
data class InspectResult(
    val ok: Boolean,
    val problem: String?,
    val identityHash: String?,
    val counts: DbCounts?,
) {
    companion object {
        fun bad(problem: String) = InspectResult(false, problem, null, null)
    }
}
