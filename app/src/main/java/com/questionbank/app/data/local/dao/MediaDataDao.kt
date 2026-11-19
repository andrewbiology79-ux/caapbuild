package com.questionbank.app.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.questionbank.app.data.local.entity.ChapterCqImagesEntity
import com.questionbank.app.data.local.entity.TypeCqImagesEntity
import kotlinx.coroutines.flow.Flow

/** Image metadata only; file I/O remains outside Room transactions. */
@Dao
abstract class MediaDataDao {
    @Query("SELECT * FROM type_cq_images ORDER BY created_at, image_id")
    abstract fun observeTypeImages(): Flow<List<TypeCqImagesEntity>>

    @Query("SELECT * FROM chapter_cq_images ORDER BY created_at, image_id")
    abstract fun observeChapterImages(): Flow<List<ChapterCqImagesEntity>>

    @Query("SELECT * FROM type_cq_images WHERE image_id = :id LIMIT 1")
    abstract suspend fun typeImage(id: String): TypeCqImagesEntity?

    @Query("SELECT * FROM chapter_cq_images WHERE image_id = :id LIMIT 1")
    abstract suspend fun chapterImage(id: String): ChapterCqImagesEntity?

    @Insert(onConflict = OnConflictStrategy.ABORT)
    abstract suspend fun insertTypeImage(row: TypeCqImagesEntity)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    abstract suspend fun insertChapterImage(row: ChapterCqImagesEntity)

    @Query("UPDATE type_cq_images SET processing_status = :status, updated_at = :now WHERE image_id = :id")
    abstract suspend fun setTypeImageStatus(id: String, status: String, now: Long): Int

    @Query("UPDATE chapter_cq_images SET processing_status = :status, updated_at = :now WHERE image_id = :id")
    abstract suspend fun setChapterImageStatus(id: String, status: String, now: Long): Int
}
