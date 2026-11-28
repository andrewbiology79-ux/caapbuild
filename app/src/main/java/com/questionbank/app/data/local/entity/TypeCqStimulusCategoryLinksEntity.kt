package com.questionbank.app.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index

@Entity(
    tableName = "type_cq_stimulus_category_links",
    primaryKeys = ["stimulus_id", "category_id"],
    foreignKeys = [
        ForeignKey(
            entity = TypeCqStimuliEntity::class,
            parentColumns = ["stimulus_id"],
            childColumns = ["stimulus_id"],
            onUpdate = ForeignKey.CASCADE,
            onDelete = ForeignKey.CASCADE,
        ),
        ForeignKey(
            entity = TypeCqQuestionCategoriesEntity::class,
            parentColumns = ["category_id"],
            childColumns = ["category_id"],
            onUpdate = ForeignKey.CASCADE,
            onDelete = ForeignKey.RESTRICT,
        ),
    ],
    indices = [Index(value = ["category_id", "stimulus_id"], unique = false)],
)
data class TypeCqStimulusCategoryLinksEntity(
    @ColumnInfo(name = "stimulus_id") val stimulusId: String,
    @ColumnInfo(name = "category_id") val categoryId: String,
    @ColumnInfo(name = "assigned_at") val assignedAt: Long,
)
