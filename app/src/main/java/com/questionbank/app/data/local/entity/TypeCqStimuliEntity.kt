package com.questionbank.app.data.local.entity

import androidx.room.*

@Entity(tableName = "type_cq_stimuli", primaryKeys = ["stimulus_id"], foreignKeys = [
        ForeignKey(entity = TypeCqTopicsEntity::class, parentColumns = ["topic_id"], childColumns = ["topic_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.RESTRICT)
    ], indices = [
        Index(value = ["topic_id", "updated_at"], unique = false)
    ])
data class TypeCqStimuliEntity(
    @ColumnInfo(name = "stimulus_id")
    val stimulusId: String,
    @ColumnInfo(name = "topic_id")
    val topicId: String,
    @ColumnInfo(name = "stimulus_text", defaultValue = "''")
    val stimulusText: String,
    @ColumnInfo(name = "rating")
    val rating: Long?,
    @ColumnInfo(name = "reference_text", defaultValue = "''")
    val referenceText: String,
    @ColumnInfo(name = "created_at")
    val createdAt: Long,
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long
)
