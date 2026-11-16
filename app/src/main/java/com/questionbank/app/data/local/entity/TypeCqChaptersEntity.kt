package com.questionbank.app.data.local.entity

import androidx.room.*

@Entity(tableName = "type_cq_chapters", primaryKeys = ["chapter_id"], foreignKeys = [
        ForeignKey(entity = TypeCqSubjectsEntity::class, parentColumns = ["subject_id"], childColumns = ["subject_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.RESTRICT)
    ], indices = [
        Index(value = ["subject_id", "sort_order"], unique = false)
    ])
data class TypeCqChaptersEntity(
    @ColumnInfo(name = "chapter_id")
    val chapterId: String,
    @ColumnInfo(name = "subject_id")
    val subjectId: String,
    @ColumnInfo(name = "name")
    val name: String,
    @ColumnInfo(name = "sort_order", defaultValue = "0")
    val sortOrder: Long,
    @ColumnInfo(name = "created_at")
    val createdAt: Long,
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long
)
