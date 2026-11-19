package com.questionbank.app.domain.repository

import com.questionbank.app.data.local.entity.PaperQuestionItemsEntity
import com.questionbank.app.data.local.entity.PapersEntity
import kotlinx.coroutines.flow.Flow

interface PaperRepository {
    fun observePapers(categoryId: String): Flow<List<PapersEntity>>
    fun observeItems(paperId: String): Flow<List<PaperQuestionItemsEntity>>
    suspend fun loadPaper(paperId: String): PapersEntity?
    suspend fun addSnapshotItem(item: PaperQuestionItemsEntity): Boolean
}
