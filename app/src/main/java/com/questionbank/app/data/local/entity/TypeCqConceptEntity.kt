package com.questionbank.app.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index

/** A single concept belongs to exactly one Type-CQ card: a stimulus group or a lone question. */
@Entity(
    tableName = "type_cq_concepts",
    primaryKeys = ["concept_id"],
    foreignKeys = [
        ForeignKey(entity = TypeCqTopicsEntity::class, parentColumns = ["topic_id"], childColumns = ["topic_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.CASCADE),
        ForeignKey(entity = TypeCqStimuliEntity::class, parentColumns = ["stimulus_id"], childColumns = ["stimulus_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.CASCADE),
        ForeignKey(entity = TypeCqQuestionsEntity::class, parentColumns = ["question_id"], childColumns = ["question_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.CASCADE),
    ],
    indices = [
        Index(value = ["topic_id"], unique = false),
        Index(value = ["stimulus_id"], unique = true),
        Index(value = ["question_id"], unique = true),
    ],
)
data class TypeCqConceptEntity(
    @ColumnInfo(name = "concept_id") val conceptId: String,
    @ColumnInfo(name = "topic_id") val topicId: String,
    @ColumnInfo(name = "stimulus_id") val stimulusId: String?,
    @ColumnInfo(name = "question_id") val questionId: String?,
    @ColumnInfo(name = "created_at") val createdAt: Long,
    @ColumnInfo(name = "updated_at") val updatedAt: Long,
)
