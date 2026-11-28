package com.questionbank.app.data.repository

import com.questionbank.app.data.local.dao.MediaDataDao
import com.questionbank.app.data.local.entity.ChapterCqImagesEntity
import com.questionbank.app.data.local.entity.TypeCqImagesEntity
import com.questionbank.app.domain.repository.MediaRepository
import kotlinx.coroutines.flow.Flow

class MediaRepositoryImpl(
    private val dao: MediaDataDao,
    private val beforeWrite: suspend () -> Unit = {},
) : MediaRepository {
    override fun observeTypeImages(): Flow<List<TypeCqImagesEntity>> = dao.observeTypeImages()
    override fun observeChapterImages(): Flow<List<ChapterCqImagesEntity>> = dao.observeChapterImages()
    override suspend fun registerTypeImage(row: TypeCqImagesEntity) { beforeWrite(); dao.insertTypeImage(row) }
    override suspend fun registerChapterImage(row: ChapterCqImagesEntity) { beforeWrite(); dao.insertChapterImage(row) }
    override suspend fun typeImage(id: String): TypeCqImagesEntity? = dao.typeImage(id)
    override suspend fun chapterImage(id: String): ChapterCqImagesEntity? = dao.chapterImage(id)
    override suspend fun setTypeImageStatus(id: String, status: String, now: Long): Boolean { beforeWrite(); return dao.setTypeImageStatus(id, status, now) == 1 }
    override suspend fun setChapterImageStatus(id: String, status: String, now: Long): Boolean { beforeWrite(); return dao.setChapterImageStatus(id, status, now) == 1 }
}
