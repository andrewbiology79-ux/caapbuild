package com.questionbank.app.media.recovery

import com.questionbank.app.data.local.dao.MediaDataDao
import com.questionbank.app.media.ImageScope

/** Resolves whether a question-scope image is still referenced before destructive operations. */
class ImageReferenceResolver(private val dao: MediaDataDao) {
    suspend fun referenceCount(imageId: String, scope: ImageScope): Int = when (scope) {
        ImageScope.TYPE_CQ -> dao.typeImageReferenceCount(imageId)
        ImageScope.CHAPTER_CQ -> dao.chapterImageReferenceCount(imageId)
    }

    suspend fun deleteIfUnreferenced(imageId: String, scope: ImageScope): Boolean = when (scope) {
        ImageScope.TYPE_CQ -> dao.deleteTypeImageIfUnreferenced(imageId)
        ImageScope.CHAPTER_CQ -> dao.deleteChapterImageIfUnreferenced(imageId)
    }
}
