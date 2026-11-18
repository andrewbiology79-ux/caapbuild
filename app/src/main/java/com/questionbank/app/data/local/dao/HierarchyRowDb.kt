package com.questionbank.app.data.local.dao

import androidx.room.ColumnInfo

/** One list row with its counts, computed by SQL aggregates (no list is loaded into memory to count it). */
data class HierarchyRowDb(
    @ColumnInfo(name = "id") val id: String,
    @ColumnInfo(name = "name") val name: String,
    @ColumnInfo(name = "child_count") val childCount: Int,
    @ColumnInfo(name = "question_count") val questionCount: Int,
)

data class ChapterPathDb(
    @ColumnInfo(name = "subject_id") val subjectId: String,
    @ColumnInfo(name = "subject_name") val subjectName: String,
    @ColumnInfo(name = "chapter_id") val chapterId: String,
    @ColumnInfo(name = "chapter_name") val chapterName: String,
)

/** Result of "delete if empty", decided inside one transaction. */
sealed interface DeleteOutcome {
    data object Deleted : DeleteOutcome
    data object NotFound : DeleteOutcome
    data class NotEmpty(val childCount: Int, val questionCount: Int) : DeleteOutcome
}
