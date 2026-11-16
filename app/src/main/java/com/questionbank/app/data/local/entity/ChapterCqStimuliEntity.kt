package com.questionbank.app.data.local.entity

import androidx.room.*

@Entity(tableName = "chapter_cq_stimuli", primaryKeys = ["stimulus_id"], foreignKeys = [
        ForeignKey(entity = ChapterCqChaptersEntity::class, parentColumns = ["chapter_id"], childColumns = ["chapter_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.RESTRICT)
    ], indices = [
        Index(value = ["chapter_id", "updated_at"], unique = false)
    ])
data class ChapterCqStimuliEntity(
    @ColumnInfo(name = "stimulus_id")
    val stimulusId: String,
    @ColumnInfo(name = "chapter_id")
    val chapterId: String,
    @ColumnInfo(name = "stimulus_text", defaultValue = "''")
    val stimulusText: String,
    @ColumnInfo(name = "rating")
    val rating: Long?,
    @ColumnInfo(name = "reference_text", defaultValue = "''")
    val referenceText: String,
    @ColumnInfo(name = "created_at")
    val createdAt: Long,
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long
)
