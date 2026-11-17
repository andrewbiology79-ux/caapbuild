package com.questionbank.app.data.local.entity

import androidx.room.*

@Entity(tableName = "chapter_cq_questions", primaryKeys = ["question_id"], foreignKeys = [
        ForeignKey(entity = ChapterCqChaptersEntity::class, parentColumns = ["chapter_id"], childColumns = ["chapter_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.RESTRICT),
        ForeignKey(entity = ChapterCqStimuliEntity::class, parentColumns = ["stimulus_id"], childColumns = ["stimulus_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.RESTRICT)
    ], indices = [
        Index(value = ["fts_id"], unique = true),
        Index(value = ["stimulus_id", "sort_order"], unique = false),
        Index(value = ["chapter_id", "sort_order"], unique = false)
    ])
data class ChapterCqQuestionsEntity(
    @ColumnInfo(name = "question_id")
    val questionId: String,
    @ColumnInfo(name = "fts_id")
    val ftsId: Long,
    @ColumnInfo(name = "stimulus_id")
    val stimulusId: String?,
    @ColumnInfo(name = "chapter_id")
    val chapterId: String,
    @ColumnInfo(name = "subquestion_label")
    val subquestionLabel: String,
    @ColumnInfo(name = "marks")
    val marks: Double,
    @ColumnInfo(name = "question_text", defaultValue = "''")
    val questionText: String,
    @ColumnInfo(name = "short_answer", defaultValue = "''")
    val shortAnswer: String,
    @ColumnInfo(name = "rating")
    val rating: Long?,
    @ColumnInfo(name = "sort_order", defaultValue = "0")
    val sortOrder: Long,
    @ColumnInfo(name = "created_at")
    val createdAt: Long,
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long
)
