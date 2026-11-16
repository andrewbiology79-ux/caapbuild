package com.questionbank.app.data.local.entity

import androidx.room.*

@Entity(tableName = "paper_question_items", primaryKeys = ["item_id"], foreignKeys = [
        ForeignKey(entity = ChapterCqQuestionsEntity::class, parentColumns = ["question_id"], childColumns = ["chapter_cq_question_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.SET_NULL),
        ForeignKey(entity = TypeCqQuestionsEntity::class, parentColumns = ["question_id"], childColumns = ["type_cq_question_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.SET_NULL),
        ForeignKey(entity = PaperSectionsEntity::class, parentColumns = ["section_id"], childColumns = ["section_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.SET_NULL),
        ForeignKey(entity = PapersEntity::class, parentColumns = ["paper_id"], childColumns = ["paper_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.CASCADE)
    ], indices = [
        Index(value = ["paper_id", "sort_order"], unique = false)
    ])
data class PaperQuestionItemsEntity(
    @ColumnInfo(name = "item_id")
    val itemId: String,
    @ColumnInfo(name = "paper_id")
    val paperId: String,
    @ColumnInfo(name = "section_id")
    val sectionId: String?,
    @ColumnInfo(name = "type_cq_question_id")
    val typeCqQuestionId: String?,
    @ColumnInfo(name = "chapter_cq_question_id")
    val chapterCqQuestionId: String?,
    @ColumnInfo(name = "snapshot_json")
    val snapshotJson: String,
    @ColumnInfo(name = "sort_order", defaultValue = "0")
    val sortOrder: Long,
    @ColumnInfo(name = "marks_override")
    val marksOverride: Double?,
    @ColumnInfo(name = "created_at")
    val createdAt: Long
)
