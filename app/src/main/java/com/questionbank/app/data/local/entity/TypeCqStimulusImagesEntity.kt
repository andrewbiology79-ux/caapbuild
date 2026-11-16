package com.questionbank.app.data.local.entity

import androidx.room.*

@Entity(tableName = "type_cq_stimulus_images", primaryKeys = ["stimulus_id", "image_id"], foreignKeys = [
        ForeignKey(entity = TypeCqImagesEntity::class, parentColumns = ["image_id"], childColumns = ["image_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.RESTRICT),
        ForeignKey(entity = TypeCqStimuliEntity::class, parentColumns = ["stimulus_id"], childColumns = ["stimulus_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.CASCADE)
    ], indices = [
        Index(value = ["stimulus_id", "placement", "position"], unique = false),
        Index(value = ["stimulus_id", "position"], unique = true),
        
    ])
data class TypeCqStimulusImagesEntity(
    @ColumnInfo(name = "stimulus_id")
    val stimulusId: String,
    @ColumnInfo(name = "image_id")
    val imageId: String,
    @ColumnInfo(name = "position")
    val position: Long,
    @ColumnInfo(name = "placement")
    val placement: String
)
