package com.questionbank.app.data.local.entity

import androidx.room.*

@Entity(tableName = "chapter_cq_stimulus_images", primaryKeys = ["stimulus_id", "image_id"], foreignKeys = [
        ForeignKey(entity = ChapterCqImagesEntity::class, parentColumns = ["image_id"], childColumns = ["image_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.RESTRICT),
        ForeignKey(entity = ChapterCqStimuliEntity::class, parentColumns = ["stimulus_id"], childColumns = ["stimulus_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.CASCADE)
    ], indices = [
        Index(value = ["stimulus_id", "position"], unique = true),
        Index(value = ["image_id"], unique = false)
    ])
data class ChapterCqStimulusImagesEntity(
    @ColumnInfo(name = "stimulus_id")
    val stimulusId: String,
    @ColumnInfo(name = "image_id")
    val imageId: String,
    @ColumnInfo(name = "position")
    val position: Long,
    @ColumnInfo(name = "placement")
    val placement: String
)
