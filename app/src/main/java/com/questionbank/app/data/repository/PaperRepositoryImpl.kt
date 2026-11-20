package com.questionbank.app.data.repository

import com.questionbank.app.data.local.dao.ChapterCqDataDao
import com.questionbank.app.data.local.dao.PaperSourceRowDb
import com.questionbank.app.data.local.dao.SharedDataDao
import com.questionbank.app.data.local.dao.TypeCqQuestionDao
import com.questionbank.app.data.local.entity.PaperImagesEntity
import com.questionbank.app.data.local.entity.PaperItemImagesEntity
import com.questionbank.app.data.local.entity.PaperItemOverridesEntity
import com.questionbank.app.data.local.entity.PaperQuestionItemsEntity
import com.questionbank.app.data.local.entity.PaperCategoriesEntity
import com.questionbank.app.data.local.entity.PaperSectionsEntity
import com.questionbank.app.data.local.entity.PapersEntity
import com.questionbank.app.domain.repository.PaperRepository
import com.questionbank.app.domain.repository.PaperValidation
import com.questionbank.app.media.ImagePipeline
import com.questionbank.app.media.ImageScope
import java.io.File
import java.util.UUID
import kotlinx.coroutines.flow.first
import org.json.JSONObject

class PaperRepositoryImpl(
    private val dao: SharedDataDao,
    private val typeDao: TypeCqQuestionDao,
    private val chapterDao: ChapterCqDataDao,
    private val imagePipeline: ImagePipeline,
    private val beforeWrite: suspend () -> Unit = {},
    private val clock: () -> Long = { System.currentTimeMillis() },
) : PaperRepository {
    override fun observeCategories() = dao.observePaperCategories()
    override fun observePapers(categoryId: String) = dao.observePapers(categoryId)
    override fun observeSections(paperId: String) = dao.observePaperSections(paperId)
    override fun observeItems(paperId: String) = dao.observePaperItems(paperId)

    override suspend fun loadSourcePage(scope: String, query: String, limit: Int, after: PaperSourceRowDb?): List<PaperSourceRowDb> {
        require(scope in setOf("ALL", "TYPE_CQ", "CHAPTER_CQ"))
        return dao.paperSourcePage(
            scope = scope,
            query = query.trim().take(160),
            limit = limit.coerceIn(1, 100) + 1,
            afterSubject = after?.subjectName,
            afterChapter = after?.chapterName,
            afterContainer = after?.containerName,
            afterQuestionId = after?.questionId,
            afterScope = after?.scope,
        )
    }

    override suspend fun loadPaper(paperId: String): PapersEntity? = dao.paper(paperId)

    override suspend fun createCategory(name: String): String {
        val clean = name.trim().take(60)
        require(clean.isNotEmpty()) { "ক্যাটাগরির নাম লিখুন" }
        beforeWrite()
        val now = clock()
        val id = "paper_category_${UUID.randomUUID()}"
        dao.insertPaperCategory(
            PaperCategoriesEntity(
                paperCategoryId = id, name = clean, description = "", color = "", icon = "",
                sortOrder = dao.nextPaperCategorySortOrder(), isSystem = 0L, createdAt = now, updatedAt = now,
            )
        )
        return id
    }

    override suspend fun createPaper(title: String, categoryId: String): String {
        val clean = title.trim()
        require(clean.isNotEmpty()) { "প্রশ্নপত্রের নাম লিখুন" }
        beforeWrite()
        val now = clock()
        val id = "paper_${UUID.randomUUID()}"
        val paper = PapersEntity(
            paperId = id,
            paperCategoryId = categoryId,
            shortName = "",
            title = clean,
            subjectLine = "",
            durationText = "",
            totalMarks = null,
            noteText = "",
            sortOrder = dao.nextPaperSortOrder(categoryId),
            createdAt = now,
            updatedAt = now,
        )
        val section = PaperSectionsEntity("section_${UUID.randomUUID()}", id, "সাধারণ অংশ", 0)
        dao.createPaperWithSection(paper, section)
        return id
    }

    override suspend fun renameCategory(categoryId: String, name: String): Boolean {
        val clean = name.trim().take(60)
        if (clean.isEmpty()) return false
        beforeWrite()
        return dao.renamePaperCategory(categoryId, clean, clock()) == 1
    }

    override suspend fun deleteEmptyCategory(categoryId: String): Boolean {
        if (categoryId == PaperRepository.DEFAULT_CATEGORY_ID) return false
        beforeWrite()
        return dao.deleteEmptyPaperCategory(categoryId) == 1
    }

    override suspend fun deletePaper(paperId: String): Boolean {
        if (dao.paperExists(paperId) == 0) return false
        beforeWrite()
        val deleted = dao.deletePaper(paperId) == 1
        if (deleted) collectOrphanMedia()
        return deleted
    }

    override suspend fun addSection(paperId: String, title: String): String {
        require(dao.paperExists(paperId) == 1) { "প্রশ্নপত্র পাওয়া যায়নি" }
        val clean = title.trim().ifBlank { "নতুন অংশ" }
        val id = "section_${UUID.randomUUID()}"
        beforeWrite()
        dao.insertPaperSection(PaperSectionsEntity(id, paperId, clean, dao.nextSectionSortOrder(paperId)))
        return id
    }

    override suspend fun moveSection(paperId: String, sectionId: String, direction: Int): Boolean {
        if (direction !in setOf(-1, 1)) return false
        val rows = dao.observePaperSections(paperId).first()
        val current = rows.indexOfFirst { it.sectionId == sectionId }
        val target = current + direction
        if (current < 0 || target !in rows.indices) return false
        val reordered = rows.toMutableList().apply { add(target, removeAt(current)) }
        beforeWrite()
        dao.reorderPaperSections(paperId, reordered)
        return true
    }

    override suspend fun deleteEmptySection(paperId: String, sectionId: String): Boolean {
        if (dao.sectionBelongsToPaper(sectionId, paperId) == 0) return false
        if (dao.countItemsInPaperSection(sectionId, paperId) != 0) return false
        beforeWrite()
        return dao.deleteEmptyPaperSection(sectionId, paperId) == 1
    }

    override suspend fun renamePaper(paperId: String, title: String): Boolean {
        val clean = title.trim()
        if (clean.isEmpty()) return false
        beforeWrite()
        return dao.renamePaper(paperId, clean, clock()) == 1
    }

    override suspend fun updatePaperMetadata(
        paperId: String,
        subjectLine: String,
        durationText: String,
        noteText: String,
        totalMarks: Double?,
    ): Boolean {
        if (totalMarks != null && (!totalMarks.isFinite() || totalMarks < 0.0)) return false
        beforeWrite()
        return dao.updatePaperMetadata(paperId, subjectLine.trim(), durationText.trim(), noteText.trim(), totalMarks, clock()) == 1
    }

    override suspend fun addQuestionSnapshot(
        paperId: String,
        sectionId: String?,
        scope: String,
        questionId: String,
    ): Boolean {
        require(scope == "TYPE_CQ" || scope == "CHAPTER_CQ") { "অজানা প্রশ্নের ধরন" }
        val source = (if (scope == "TYPE_CQ") typeDao.paperSource(questionId) else chapterDao.paperSource(questionId))
            ?: return false
        require(source.scope == scope) { "প্রশ্নের scope মেলেনি" }
        val itemId = "paper_item_${UUID.randomUUID()}"
        val solutionRows = if (scope == "TYPE_CQ") {
            typeDao.solutionParts(questionId).map { Triple(it.partType, it.textContent, it.imageId) }
        } else {
            chapterDao.solutionParts(questionId).map { Triple(it.partType, it.textContent, it.imageId) }
        }
        val solutionText = solutionRows.map { it.first to it.second }
        val snapshot = PaperSnapshotCodec.encode(source, solutionText)
        val now = clock()
        val item = PaperQuestionItemsEntity(
            itemId = itemId,
            paperId = paperId,
            sectionId = sectionId,
            typeCqQuestionId = questionId.takeIf { scope == "TYPE_CQ" },
            chapterCqQuestionId = questionId.takeIf { scope == "CHAPTER_CQ" },
            snapshotJson = snapshot,
            sortOrder = dao.nextItemSortOrder(paperId, sectionId),
            marksOverride = null,
            createdAt = now,
        )
        val sourceImages = mutableListOf<Triple<String, String, Long>>()
        source.stimulusId?.let { stimulusId ->
            val rows = if (scope == "TYPE_CQ") typeDao.stimulusImagesFor(stimulusId).map { Triple(it.imageId, it.placement, it.position) }
                else chapterDao.stimulusImages(stimulusId).map { Triple(it.imageId, it.placement, it.position) }
            rows.sortedBy { it.third }.forEach { sourceImages += it }
        }
        solutionRows.forEachIndexed { index, row ->
            if (row.first.equals("IMAGE", true) && row.third != null) sourceImages += Triple(row.third, "SOLUTION", index.toLong())
        }

        val paperImageRows = mutableListOf<PaperImagesEntity>()
        val paperItemImageRows = mutableListOf<PaperItemImagesEntity>()
        val copiedFiles = mutableListOf<String>()
        try {
            sourceImages.forEachIndexed { position, sourceImage ->
                val paperImageId = "paper_image_${UUID.randomUUID()}"
                val asset = imagePipeline.copyImageToPaperStorage(
                    imageId = sourceImage.first,
                    scope = if (scope == "TYPE_CQ") ImageScope.TYPE_CQ else ImageScope.CHAPTER_CQ,
                    paperImageId = paperImageId,
                ) ?: error("প্রশ্নের সঙ্গে যুক্ত একটি ছবি পাওয়া যায়নি")
                copiedFiles += asset.relativePath
                paperImageRows += PaperImagesEntity(
                    paperImageId = paperImageId,
                    relativePath = asset.relativePath,
                    mimeType = asset.mimeType,
                    width = asset.width,
                    height = asset.height,
                    byteSize = asset.byteSize,
                    sha256 = asset.sha256,
                    createdAt = now,
                )
                val placement = when (sourceImage.second) {
                    "TOP" -> "STIMULUS_TOP"
                    "BOTTOM" -> "STIMULUS_BOTTOM"
                    "SOLUTION" -> "SOLUTION"
                    else -> error("অজানা ছবির অবস্থান")
                }
                paperItemImageRows += PaperItemImagesEntity(itemId, paperImageId, position.toLong(), placement)
            }
            beforeWrite()
            val result = dao.addSnapshotItemWithAssets(item, paperImageRows, paperItemImageRows)
            if (!result) copiedFiles.forEach { path -> imagePipeline.deletePaperStorageAsset(path) }
            result
        } catch (error: Exception) {
            copiedFiles.forEach { path -> runCatching { imagePipeline.deletePaperStorageAsset(path) } }
            throw error
        }
    }

    override suspend fun updateItemMarks(paperId: String, itemId: String, marks: Double?): Boolean {
        if (marks != null && (!marks.isFinite() || marks < 0.0)) return false
        beforeWrite()
        return dao.updatePaperItemMarks(itemId, paperId, marks) == 1
    }

    override suspend fun removeItem(paperId: String, itemId: String): Boolean {
        if (dao.paperItem(itemId)?.paperId != paperId) return false
        beforeWrite()
        val removed = dao.deletePaperItem(itemId, paperId) == 1
        if (removed) collectOrphanMedia()
        return removed
    }

    override suspend fun updateItemOverride(
        paperId: String,
        itemId: String,
        questionText: String?,
        stimulusText: String?,
        shortAnswer: String?,
        solutionJson: String?,
    ): Boolean {
        if (dao.paperItem(itemId)?.paperId != paperId) return false
        beforeWrite()
        dao.replacePaperItemOverride(
            PaperItemOverridesEntity(itemId, questionText, stimulusText, shortAnswer, solutionJson, null, clock())
        )
        return true
    }

    override suspend fun loadItemOverride(itemId: String): PaperItemOverridesEntity? = dao.paperItemOverride(itemId)

    override suspend fun loadItemImages(itemId: String): List<PaperImagesEntity> = dao.paperItemImageAssets(itemId)

    override suspend fun loadItemImageLinks(itemId: String): List<PaperItemImagesEntity> = dao.paperItemImages(itemId)

    override suspend fun moveItem(paperId: String, itemId: String, direction: Int): Boolean {
        if (direction !in setOf(-1, 1)) return false
        val allRows = dao.observePaperItems(paperId).first()
        val targetRow = allRows.firstOrNull { it.itemId == itemId } ?: return false
        val sameSection = allRows.filter { it.sectionId == targetRow.sectionId }
        val current = sameSection.indexOfFirst { it.itemId == itemId }
        val target = current + direction
        if (current < 0 || target !in sameSection.indices) return false
        val reordered = sameSection.toMutableList().apply { add(target, removeAt(current)) }
        beforeWrite()
        dao.reorderPaperItems(paperId, targetRow.sectionId, reordered)
        return true
    }

    override suspend fun collectOrphanMedia(): Int {
        val rows = dao.unreferencedPaperImages()
        var cleaned = 0
        rows.forEach { row ->
            val fileRemoved = runCatching { imagePipeline.deletePaperStorageAsset(row.relativePath) }.getOrDefault(false)
            if (fileRemoved) {
                beforeWrite()
                if (dao.deleteUnreferencedPaperImage(row.paperImageId) == 1) cleaned++
            }
        }
        // Recover files copied before a DB insert committed (e.g. process death in the copy/insert gap).
        val knownPaths = dao.allPaperImages().map { it.relativePath }.toSet()
        cleaned += imagePipeline.collectUntrackedPaperFiles(knownPaths)
        return cleaned
    }

    override suspend fun validatePaper(paperId: String): PaperValidation {
        val paper = dao.paper(paperId)
        if (paper == null) return PaperValidation(false, 0, 0.0, listOf("প্রশ্নপত্র পাওয়া যায়নি"))
        val rows = dao.observePaperItems(paperId).first()
        val issues = mutableListOf<String>()
        if (paper.title.isBlank()) issues += "প্রশ্নপত্রের শিরোনাম নেই"
        if (rows.isEmpty()) issues += "কমপক্ষে একটি প্রশ্ন যোগ করুন"
        var marks = 0.0
        rows.forEach { item ->
            val override = dao.paperItemOverride(item.itemId)
            val itemMarks = item.marksOverride ?: override?.marksOverride ?: PaperSnapshotCodec.marks(item.snapshotJson)
            if (!itemMarks.isFinite()) {
                issues += "একটি প্রশ্নের নম্বর বৈধ finite সংখ্যা নয়"
            } else if (itemMarks < 0.0) {
                issues += "একটি প্রশ্নের নম্বর ঋণাত্মক"
            } else {
                marks += itemMarks
            }
            runCatching {
                val json = JSONObject(item.snapshotJson)
                require(json.getInt("schemaVersion") in 1..PaperSnapshotCodec.CURRENT_SCHEMA_VERSION)
                require((override?.questionTextOverride ?: json.optString("question")).isNotBlank())
                override?.solutionJsonOverride?.takeIf { it.isNotBlank() }?.let { raw ->
                    val validObject = runCatching { JSONObject(raw) }.isSuccess
                    val validArray = runCatching { org.json.JSONArray(raw) }.isSuccess
                    require(validObject || validArray) { "Invalid solution override JSON" }
                }
            }.onFailure { issues += "একটি প্রশ্নের snapshot বা override পড়া যাচ্ছে না" }
            dao.paperItemImageAssets(item.itemId).forEach { image ->
                if (!imagePipeline.verifyPaperStorageAsset(image.relativePath, image.sha256)) {
                    issues += "একটি Paper snapshot ছবি অনুপস্থিত বা নষ্ট (${image.paperImageId})"
                }
            }
        }
        if (!marks.isFinite()) {
            issues += "প্রশ্নগুলোর যোগফল finite সংখ্যার সীমা অতিক্রম করেছে"
        }
        if (paper.totalMarks != null && !paper.totalMarks.isFinite()) {
            issues += "ঘোষিত মোট নম্বর বৈধ finite সংখ্যা নয়"
        } else if (paper.totalMarks != null && marks.isFinite() && kotlin.math.abs(paper.totalMarks - marks) > 0.01) {
            issues += "ঘোষিত মোট নম্বর ও প্রশ্নগুলোর যোগফল মেলেনি"
        }
        return PaperValidation(issues.isEmpty(), rows.size, marks, issues.distinct())
    }
}
