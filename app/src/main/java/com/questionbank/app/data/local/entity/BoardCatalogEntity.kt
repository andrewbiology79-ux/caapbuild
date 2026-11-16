package com.questionbank.app.data.local.entity

import androidx.room.*

@Entity(tableName = "board_catalog", primaryKeys = ["board_id"], indices = [
        Index(value = ["code"], unique = true)
    ])
data class BoardCatalogEntity(
    @ColumnInfo(name = "board_id")
    val boardId: String,
    @ColumnInfo(name = "code")
    val code: String,
    @ColumnInfo(name = "display_name")
    val displayName: String,
    @ColumnInfo(name = "board_kind")
    val boardKind: String,
    @ColumnInfo(name = "is_archived", defaultValue = "0")
    val isArchived: Long,
    @ColumnInfo(name = "sort_order", defaultValue = "0")
    val sortOrder: Long,
    @ColumnInfo(name = "created_at")
    val createdAt: Long,
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long
)
