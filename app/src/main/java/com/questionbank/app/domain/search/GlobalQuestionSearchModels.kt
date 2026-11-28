package com.questionbank.app.domain.search

/** Read-only cross-scope result. No DAO/entity coupling is introduced between the two domains. */
data class GlobalQuestionHit(
    val scope: String,
    val questionId: String,
    val subjectName: String,
    val chapterName: String,
    val containerName: String,
    val stimulusText: String,
    val label: String,
    val marks: Double,
    val questionText: String,
    val shortAnswer: String,
    val groupRating: Int,
    val questionTypeId: String?,
    val boardYears: String,
    val categories: String,
    val possibleDuplicate: Boolean,
    /** Type_CQ topic ID or Chapter_CQ chapter ID, used only to open the matching scope detail. */
    val containerId: String,
    val stimulusId: String?,
)

data class GlobalQuestionSearchFilters(
    val query: String = "",
    val scope: String = "ALL", // ALL, TYPE_CQ, CHAPTER_CQ
    val boardCode: String? = null,
    val year: Int? = null,
    val categoryId: String? = null,
    val categoryScope: String? = null, // TYPE_CQ or CHAPTER_CQ
    val rating: Int? = null,
    val questionTypeId: String? = null, // Type_CQ only
    /** Scope-qualified IDs: TYPE_CQ|id or CHAPTER_CQ|id, to avoid collisions across tables. */
    val subjectId: String? = null,
    val chapterId: String? = null,
    /** Type_CQ only; Chapter_CQ has no Topic level. */
    val topicId: String? = null,
    val limit: Int = 300,
)



interface GlobalQuestionSearchRepository {
    suspend fun search(filters: GlobalQuestionSearchFilters): List<GlobalQuestionHit>
}

class GlobalQuestionSearchUseCase(private val repository: GlobalQuestionSearchRepository) {
    suspend operator fun invoke(filters: GlobalQuestionSearchFilters): List<GlobalQuestionHit> = repository.search(filters)
}
