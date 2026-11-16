package com.questionbank.app.data.local.entity

import androidx.room.*

@Entity(tableName = "chapter_cq_stimulus_boards", primaryKeys = ["id"], foreignKeys = [
        ForeignKey(entity = BoardCatalogEntity::class, parentColumns = ["code"], childColumns = ["board_code"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.RESTRICT),
        ForeignKey(entity = ChapterCqStimuliEntity::class, parentColumns = ["stimulus_id"], childColumns = ["stimulus_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.CASCADE)
    ], indices = [
        Index(value = ["stimulus_id", "board_code", "year"], unique = true)
    ])
data class ChapterCqStimulusBoardsEntity(
    @ColumnInfo(name = "id")
    val id: String,
    @ColumnInfo(name = "stimulus_id")
    val stimulusId: String,
    @ColumnInfo(name = "board_code")
    val boardCode: String,
    @ColumnInfo(name = "year")
    val year: Long,
    @ColumnInfo(name = "sort_order", defaultValue = "0")
    val sortOrder: Long
)
