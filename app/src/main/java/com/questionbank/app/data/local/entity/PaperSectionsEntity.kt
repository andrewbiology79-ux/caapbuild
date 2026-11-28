package com.questionbank.app.data.local.entity

import androidx.room.*

@Entity(tableName = "paper_sections", primaryKeys = ["section_id"], foreignKeys = [
        ForeignKey(entity = PapersEntity::class, parentColumns = ["paper_id"], childColumns = ["paper_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.CASCADE)
    ], indices = [
        Index(value = ["paper_id"], unique = false)
    ])
data class PaperSectionsEntity(
    @ColumnInfo(name = "section_id")
    val sectionId: String,
    @ColumnInfo(name = "paper_id")
    val paperId: String,
    @ColumnInfo(name = "title", defaultValue = "''")
    val title: String,
    @ColumnInfo(name = "sort_order", defaultValue = "0")
    val sortOrder: Long
)
