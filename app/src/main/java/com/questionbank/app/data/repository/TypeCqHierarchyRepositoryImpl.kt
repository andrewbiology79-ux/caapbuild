package com.questionbank.app.data.repository

import com.questionbank.app.data.local.dao.TypeCqChapterDao
import com.questionbank.app.data.local.dao.TypeCqSubjectDao
import com.questionbank.app.data.local.dao.TypeCqTopicDao
import com.questionbank.app.domain.hierarchy.AddResult
import com.questionbank.app.domain.hierarchy.HierarchyItem
import com.questionbank.app.domain.hierarchy.HierarchyName
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
}
