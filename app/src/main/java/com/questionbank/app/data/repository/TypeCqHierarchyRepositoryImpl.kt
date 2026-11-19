package com.questionbank.app.data.repository

import com.questionbank.app.data.local.dao.DeleteOutcome
import com.questionbank.app.data.local.dao.HierarchyRowDb
import com.questionbank.app.data.local.dao.TypeCqChapterDao
import com.questionbank.app.data.local.dao.TypeCqSubjectDao
import com.questionbank.app.data.local.dao.TypeCqTopicDao
import com.questionbank.app.domain.hierarchy.AddResult
import com.questionbank.app.domain.hierarchy.ChapterPath
import com.questionbank.app.domain.hierarchy.EditResult
import com.questionbank.app.domain.hierarchy.HierarchyItem
import com.questionbank.app.domain.hierarchy.HierarchyName
import com.questionbank.app.domain.hierarchy.HierarchyRow
import com.questionbank.app.domain.hierarchy.TypeCqHierarchyRepository
import java.util.UUID
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * IDs are random UUID v4 text; timestamps are epoch milliseconds (UTC). Both can be replaced in tests.
 */
class TypeCqHierarchyRepositoryImpl(
    private val subjects: TypeCqSubjectDao,
    private val chapters: TypeCqChapterDao,
    private val topics: TypeCqTopicDao,
    private val clock: () -> Long = { System.currentTimeMillis() },
    private val newId: () -> String = { UUID.randomUUID().toString() },
) : TypeCqHierarchyRepository {

    override fun observeSubjects(): Flow<List<HierarchyItem>> =
        subjects.observeAll().map { rows -> rows.map { HierarchyItem(it.subjectId, it.name) } }

    override fun observeSubject(subjectId: String): Flow<HierarchyItem?> =
        subjects.observeById(subjectId).map { row -> row?.let { HierarchyItem(it.subjectId, it.name) } }

    override fun observeChapters(subjectId: String): Flow<List<HierarchyItem>> =
        chapters.observeBySubject(subjectId).map { rows -> rows.map { HierarchyItem(it.chapterId, it.name) } }

    override fun observeChapter(chapterId: String): Flow<HierarchyItem?> =
        chapters.observeById(chapterId).map { row -> row?.let { HierarchyItem(it.chapterId, it.name) } }

    override fun observeTopics(chapterId: String): Flow<List<HierarchyItem>> =
        topics.observeByChapter(chapterId).map { rows -> rows.map { HierarchyItem(it.topicId, it.name) } }

    override fun observeSubjectRows(): Flow<List<HierarchyRow>> = subjects.observeRows().map { it.toRows() }

    override fun observeChapterRows(subjectId: String): Flow<List<HierarchyRow>> =
        chapters.observeRows(subjectId).map { it.toRows() }

    override fun observeTopicRows(chapterId: String): Flow<List<HierarchyRow>> =
        topics.observeRows(chapterId).map { it.toRows() }

    override fun observeChapterPath(chapterId: String): Flow<ChapterPath?> =
        chapters.observePath(chapterId).map { row ->
            row?.let {
                ChapterPath(
                    subject = HierarchyItem(it.subjectId, it.subjectName),
                    chapter = HierarchyItem(it.chapterId, it.chapterName),
                )
            }
        }

    private fun List<HierarchyRowDb>.toRows(): List<HierarchyRow> =
        map { HierarchyRow(it.id, it.name, it.childCount, it.questionCount) }

    override suspend fun addSubject(rawName: String): AddResult = guarded(rawName) { name ->
        if (subjects.countByName(name) > 0) return@guarded AddResult.Duplicate
        val id = newId()
        subjects.insertNext(id, name, clock())
        AddResult.Added(id)
    }

    override suspend fun addChapter(subjectId: String, rawName: String): AddResult = guarded(rawName) { name ->
        if (subjects.countById(subjectId) == 0) return@guarded AddResult.ParentMissing
        if (chapters.countByName(subjectId, name) > 0) return@guarded AddResult.Duplicate
        val id = newId()
        chapters.insertNext(id, subjectId, name, clock())
        AddResult.Added(id)
    }

    override suspend fun addTopic(chapterId: String, rawName: String): AddResult = guarded(rawName) { name ->
        if (chapters.countById(chapterId) == 0) return@guarded AddResult.ParentMissing
        if (topics.countByName(chapterId, name) > 0) return@guarded AddResult.Duplicate
        val id = newId()
        topics.insertNext(id, chapterId, name, clock())
        AddResult.Added(id)
    }

    override suspend fun renameSubject(subjectId: String, rawName: String): EditResult = guardedEdit(rawName) { name ->
        if (subjects.countById(subjectId) == 0) return@guardedEdit EditResult.NotFound
        if (subjects.countByNameExcept(name, subjectId) > 0) return@guardedEdit EditResult.Duplicate
        subjects.rename(subjectId, name, clock())
        EditResult.Done
    }

    override suspend fun renameChapter(chapterId: String, rawName: String): EditResult = guardedEdit(rawName) { name ->
        val subjectId = chapters.subjectIdOf(chapterId) ?: return@guardedEdit EditResult.NotFound
        if (chapters.countByNameExcept(subjectId, name, chapterId) > 0) return@guardedEdit EditResult.Duplicate
        chapters.rename(chapterId, name, clock())
        EditResult.Done
    }

    override suspend fun renameTopic(topicId: String, rawName: String): EditResult = guardedEdit(rawName) { name ->
        val chapterId = topics.chapterIdOf(topicId) ?: return@guardedEdit EditResult.NotFound
        if (topics.countByNameExcept(chapterId, name, topicId) > 0) return@guardedEdit EditResult.Duplicate
        topics.rename(topicId, name, clock())
        EditResult.Done
    }

    override suspend fun deleteSubject(subjectId: String): EditResult =
        guardedDelete { subjects.deleteIfEmpty(subjectId) }

    override suspend fun deleteChapter(chapterId: String): EditResult =
        guardedDelete { chapters.deleteIfEmpty(chapterId) }

    override suspend fun deleteTopic(topicId: String): EditResult =
        guardedDelete { topics.deleteIfEmpty(topicId, TypeCqQuestionRepositoryImpl.draftKey(topicId), "draft:type_cq:editor:$topicId") }

    override suspend fun reorderSubjects(orderedIds: List<String>): EditResult =
        guardedReorder { subjects.reorder(orderedIds, clock()) }

    override suspend fun reorderChapters(subjectId: String, orderedIds: List<String>): EditResult =
        guardedReorder { chapters.reorder(subjectId, orderedIds, clock()) }

    override suspend fun reorderTopics(chapterId: String, orderedIds: List<String>): EditResult =
        guardedReorder { topics.reorder(chapterId, orderedIds, clock()) }

    private suspend fun guarded(rawName: String, block: suspend (String) -> AddResult): AddResult {
        val name = HierarchyName.clean(rawName)
        if (name.isEmpty()) return AddResult.Blank
        if (name.length > HierarchyName.MAX_LENGTH) return AddResult.TooLong
        return try {
            block(name)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            AddResult.Failed(e.message ?: e.javaClass.simpleName)
        }
    }

    private suspend fun guardedEdit(rawName: String, block: suspend (String) -> EditResult): EditResult {
        val name = HierarchyName.clean(rawName)
        if (name.isEmpty()) return EditResult.Blank
        if (name.length > HierarchyName.MAX_LENGTH) return EditResult.TooLong
        return try {
            block(name)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            EditResult.Failed(e.message ?: e.javaClass.simpleName)
        }
    }

    private suspend fun guardedDelete(block: suspend () -> DeleteOutcome): EditResult = try {
        when (val outcome = block()) {
            DeleteOutcome.Deleted -> EditResult.Done
            DeleteOutcome.NotFound -> EditResult.NotFound
            is DeleteOutcome.NotEmpty -> EditResult.NotEmpty(outcome.childCount, outcome.questionCount)
        }
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        EditResult.Failed(e.message ?: e.javaClass.simpleName)
    }

    private suspend fun guardedReorder(block: suspend () -> Boolean): EditResult = try {
        if (block()) EditResult.Done else EditResult.NotFound
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        EditResult.Failed(e.message ?: e.javaClass.simpleName)
    }
}
