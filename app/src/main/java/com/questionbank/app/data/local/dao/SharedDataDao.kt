package com.questionbank.app.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import com.questionbank.app.data.local.entity.*
import kotlinx.coroutines.flow.Flow



data class PaperCategorySummaryDb(
    val categoryId: String,
    val name: String,
    val sortOrder: Long,
    val isSystem: Long,
    val paperCount: Int,
    val questionCount: Int,
)

data class PaperListSummaryDb(
    val paperId: String,
    val title: String,
    val subjectLine: String,
    val sortOrder: Long,
    val questionCount: Int,
)




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

    @Query("SELECT COUNT(*) FROM board_catalog WHERE code = :code")
    abstract suspend fun boardCodeExists(code: String): Int

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

    @Query("SELECT * FROM operation_journal WHERE status IN ('PENDING','RUNNING') ORDER BY created_at, operation_id")
    abstract suspend fun pendingOperations(): List<OperationJournalEntity>

    @Query("SELECT * FROM papers WHERE paper_category_id = :categoryId ORDER BY sort_order, title, paper_id")
    abstract fun observePapers(categoryId: String): Flow<List<PapersEntity>>

    @Query("SELECT * FROM papers WHERE paper_id = :paperId LIMIT 1")
    abstract suspend fun paper(paperId: String): PapersEntity?

    @Query("SELECT * FROM paper_images ORDER BY created_at, paper_image_id")
    abstract fun observePaperImages(): Flow<List<PaperImagesEntity>>

    @Query("SELECT * FROM paper_images ORDER BY created_at, paper_image_id")
    abstract suspend fun allPaperImages(): List<PaperImagesEntity>

    @Query("SELECT * FROM paper_categories ORDER BY sort_order, name, paper_category_id")
    abstract fun observePaperCategories(): Flow<List<PaperCategoriesEntity>>

    @Query("""
        SELECT c.paper_category_id AS categoryId, c.name AS name, c.sort_order AS sortOrder,
               c.is_system AS isSystem, COUNT(DISTINCT p.paper_id) AS paperCount,
               COUNT(DISTINCT i.item_id) AS questionCount
        FROM paper_categories c
        LEFT JOIN papers p ON p.paper_category_id = c.paper_category_id
        LEFT JOIN paper_question_items i ON i.paper_id = p.paper_id
        GROUP BY c.paper_category_id, c.name, c.sort_order, c.is_system
        ORDER BY CASE WHEN c.is_system = 1 THEN 0 ELSE 1 END, c.sort_order, c.name, c.paper_category_id
    """)
    abstract fun observePaperCategorySummaries(): Flow<List<PaperCategorySummaryDb>>

    @Query("""
        SELECT p.paper_id AS paperId, p.title AS title, p.subject_line AS subjectLine,
               p.sort_order AS sortOrder, COUNT(i.item_id) AS questionCount
        FROM papers p LEFT JOIN paper_question_items i ON i.paper_id = p.paper_id
        WHERE p.paper_category_id = :categoryId
        GROUP BY p.paper_id, p.title, p.subject_line, p.sort_order
        ORDER BY p.sort_order, p.title, p.paper_id
    """)
    abstract fun observePaperListSummaries(categoryId: String): Flow<List<PaperListSummaryDb>>

    @Query("SELECT * FROM paper_categories ORDER BY sort_order, name, paper_category_id")
    abstract suspend fun allPaperCategories(): List<PaperCategoriesEntity>

    @Query("SELECT COUNT(*) FROM paper_categories WHERE lower(trim(name)) = lower(trim(:name))")
    abstract suspend fun paperCategoryNameExists(name: String): Int

    @Query("UPDATE paper_categories SET sort_order = :sortOrder, updated_at = :now WHERE paper_category_id = :categoryId AND is_system = 0")
    abstract suspend fun updatePaperCategoryOrder(categoryId: String, sortOrder: Long, now: Long): Int

    /** One database-level keyset page across both independent question scopes; no deep OFFSET scan. */
    @Query("""
        WITH paper_sources AS (
            SELECT 'TYPE_CQ' AS scope, q.question_id AS question_id,
                   sb.subject_id AS subject_id, sb.name AS subject_name,
                   ch.chapter_id AS chapter_id, ch.name AS chapter_name,
                   tp.topic_id AS container_id, tp.name AS container_name,
                   q.stimulus_id AS stimulus_id, COALESCE(st.stimulus_text,'') AS stimulus_text,
                   COALESCE(st.reference_text,'') AS reference_text,
                   q.subquestion_label AS label, q.marks AS marks, q.question_text AS question_text,
                   q.short_answer AS short_answer, q.rating AS rating, q.question_type_id AS question_type_id
            FROM type_cq_questions q
            JOIN type_cq_topics tp ON tp.topic_id=q.topic_id
            JOIN type_cq_chapters ch ON ch.chapter_id=tp.chapter_id
            JOIN type_cq_subjects sb ON sb.subject_id=ch.subject_id
            LEFT JOIN type_cq_stimuli st ON st.stimulus_id=q.stimulus_id
            UNION ALL
            SELECT 'CHAPTER_CQ' AS scope, q.question_id AS question_id,
                   sb.subject_id AS subject_id, sb.name AS subject_name,
                   ch.chapter_id AS chapter_id, ch.name AS chapter_name,
                   ch.chapter_id AS container_id, ch.name AS container_name,
                   q.stimulus_id AS stimulus_id, COALESCE(st.stimulus_text,'') AS stimulus_text,
                   COALESCE(st.reference_text,'') AS reference_text,
                   q.subquestion_label AS label, q.marks AS marks, q.question_text AS question_text,
                   q.short_answer AS short_answer, q.rating AS rating, CAST(NULL AS TEXT) AS question_type_id
            FROM chapter_cq_questions q
            JOIN chapter_cq_chapters ch ON ch.chapter_id=q.chapter_id
            JOIN chapter_cq_subjects sb ON sb.subject_id=ch.subject_id
            LEFT JOIN chapter_cq_stimuli st ON st.stimulus_id=q.stimulus_id
        )
        SELECT * FROM paper_sources
        WHERE (:scope = 'ALL' OR scope = :scope)
          AND (:query = '' OR lower(question_text) LIKE '%' || lower(:query) || '%'
            OR lower(stimulus_text) LIKE '%' || lower(:query) || '%'
            OR lower(subject_name) LIKE '%' || lower(:query) || '%'
            OR lower(chapter_name) LIKE '%' || lower(:query) || '%'
            OR lower(container_name) LIKE '%' || lower(:query) || '%')
          AND (:afterSubject IS NULL
            OR subject_name COLLATE NOCASE > :afterSubject COLLATE NOCASE
            OR (subject_name COLLATE NOCASE = :afterSubject COLLATE NOCASE AND subject_name > :afterSubject)
            OR (subject_name = :afterSubject AND chapter_name COLLATE NOCASE > :afterChapter COLLATE NOCASE)
            OR (subject_name = :afterSubject AND chapter_name COLLATE NOCASE = :afterChapter COLLATE NOCASE AND chapter_name > :afterChapter)
            OR (subject_name = :afterSubject AND chapter_name = :afterChapter AND container_name COLLATE NOCASE > :afterContainer COLLATE NOCASE)
            OR (subject_name = :afterSubject AND chapter_name = :afterChapter AND container_name COLLATE NOCASE = :afterContainer COLLATE NOCASE AND container_name > :afterContainer)
            OR (subject_name = :afterSubject AND chapter_name = :afterChapter AND container_name = :afterContainer AND question_id > :afterQuestionId)
            OR (subject_name = :afterSubject AND chapter_name = :afterChapter AND container_name = :afterContainer AND question_id = :afterQuestionId AND scope > :afterScope))
        ORDER BY subject_name COLLATE NOCASE, subject_name,
                 chapter_name COLLATE NOCASE, chapter_name,
                 container_name COLLATE NOCASE, container_name, question_id, scope
        LIMIT :limit
    """)
    abstract suspend fun paperSourcePage(
        scope: String, query: String, limit: Int,
        afterSubject: String?, afterChapter: String?, afterContainer: String?, afterQuestionId: String?, afterScope: String?,
    ): List<PaperSourceRowDb>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    abstract suspend fun insertPaperCategory(row: PaperCategoriesEntity)

    @Query("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM paper_categories")
    abstract suspend fun nextPaperCategorySortOrder(): Long

    @Query("UPDATE paper_categories SET name = :name, updated_at = :now WHERE paper_category_id = :categoryId AND is_system = 0")
    abstract suspend fun renamePaperCategory(categoryId: String, name: String, now: Long): Int

    @Query("SELECT is_system FROM paper_categories WHERE paper_category_id = :categoryId LIMIT 1")
    abstract suspend fun paperCategoryIsSystem(categoryId: String): Long?

    @Query("SELECT paper_id FROM papers WHERE paper_category_id = :categoryId ORDER BY sort_order, title, paper_id")
    abstract suspend fun paperIdsInCategory(categoryId: String): List<String>

    @Query("DELETE FROM paper_categories WHERE paper_category_id = :categoryId AND is_system = 0")
    abstract suspend fun deletePaperCategory(categoryId: String): Int

    @Transaction
    open suspend fun deletePaperCategoriesWithPapers(categoryIds: List<String>): Int {
        var deleted = 0
        categoryIds.distinct().forEach { categoryId ->
            if (paperCategoryIsSystem(categoryId) != 0L) return@forEach
            paperIdsInCategory(categoryId).forEach { paperId -> deletePaper(paperId) }
            deleted += deletePaperCategory(categoryId)
        }
        return deleted
    }

    @Transaction
    open suspend fun deletePapers(paperIds: List<String>): Int =
        paperIds.distinct().sumOf { deletePaper(it) }

    @Transaction
    open suspend fun reorderPaperCategories(orderedCategoryIds: List<String>, now: Long): Boolean {
        val currentIds = allPaperCategories().filter { it.isSystem == 0L }.map { it.paperCategoryId }.toSet()
        if (orderedCategoryIds.toSet() != currentIds || orderedCategoryIds.size != currentIds.size) return false
        orderedCategoryIds.forEachIndexed { index, id ->
            if (updatePaperCategoryOrder(id, index + 1L, now) != 1) return false
        }
        return true
    }


    @Query("SELECT * FROM paper_sections WHERE paper_id = :paperId ORDER BY sort_order, section_id")
    abstract fun observePaperSections(paperId: String): Flow<List<PaperSectionsEntity>>

    @Query("""
        SELECT * FROM paper_question_items
        WHERE paper_id = :paperId
        ORDER BY COALESCE((SELECT sort_order FROM paper_sections WHERE section_id = paper_question_items.section_id), 9223372036854775807),
                 sort_order, item_id
    """)
    abstract fun observePaperItems(paperId: String): Flow<List<PaperQuestionItemsEntity>>

    @Query("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM papers WHERE paper_category_id = :categoryId")
    abstract suspend fun nextPaperSortOrder(categoryId: String): Long

    @Query("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM paper_sections WHERE paper_id = :paperId")
    abstract suspend fun nextSectionSortOrder(paperId: String): Long

    @Query("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM paper_question_items WHERE paper_id = :paperId AND ((section_id = :sectionId) OR (section_id IS NULL AND :sectionId IS NULL))")
    abstract suspend fun nextItemSortOrder(paperId: String, sectionId: String?): Long

    @Query("SELECT COUNT(*) FROM paper_categories WHERE paper_category_id = :categoryId")
    abstract suspend fun paperCategoryExists(categoryId: String): Int

    @Query("UPDATE papers SET title = :title, updated_at = :now WHERE paper_id = :paperId")
    abstract suspend fun renamePaper(paperId: String, title: String, now: Long): Int

    @Query("UPDATE papers SET subject_line = :subjectLine, duration_text = :durationText, note_text = :noteText, total_marks = :totalMarks, updated_at = :now WHERE paper_id = :paperId")
    abstract suspend fun updatePaperMetadata(paperId: String, subjectLine: String, durationText: String, noteText: String, totalMarks: Double?, now: Long): Int

    @Query("SELECT section_id FROM paper_sections WHERE paper_id = :paperId")
    abstract suspend fun paperSectionIds(paperId: String): List<String>

    @Query("UPDATE paper_sections SET title = :title, sort_order = :sortOrder WHERE section_id = :sectionId AND paper_id = :paperId")
    abstract suspend fun updatePaperSection(sectionId: String, paperId: String, title: String, sortOrder: Long): Int

    @Transaction
    open suspend fun reorderPaperSections(paperId: String, orderedRows: List<PaperSectionsEntity>) {
        require(orderedRows.all { it.paperId == paperId }) { "All sections must belong to the target paper" }
        val requestedIds = orderedRows.map { it.sectionId }
        require(requestedIds.toSet().size == orderedRows.size) { "Duplicate section in reorder request" }
        require(paperSectionIds(paperId).toSet() == requestedIds.toSet()) { "Section list changed during reorder; reload before saving" }
        orderedRows.forEachIndexed { index, row ->
            check(updatePaperSection(row.sectionId, paperId, row.title, index.toLong()) == 1) { "A section changed during reorder" }
        }
    }

    @Query("DELETE FROM paper_sections WHERE section_id = :sectionId AND paper_id = :paperId AND NOT EXISTS (SELECT 1 FROM paper_question_items WHERE section_id = :sectionId)")
    abstract suspend fun deleteEmptyPaperSection(sectionId: String, paperId: String): Int

    @Query("SELECT COUNT(*) FROM paper_question_items WHERE section_id = :sectionId AND paper_id = :paperId")
    abstract suspend fun countItemsInPaperSection(sectionId: String, paperId: String): Int

    @Query("SELECT item_id FROM paper_question_items WHERE paper_id = :paperId AND ((section_id = :sectionId) OR (section_id IS NULL AND :sectionId IS NULL))")
    abstract suspend fun paperItemIdsInSection(paperId: String, sectionId: String?): List<String>

    @Query("UPDATE paper_question_items SET sort_order = :sortOrder WHERE item_id = :itemId AND paper_id = :paperId")
    abstract suspend fun updatePaperItemOrder(itemId: String, paperId: String, sortOrder: Long): Int

    @Transaction
    open suspend fun reorderPaperItems(paperId: String, sectionId: String?, orderedRows: List<PaperQuestionItemsEntity>) {
        require(orderedRows.all { it.paperId == paperId && it.sectionId == sectionId }) { "All items must belong to the target paper section" }
        val requestedIds = orderedRows.map { it.itemId }
        require(requestedIds.toSet().size == orderedRows.size) { "Duplicate item in reorder request" }
        require(paperItemIdsInSection(paperId, sectionId).toSet() == requestedIds.toSet()) { "Question list changed during reorder; reload before saving" }
        orderedRows.forEachIndexed { index, row ->
            check(updatePaperItemOrder(row.itemId, paperId, index.toLong()) == 1) { "A question changed during reorder" }
        }
    }

    @Query("UPDATE paper_question_items SET marks_override = :marks WHERE item_id = :itemId AND paper_id = :paperId")
    abstract suspend fun updatePaperItemMarks(itemId: String, paperId: String, marks: Double?): Int

    @Query("DELETE FROM paper_question_items WHERE item_id = :itemId AND paper_id = :paperId")
    abstract suspend fun deletePaperItem(itemId: String, paperId: String): Int

    @Query("DELETE FROM papers WHERE paper_id = :paperId")
    abstract suspend fun deletePaper(paperId: String): Int

    @Query("SELECT * FROM paper_images WHERE paper_image_id NOT IN (SELECT paper_image_id FROM paper_item_images)")
    abstract suspend fun unreferencedPaperImages(): List<PaperImagesEntity>

    @Query("DELETE FROM paper_images WHERE paper_image_id = :imageId AND paper_image_id NOT IN (SELECT paper_image_id FROM paper_item_images)")
    abstract suspend fun deleteUnreferencedPaperImage(imageId: String): Int

    @Transaction
    open suspend fun createPaperWithSection(paper: PapersEntity, section: PaperSectionsEntity) {
        require(paper.paperId == section.paperId) { "Paper and section IDs must match" }
        require(paperCategoryExists(paper.paperCategoryId) == 1) { "Paper category does not exist" }
        insertPaper(paper)
        insertPaperSection(section)
    }

    @Transaction
    open suspend fun addSnapshotItemWithAssets(
        item: PaperQuestionItemsEntity,
        images: List<PaperImagesEntity>,
        links: List<PaperItemImagesEntity>,
    ): Boolean {
        val hasType = item.typeCqQuestionId != null
        val hasChapter = item.chapterCqQuestionId != null
        if (hasType == hasChapter || paperExists(item.paperId) == 0) return false
        if (item.sectionId != null && sectionBelongsToPaper(item.sectionId, item.paperId) == 0) return false
        if (hasType && typeQuestionExists(item.typeCqQuestionId!!) == 0) return false
        if (hasChapter && chapterQuestionExists(item.chapterCqQuestionId!!) == 0) return false
        require(links.all { it.itemId == item.itemId }) { "Paper image link belongs to another item" }
        require(images.map { it.paperImageId }.toSet().containsAll(links.map { it.paperImageId })) { "Missing paper image metadata" }
        insertPaperItem(item)
        images.forEach { insertPaperImage(it) }
        links.forEach { insertPaperItemImage(it) }
        return true
    }

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

    @Query("SELECT pi.* FROM paper_images pi JOIN paper_item_images pui ON pui.paper_image_id=pi.paper_image_id WHERE pui.item_id=:itemId ORDER BY pui.position, pi.paper_image_id")
    abstract suspend fun paperItemImageAssets(itemId: String): List<PaperImagesEntity>

    @Query("DELETE FROM paper_item_images WHERE item_id = :itemId")
    abstract suspend fun clearPaperItemImages(itemId: String)

    @Query("DELETE FROM paper_item_overrides WHERE item_id = :itemId")
    abstract suspend fun clearPaperItemOverride(itemId: String)

    @Transaction
    open suspend fun replacePaperItemOverride(row: PaperItemOverridesEntity) {
        require(paperItem(row.itemId) != null) { "Paper item does not exist" }
        clearPaperItemOverride(row.itemId)
        insertPaperItemOverride(row)
    }

    @Transaction
    open suspend fun replacePaperItemImages(itemId: String, rows: List<PaperItemImagesEntity>) {
        require(paperItem(itemId) != null) { "Paper item does not exist" }
        require(rows.all { it.itemId == itemId }) { "All images must belong to the target paper item" }
        clearPaperItemImages(itemId)
        rows.sortedWith(compareBy<PaperItemImagesEntity> { it.position }.thenBy { it.paperImageId })
            .forEach { insertPaperItemImage(it) }
    }
}
