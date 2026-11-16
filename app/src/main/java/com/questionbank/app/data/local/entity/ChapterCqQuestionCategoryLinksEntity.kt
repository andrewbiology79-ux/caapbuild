package com.questionbank.app.data.local.entity

import androidx.room.*

@Entity(tableName = "chapter_cq_question_category_links", primaryKeys = ["question_id", "category_id"], foreignKeys = [
        ForeignKey(entity = ChapterCqQuestionCategoriesEntity::class, parentColumns = ["category_id"], childColumns = ["category_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.RESTRICT),
        ForeignKey(entity = ChapterCqQuestionsEntity::class, parentColumns = ["question_id"], childColumns = ["question_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.CASCADE)
    ], indices = [
        
    ])
data class ChapterCqQuestionCategoryLinksEntity(
    @ColumnInfo(name = "question_id")
    val questionId: String,
    @ColumnInfo(name = "category_id")
    val categoryId: String,
    @ColumnInfo(name = "assigned_at")
    val assignedAt: Long
)
