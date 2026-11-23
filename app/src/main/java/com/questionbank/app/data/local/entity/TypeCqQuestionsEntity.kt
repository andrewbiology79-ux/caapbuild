package com.questionbank.app.data.local.entity

import androidx.room.*

@Entity(tableName = "type_cq_questions", primaryKeys = ["question_id"], foreignKeys = [
        ForeignKey(entity = TypeCqQuestionTypesEntity::class, parentColumns = ["question_type_id"], childColumns = ["question_type_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.RESTRICT),
        ForeignKey(entity = TypeCqTopicsEntity::class, parentColumns = ["topic_id"], childColumns = ["topic_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.RESTRICT),
        ForeignKey(entity = TypeCqStimuliEntity::class, parentColumns = ["stimulus_id"], childColumns = ["stimulus_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.RESTRICT),
        ForeignKey(entity = TypeCqQuestionCategoriesEntity::class, parentColumns = ["category_id"], childColumns = ["card_category_id"], onUpdate = ForeignKey.CASCADE, onDelete = ForeignKey.RESTRICT)
    ], indices = [
        Index(value = ["fts_id"], unique = true),
        Index(value = ["question_type_id", "sort_order"], unique = false),
        Index(value = ["stimulus_id", "sort_order"], unique = false),
        Index(value = ["topic_id", "sort_order"], unique = false),
        Index(value = ["card_category_id"], unique = false)
    ])
data class TypeCqQuestionsEntity(
    @ColumnInfo(name = "question_id")
    val questionId: String,
    @ColumnInfo(name = "fts_id")
    val ftsId: Long,
    @ColumnInfo(name = "stimulus_id")
    val stimulusId: String?,
    @ColumnInfo(name = "topic_id")
    val topicId: String,
    @ColumnInfo(name = "question_type_id")
    val questionTypeId: String,
    @ColumnInfo(name = "subquestion_label")
    val subquestionLabel: String,
    @ColumnInfo(name = "marks")
    val marks: Double,
    @ColumnInfo(name = "question_text", defaultValue = "''")
    val questionText: String,
    @ColumnInfo(name = "short_answer", defaultValue = "''")
    val shortAnswer: String,
    @ColumnInfo(name = "rating")
    val rating: Long?,
    @ColumnInfo(name = "sort_order", defaultValue = "0")
    val sortOrder: Long,
    @ColumnInfo(name = "created_at")
    val createdAt: Long,
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long,
    /** New card-level category. Legacy per-question category links remain in type_cq_question_category_links untouched. */
    @ColumnInfo(name = "card_category_id")
    val cardCategoryId: String? = null
)
