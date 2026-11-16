package com.questionbank.app.data.local

import androidx.room.Dao
import androidx.room.Query

@Dao
interface RoomSmokeDao {
    @Query("SELECT COUNT(*) FROM type_cq_subjects")
    suspend fun countTypeSubjects(): Long

    @Query("SELECT COUNT(*) FROM chapter_cq_subjects")
    suspend fun countChapterSubjects(): Long
}
