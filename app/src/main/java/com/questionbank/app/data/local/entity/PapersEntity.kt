package com.questionbank.app.data.local.entity

import androidx.room.*

@Entity(tableName = "papers", primaryKeys = ["paper_id"], foreignKeys = [
        ForeignKey(entity = PaperCategoriesEntity::class, parentColumns = ["paper_category_id"], childColumns = ["paper_category_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.RESTRICT)
    ], indices = [
        Index(value = ["paper_category_id", "sort_order"], unique = false)
    ])
data class PapersEntity(
    @ColumnInfo(name = "paper_id")
    val paperId: String,
    @ColumnInfo(name = "paper_category_id")
    val paperCategoryId: String,
    @ColumnInfo(name = "short_name", defaultValue = "''")
    val shortName: String,
    @ColumnInfo(name = "title")
    val title: String,
    @ColumnInfo(name = "subject_line", defaultValue = "''")
    val subjectLine: String,
    @ColumnInfo(name = "duration_text", defaultValue = "''")
    val durationText: String,
    @ColumnInfo(name = "total_marks")
    val totalMarks: Double?,
    @ColumnInfo(name = "note_text", defaultValue = "''")
    val noteText: String,
    @ColumnInfo(name = "sort_order", defaultValue = "0")
    val sortOrder: Long,
    @ColumnInfo(name = "created_at")
    val createdAt: Long,
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long
)
