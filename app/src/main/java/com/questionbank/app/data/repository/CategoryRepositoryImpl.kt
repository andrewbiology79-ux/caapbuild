package com.questionbank.app.data.repository

import com.questionbank.app.data.local.dao.CategoryDataDao
import com.questionbank.app.domain.repository.CategoryRepository
import com.questionbank.app.data.local.entity.TypeCqQuestionCategoriesEntity
import com.questionbank.app.data.local.entity.ChapterCqQuestionCategoriesEntity
import java.util.UUID

class CategoryRepositoryImpl(
    private val dao: CategoryDataDao,
    private val beforeWrite: suspend () -> Unit = {},
) : CategoryRepository {
    override suspend fun addTypeCategory(name: String): Boolean {
        val n=name.trim(); if(n.isBlank()) return false; val now=System.currentTimeMillis(); beforeWrite()
        return try { dao.insertTypeCategory(TypeCqQuestionCategoriesEntity("tcat_${UUID.randomUUID()}", n, "", "", "", 999, 0, now, now)); true } catch (_: Exception) { false }
    }
    override suspend fun renameTypeCategory(id: String, name: String, now: Long): Boolean {
        val n = name.trim(); if (n.isBlank()) return false
        beforeWrite()
        return safeWrite { dao.renameTypeCategory(id, n, now) > 0 }
    }
    override suspend fun setTypeCategoryArchived(id: String, archived: Boolean, now: Long): Boolean { beforeWrite(); return if(archived) dao.archiveTypeIfUnused(id,now) else dao.setTypeCategoryArchived(id,0,now)>0 }
    override suspend fun addChapterCategory(name: String): Boolean {
        val n=name.trim(); if(n.isBlank()) return false; val now=System.currentTimeMillis(); beforeWrite()
        return try { dao.insertChapterCategory(ChapterCqQuestionCategoriesEntity("ccat_${UUID.randomUUID()}", n, "", "", "", 999, 0, now, now)); true } catch (_: Exception) { false }
    }
    override suspend fun renameChapterCategory(id: String, name: String, now: Long): Boolean {
        val n = name.trim(); if (n.isBlank()) return false
        beforeWrite()
        return safeWrite { dao.renameChapterCategory(id, n, now) > 0 }
    }
    override suspend fun setChapterCategoryArchived(id: String, archived: Boolean, now: Long): Boolean { beforeWrite(); return if(archived) dao.archiveChapterIfUnused(id,now) else dao.setChapterCategoryArchived(id,0,now)>0 }
    override suspend fun reassignAndArchiveTypeCategory(sourceId: String, targetId: String, now: Long): Boolean {
        beforeWrite()
        return safeWrite { dao.reassignAndArchiveType(sourceId, targetId, now) }
    }
    override suspend fun reassignAndArchiveChapterCategory(sourceId: String, targetId: String, now: Long): Boolean {
        beforeWrite()
        return safeWrite { dao.reassignAndArchiveChapter(sourceId, targetId, now) }
    }
}
