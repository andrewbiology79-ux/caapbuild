package com.questionbank.app.data.local.entity

import androidx.room.*

@Entity(tableName = "type_cq_images", primaryKeys = ["image_id"], indices = [
        Index(value = ["relative_path"], unique = true)
    ])
data class TypeCqImagesEntity(
    @ColumnInfo(name = "image_id")
    val imageId: String,
    @ColumnInfo(name = "relative_path")
    val relativePath: String,
    @ColumnInfo(name = "original_name", defaultValue = "''")
    val originalName: String,
    @ColumnInfo(name = "stored_name")
    val storedName: String,
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
    @ColumnInfo(name = "processing_status", defaultValue = "'READY'")
    val processingStatus: String,
    @ColumnInfo(name = "created_at")
    val createdAt: Long,
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long
)
