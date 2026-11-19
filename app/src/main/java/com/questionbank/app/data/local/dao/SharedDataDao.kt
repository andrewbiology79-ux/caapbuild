package com.questionbank.app.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import com.questionbank.app.data.local.entity.*
import kotlinx.coroutines.flow.Flow

/** Shared catalog, metadata, journal and paper persistence. No question-scope tables are exposed here. */
@Dao
abstract class SharedDataDao {
    @Query("SELECT * FROM board_catalog ORDER BY is_archived, sort_order, display_name, board_id")
    abstract fun observeBoards(): Flow<List<BoardCatalogEntity>>

    @Query("SELECT * FROM board_catalog WHERE board_id = :id LIMIT 1")
    abstract suspend fun boardById(id: String): BoardCatalogEntity?

    @Query("SELECT * FROM board_catalog WHERE code = :code LIMIT 1")
    abstract suspend fun boardByCode(code: String): BoardCatalogEntity?

    @Insert(onConflict = OnConflictStrategy.ABORT)
    abstract suspend fun insertBoard(row: BoardCatalogEntity)

    @Query("UPDATE board_catalog SET display_name = :name, updated_at = :now WHERE board_id = :id")
    abstract suspend fun renameBoard(id: String, name: String, now: Long): Int

    @Query("UPDATE board_catalog SET is_archived = :archived, updated_at = :now WHERE board_id = :id")
    abstract suspend fun setBoardArchived(id: String, archived: Long, now: Long): Int

    @Query("SELECT value_json FROM app_metadata WHERE `key` = :key LIMIT 1")
    abstract suspend fun metadata(key: String): String?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun putMetadata(row: AppMetadataEntity)

    @Query("DELETE FROM app_metadata WHERE `key` = :key")
    abstract suspend fun deleteMetadata(key: String): Int

    @Insert(onConflict = OnConflictStrategy.ABORT)
    abstract suspend fun insertOperation(row: OperationJournalEntity)

    @Query("UPDATE operation_journal SET status = :status, payload_json = :payload, updated_at = :now WHERE operation_id = :id")
    abstract suspend fun updateOperation(id: String, status: String, payload: String, now: Long): Int

    @Query("SELECT * FROM operation_journal WHERE status IN (:statuses) ORDER BY created_at, operation_id")
    abstract fun observeOperations(statuses: List<String>): Flow<List<OperationJournalEntity>>

    @Query("SELECT * FROM paper_categories ORDER BY sort_order, name, paper_category_id")
    abstract fun observePaperCategories(): Flow<List<PaperCategoriesEntity>>

    @Query("SELECT * FROM papers WHERE paper_category_id = :categoryId ORDER BY sort_order, title, paper_id")
    abstract fun observePapers(categoryId: String): Flow<List<PapersEntity>>

    @Query("SELECT * FROM papers WHERE paper_id = :paperId LIMIT 1")
    abstract suspend fun paper(paperId: String): PapersEntity?

    @Query("SELECT * FROM paper_sections WHERE paper_id = :paperId ORDER BY sort_order, section_id")
    abstract fun observePaperSections(paperId: String): Flow<List<PaperSectionsEntity>>

    @Query("SELECT * FROM paper_question_items WHERE paper_id = :paperId ORDER BY sort_order, item_id")
    abstract fun observePaperItems(paperId: String): Flow<List<PaperQuestionItemsEntity>>

    @Query("SELECT * FROM paper_images ORDER BY created_at, paper_image_id")
    abstract fun observePaperImages(): Flow<List<PaperImagesEntity>>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    abstract suspend fun insertPaper(row: PapersEntity)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    abstract suspend fun insertPaperSection(row: PaperSectionsEntity)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    abstract suspend fun insertPaperItem(row: PaperQuestionItemsEntity)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    abstract suspend fun insertPaperItemOverride(row: PaperItemOverridesEntity)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    abstract suspend fun insertPaperItemImage(row: PaperItemImagesEntity)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    abstract suspend fun insertPaperImage(row: PaperImagesEntity)

    @Query("SELECT COUNT(*) FROM papers WHERE paper_id = :paperId")
    abstract suspend fun paperExists(paperId: String): Int

    @Query("SELECT COUNT(*) FROM paper_sections WHERE section_id = :sectionId AND paper_id = :paperId")
    abstract suspend fun sectionBelongsToPaper(sectionId: String, paperId: String): Int

    @Query("SELECT COUNT(*) FROM type_cq_questions WHERE question_id = :questionId")
    abstract suspend fun typeQuestionExists(questionId: String): Int

    @Query("SELECT COUNT(*) FROM chapter_cq_questions WHERE question_id = :questionId")
    abstract suspend fun chapterQuestionExists(questionId: String): Int

    @Transaction
    open suspend fun addSnapshotItem(item: PaperQuestionItemsEntity): Boolean {
        val hasType = item.typeCqQuestionId != null
        val hasChapter = item.chapterCqQuestionId != null
        if (hasType == hasChapter || paperExists(item.paperId) == 0) return false
        if (item.sectionId != null && sectionBelongsToPaper(item.sectionId, item.paperId) == 0) return false
        if (hasType && typeQuestionExists(item.typeCqQuestionId!!) == 0) return false
        if (hasChapter && chapterQuestionExists(item.chapterCqQuestionId!!) == 0) return false
        insertPaperItem(item)
        return true
    }

    @Query("SELECT * FROM paper_question_items WHERE item_id = :itemId LIMIT 1")
    abstract suspend fun paperItem(itemId: String): PaperQuestionItemsEntity?

    @Query("SELECT * FROM paper_item_overrides WHERE item_id = :itemId LIMIT 1")
    abstract suspend fun paperItemOverride(itemId: String): PaperItemOverridesEntity?

    @Query("SELECT * FROM paper_item_images WHERE item_id = :itemId ORDER BY position, paper_image_id")
    abstract suspend fun paperItemImages(itemId: String): List<PaperItemImagesEntity>

    @Query("DELETE FROM paper_item_images WHERE item_id = :itemId")
    abstract suspend fun clearPaperItemImages(itemId: String)

    @Query("DELETE FROM paper_item_overrides WHERE item_id = :itemId")
    abstract suspend fun clearPaperItemOverride(itemId: String)

    @Transaction
    open suspend fun replacePaperItemImages(itemId: String, rows: List<PaperItemImagesEntity>) {
        require(paperItem(itemId) != null) { "Paper item does not exist" }
        require(rows.all { it.itemId == itemId }) { "All images must belong to the target paper item" }
        clearPaperItemImages(itemId)
        rows.sortedWith(compareBy<PaperItemImagesEntity> { it.position }.thenBy { it.paperImageId })
            .forEach { insertPaperItemImage(it) }
    }
}
