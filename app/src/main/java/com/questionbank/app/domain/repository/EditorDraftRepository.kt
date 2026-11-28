package com.questionbank.app.domain.repository

interface EditorDraftRepository {
    suspend fun load(scope: String, ownerId: String): String?
    suspend fun save(scope: String, ownerId: String, draftJson: String)
    suspend fun discard(scope: String, ownerId: String)
}
