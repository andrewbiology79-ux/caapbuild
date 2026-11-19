package com.questionbank.app.data.repository

import com.questionbank.app.data.local.dao.SharedDataDao
import com.questionbank.app.data.local.entity.AppMetadataEntity
import com.questionbank.app.domain.repository.EditorDraftRepository

/** Stores opaque editor draft JSON in app_metadata; it does not interpret or discard hidden editor fields. */
class EditorDraftRepositoryImpl(
    private val dao: SharedDataDao,
    private val clock: () -> Long = System::currentTimeMillis,
    private val beforeWrite: suspend () -> Unit = {},
) : EditorDraftRepository {
    private fun key(scope: String, ownerId: String): String {
        require(scope == "type_cq" || scope == "chapter_cq") { "Unknown editor scope" }
        require(ownerId.isNotBlank()) { "Draft owner is required" }
        return "draft:$scope:editor:$ownerId"
    }

    override suspend fun load(scope: String, ownerId: String): String? = dao.metadata(key(scope, ownerId))

    override suspend fun save(scope: String, ownerId: String, draftJson: String) {
        require(draftJson.isNotBlank()) { "Draft JSON cannot be blank" }
        beforeWrite()
        dao.putMetadata(AppMetadataEntity(key(scope, ownerId), draftJson, clock()))
    }

    override suspend fun discard(scope: String, ownerId: String) {
        beforeWrite()
        dao.deleteMetadata(key(scope, ownerId))
    }
}
