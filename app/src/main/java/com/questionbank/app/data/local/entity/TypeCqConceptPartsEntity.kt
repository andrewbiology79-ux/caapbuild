package com.questionbank.app.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index

/** Ordered TEXT / IMAGE blocks belonging to a Type CQ concept. */
@Entity(
    tableName = "type_cq_concept_parts",
    primaryKeys = ["part_id"],
    indices = [
        Index(value = ["concept_id", "position"], unique = true),
        Index(value = ["image_id"], unique = false),
    ],
    foreignKeys = [
        ForeignKey(
            entity = TypeCqConceptsEntity::class,
            parentColumns = ["concept_id"],
            childColumns = ["concept_id"],
            onUpdate = ForeignKey.CASCADE,
            onDelete = ForeignKey.CASCADE,
        ),
        ForeignKey(
            entity = TypeCqImagesEntity::class,
            parentColumns = ["image_id"],
            childColumns = ["image_id"],
            onUpdate = ForeignKey.CASCADE,
            onDelete = ForeignKey.RESTRICT,
        ),
    ],
)
data class TypeCqConceptPartsEntity(
    @ColumnInfo(name = "part_id") val partId: String,
    @ColumnInfo(name = "concept_id") val conceptId: String,
    @ColumnInfo(name = "position") val position: Long,
    @ColumnInfo(name = "part_type") val partType: String,
    @ColumnInfo(name = "text_content") val textContent: String?,
    @ColumnInfo(name = "image_id") val imageId: String?,
    @ColumnInfo(name = "created_at") val createdAt: Long,
)
