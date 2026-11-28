package com.questionbank.app.domain.model

data class PaperCategorySummary(
    val categoryId: String,
    val name: String,
    val sortOrder: Long,
    val isSystem: Boolean,
    val paperCount: Int,
    val questionCount: Int,
)

data class PaperListSummary(
    val paperId: String,
    val title: String,
    val subjectLine: String,
    val sortOrder: Long,
    val questionCount: Int,
)
