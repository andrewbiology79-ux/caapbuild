package com.questionbank.app.data.local.entity

import androidx.room.*

@Entity(tableName = "paper_images", primaryKeys = ["paper_image_id"], indices = [
        Index(value = ["relative_path"], unique = true)
    ])
data class PaperImagesEntity(
    @ColumnInfo(name = "paper_image_id")
    val paperImageId: String,
    @ColumnInfo(name = "relative_path")
    val relativePath: String,
    @ColumnInfo(name = "mime_type")
    val mimeType: String,
    @ColumnInfo(name = "width")
    val width: Long,
    @ColumnInfo(name = "height")
    val height: Long,
    @ColumnInfo(name = "byte_size")
    val byteSize: Long,
    @ColumnInfo(name = "sha256")
    val sha256: String,
    @ColumnInfo(name = "created_at")
    val createdAt: Long
)
