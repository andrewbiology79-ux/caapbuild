package com.questionbank.app.domain.repository

import com.questionbank.app.data.local.entity.ChapterCqImagesEntity
import com.questionbank.app.data.local.entity.TypeCqImagesEntity
import kotlinx.coroutines.flow.Flow

interface MediaRepository {
    fun observeTypeImages(): Flow<List<TypeCqImagesEntity>>
    fun observeChapterImages(): Flow<List<ChapterCqImagesEntity>>
    suspend fun registerTypeImage(row: TypeCqImagesEntity)
    suspend fun registerChapterImage(row: ChapterCqImagesEntity)
    suspend fun typeImage(id: String): TypeCqImagesEntity?
    suspend fun chapterImage(id: String): ChapterCqImagesEntity?
    suspend fun setTypeImageStatus(id: String, status: String, now: Long): Boolean
    suspend fun setChapterImageStatus(id: String, status: String, now: Long): Boolean
}
