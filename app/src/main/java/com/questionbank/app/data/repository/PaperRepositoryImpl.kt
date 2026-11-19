package com.questionbank.app.data.repository

import com.questionbank.app.data.local.dao.SharedDataDao
import com.questionbank.app.data.local.entity.PaperQuestionItemsEntity
import com.questionbank.app.data.local.entity.PapersEntity
import com.questionbank.app.domain.repository.PaperRepository
import kotlinx.coroutines.flow.Flow

class PaperRepositoryImpl(
    private val dao: SharedDataDao,
    private val beforeWrite: suspend () -> Unit = {},
) : PaperRepository {
    override fun observePapers(categoryId: String): Flow<List<PapersEntity>> = dao.observePapers(categoryId)
    override fun observeItems(paperId: String): Flow<List<PaperQuestionItemsEntity>> = dao.observePaperItems(paperId)
    override suspend fun loadPaper(paperId: String): PapersEntity? = dao.paper(paperId)
    override suspend fun addSnapshotItem(item: PaperQuestionItemsEntity): Boolean {
        beforeWrite()
        return dao.addSnapshotItem(item)
    }
}
