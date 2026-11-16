package com.questionbank.app.data.local.entity

import androidx.room.*

@Entity(tableName = "paper_item_overrides", primaryKeys = ["item_id"], foreignKeys = [
        ForeignKey(entity = PaperQuestionItemsEntity::class, parentColumns = ["item_id"], childColumns = ["item_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.CASCADE)
    ])
data class PaperItemOverridesEntity(
    @ColumnInfo(name = "item_id")
    val itemId: String,
    @ColumnInfo(name = "question_text_override")
    val questionTextOverride: String?,
    @ColumnInfo(name = "stimulus_text_override")
    val stimulusTextOverride: String?,
    @ColumnInfo(name = "short_answer_override")
    val shortAnswerOverride: String?,
    @ColumnInfo(name = "solution_json_override")
    val solutionJsonOverride: String?,
    @ColumnInfo(name = "marks_override")
    val marksOverride: Double?,
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long
)
