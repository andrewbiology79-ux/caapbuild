package com.questionbank.app.data.local.dao

import androidx.room.ColumnInfo

/** Read-only source projection used by Paper Builder; Type_CQ and Chapter_CQ are resolved independently. */
data class PaperSourceRowDb(
    @ColumnInfo(name = "scope") val scope: String,
    @ColumnInfo(name = "question_id") val questionId: String,
    @ColumnInfo(name = "subject_id") val subjectId: String,
    @ColumnInfo(name = "subject_name") val subjectName: String,
    @ColumnInfo(name = "chapter_id") val chapterId: String,
    @ColumnInfo(name = "chapter_name") val chapterName: String,
    @ColumnInfo(name = "container_id") val containerId: String,
    @ColumnInfo(name = "container_name") val containerName: String,
    @ColumnInfo(name = "stimulus_id") val stimulusId: String?,
    @ColumnInfo(name = "stimulus_text") val stimulusText: String,
    @ColumnInfo(name = "reference_text") val referenceText: String,
    @ColumnInfo(name = "label") val label: String,
    @ColumnInfo(name = "marks") val marks: Double,
    @ColumnInfo(name = "question_text") val questionText: String,
    @ColumnInfo(name = "short_answer") val shortAnswer: String,
    @ColumnInfo(name = "rating") val rating: Long?,
    @ColumnInfo(name = "question_type_id") val questionTypeId: String?,
)
