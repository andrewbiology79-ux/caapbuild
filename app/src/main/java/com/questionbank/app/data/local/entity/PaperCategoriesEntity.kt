package com.questionbank.app.data.local.entity

import androidx.room.*

@Entity(tableName = "paper_categories", primaryKeys = ["paper_category_id"], indices = [
        Index(value = ["name"], unique = true)
    ])
data class PaperCategoriesEntity(
    @ColumnInfo(name = "paper_category_id")
    val paperCategoryId: String,
    @ColumnInfo(name = "name")
    val name: String,
    @ColumnInfo(name = "description", defaultValue = "''")
    val description: String,
    @ColumnInfo(name = "color", defaultValue = "''")
    val color: String,
    @ColumnInfo(name = "icon", defaultValue = "''")
    val icon: String,
    @ColumnInfo(name = "sort_order", defaultValue = "0")
    val sortOrder: Long,
    @ColumnInfo(name = "is_system", defaultValue = "0")
    val isSystem: Long,
    @ColumnInfo(name = "created_at")
    val createdAt: Long,
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long
)
