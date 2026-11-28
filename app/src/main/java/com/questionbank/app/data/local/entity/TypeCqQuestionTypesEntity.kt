package com.questionbank.app.data.local.entity

import androidx.room.*

@Entity(tableName = "type_cq_question_types", primaryKeys = ["question_type_id"], indices = [
        Index(value = ["code"], unique = true)
    ])
data class TypeCqQuestionTypesEntity(
    @ColumnInfo(name = "question_type_id")
    val questionTypeId: String,
    @ColumnInfo(name = "code")
    val code: String,
    @ColumnInfo(name = "label")
    val label: String,
    @ColumnInfo(name = "sort_order", defaultValue = "0")
    val sortOrder: Long,
    @ColumnInfo(name = "is_active", defaultValue = "1")
    val isActive: Long
)
