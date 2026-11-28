package com.questionbank.app.data.local.entity

import androidx.room.*

@Entity(tableName = "chapter_cq_subjects", primaryKeys = ["subject_id"], indices = [
        Index(value = ["name"], unique = true)
    ])
data class ChapterCqSubjectsEntity(
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
