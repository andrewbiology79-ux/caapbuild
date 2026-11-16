package com.questionbank.app.data.local.entity

import androidx.room.*

@Entity(tableName = "chapter_cq_solution_parts", primaryKeys = ["part_id"], foreignKeys = [
        ForeignKey(entity = ChapterCqImagesEntity::class, parentColumns = ["image_id"], childColumns = ["image_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.RESTRICT),
        ForeignKey(entity = ChapterCqQuestionsEntity::class, parentColumns = ["question_id"], childColumns = ["question_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.CASCADE)
    ], indices = [
        Index(value = ["question_id", "position"], unique = false),
        Index(value = ["question_id", "position"], unique = true)
    ])
data class ChapterCqSolutionPartsEntity(
    @ColumnInfo(name = "part_id")
    val partId: String,
    @ColumnInfo(name = "question_id")
    val questionId: String,
    @ColumnInfo(name = "position")
    val position: Long,
    @ColumnInfo(name = "part_type")
    val partType: String,
    @ColumnInfo(name = "text_content")
    val textContent: String?,
    @ColumnInfo(name = "image_id")
    val imageId: String?,
    @ColumnInfo(name = "created_at")
    val createdAt: Long
)
