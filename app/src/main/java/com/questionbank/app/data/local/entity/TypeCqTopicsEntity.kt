package com.questionbank.app.data.local.entity

import androidx.room.*

@Entity(tableName = "type_cq_topics", primaryKeys = ["topic_id"], foreignKeys = [
        ForeignKey(entity = TypeCqChaptersEntity::class, parentColumns = ["chapter_id"], childColumns = ["chapter_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.RESTRICT)
    ], indices = [
        Index(value = ["chapter_id", "sort_order"], unique = false)
    ])
data class TypeCqTopicsEntity(
    @ColumnInfo(name = "topic_id")
    val topicId: String,
    @ColumnInfo(name = "chapter_id")
    val chapterId: String,
    @ColumnInfo(name = "name")
    val name: String,
    @ColumnInfo(name = "sort_order", defaultValue = "0")
    val sortOrder: Long,
    @ColumnInfo(name = "created_at")
    val createdAt: Long,
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long
)
