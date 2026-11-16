package com.questionbank.app.data.local.entity

import androidx.room.*

@Entity(tableName = "paper_item_images", primaryKeys = ["item_id", "paper_image_id"], foreignKeys = [
        ForeignKey(entity = PaperImagesEntity::class, parentColumns = ["paper_image_id"], childColumns = ["paper_image_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.RESTRICT),
        ForeignKey(entity = PaperQuestionItemsEntity::class, parentColumns = ["item_id"], childColumns = ["item_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.CASCADE)
    ], indices = [
        Index(value = ["item_id", "position"], unique = true),
        
    ])
data class PaperItemImagesEntity(
    @ColumnInfo(name = "item_id")
    val itemId: String,
    @ColumnInfo(name = "paper_image_id")
    val paperImageId: String,
    @ColumnInfo(name = "position")
    val position: Long,
    @ColumnInfo(name = "placement")
    val placement: String
)
