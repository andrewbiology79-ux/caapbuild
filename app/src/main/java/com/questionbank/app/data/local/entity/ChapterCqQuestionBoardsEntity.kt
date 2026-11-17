package com.questionbank.app.data.local.entity

import androidx.room.*

@Entity(tableName = "chapter_cq_question_boards", primaryKeys = ["id"], foreignKeys = [
        ForeignKey(entity = BoardCatalogEntity::class, parentColumns = ["code"], childColumns = ["board_code"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.RESTRICT),
        ForeignKey(entity = ChapterCqQuestionsEntity::class, parentColumns = ["question_id"], childColumns = ["question_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.CASCADE)
    ], indices = [
        Index(value = ["question_id", "board_code", "year"], unique = true),
        Index(value = ["board_code", "year"], unique = false)
    ])
data class ChapterCqQuestionBoardsEntity(
    @ColumnInfo(name = "id")
    val id: String,
    @ColumnInfo(name = "question_id")
    val questionId: String,
    @ColumnInfo(name = "board_code")
    val boardCode: String,
    @ColumnInfo(name = "year")
    val year: Long,
    @ColumnInfo(name = "sort_order", defaultValue = "0")
    val sortOrder: Long
)
