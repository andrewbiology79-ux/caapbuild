package com.questionbank.app.domain.repository

import com.questionbank.app.data.local.dao.PaperSourceRowDb
import com.questionbank.app.data.local.entity.PaperCategoriesEntity
import com.questionbank.app.data.local.entity.PaperQuestionItemsEntity
import com.questionbank.app.data.local.entity.PaperSectionsEntity
import com.questionbank.app.data.local.entity.PapersEntity
import com.questionbank.app.domain.model.PaperCategorySummary
import com.questionbank.app.domain.model.PaperListSummary
import kotlinx.coroutines.flow.Flow

interface PaperRepository {
    fun observeCategories(): Flow<List<PaperCategoriesEntity>>
    fun observeCategorySummaries(): Flow<List<PaperCategorySummary>>
    fun observePaperSummaries(categoryId: String): Flow<List<PaperListSummary>>
    fun observePapers(categoryId: String): Flow<List<PapersEntity>>
    fun observeSections(paperId: String): Flow<List<PaperSectionsEntity>>
    fun observeItems(paperId: String): Flow<List<PaperQuestionItemsEntity>>
    /** Combined cross-scope keyset page; returns at most limit+1 rows to signal continuation. */
    suspend fun loadSourcePage(scope: String, query: String, limit: Int, after: PaperSourceRowDb? = null): List<PaperSourceRowDb>
    suspend fun loadPaper(paperId: String): PapersEntity?
    suspend fun createPaper(title: String, categoryId: String = DEFAULT_CATEGORY_ID): String
    suspend fun createCategory(name: String): String
    suspend fun renameCategory(categoryId: String, name: String): Boolean
    suspend fun deleteCategoryAndContents(categoryId: String): Boolean
    suspend fun deleteCategoriesAndContents(categoryIds: List<String>): Int
    suspend fun reorderCategories(orderedCategoryIds: List<String>): Boolean
    suspend fun deletePapersByIds(paperIds: List<String>): Int
    suspend fun deletePaper(paperId: String): Boolean
    suspend fun addSection(paperId: String, title: String): String
    suspend fun moveSection(paperId: String, sectionId: String, direction: Int): Boolean
    suspend fun deleteEmptySection(paperId: String, sectionId: String): Boolean
    suspend fun renamePaper(paperId: String, title: String): Boolean
    suspend fun updatePaperMetadata(paperId: String, subjectLine: String, durationText: String, noteText: String, totalMarks: Double?): Boolean
    suspend fun addQuestionSnapshot(paperId: String, sectionId: String?, scope: String, questionId: String): Boolean
    suspend fun addSnapshotItem(item: PaperQuestionItemsEntity): Boolean
    suspend fun updateItemMarks(paperId: String, itemId: String, marks: Double?): Boolean
    suspend fun removeItem(paperId: String, itemId: String): Boolean
    suspend fun updateItemOverride(paperId: String, itemId: String, questionText: String?, stimulusText: String?, shortAnswer: String?, solutionJson: String?): Boolean
    suspend fun loadItemOverride(itemId: String): com.questionbank.app.data.local.entity.PaperItemOverridesEntity?
    suspend fun loadItemImages(itemId: String): List<com.questionbank.app.data.local.entity.PaperImagesEntity>
    suspend fun loadItemImageLinks(itemId: String): List<com.questionbank.app.data.local.entity.PaperItemImagesEntity>
    suspend fun moveItem(paperId: String, itemId: String, direction: Int): Boolean
    suspend fun validatePaper(paperId: String): PaperValidation
    suspend fun collectOrphanMedia(): Int

    companion object {
        const val DEFAULT_CATEGORY_ID = "system_uncategorized"
    }
}

data class PaperValidation(
    val valid: Boolean,
    val itemCount: Int,
    val calculatedMarks: Double,
    val issues: List<String>,
)
