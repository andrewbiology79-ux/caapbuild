package com.questionbank.app.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index

/** One optional concept note for an individual Type CQ sub-question. */
@Entity(
    tableName = "type_cq_concepts",
    primaryKeys = ["concept_id"],
    indices = [Index(value = ["question_id"], unique = true)],
    foreignKeys = [
        ForeignKey(
            entity = TypeCqQuestionsEntity::class,
            parentColumns = ["question_id"],
            childColumns = ["question_id"],
            onUpdate = ForeignKey.CASCADE,
            onDelete = ForeignKey.CASCADE,
        ),
    ],
)
data class TypeCqConceptsEntity(
    @ColumnInfo(name = "concept_id") val conceptId: String,
    @ColumnInfo(name = "question_id") val questionId: String,
    @ColumnInfo(name = "created_at") val createdAt: Long,
    @ColumnInfo(name = "updated_at") val updatedAt: Long,
)
