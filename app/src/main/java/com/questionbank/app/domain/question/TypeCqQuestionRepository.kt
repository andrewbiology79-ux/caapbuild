package com.questionbank.app.domain.question

import kotlinx.coroutines.flow.Flow

/**
 * Type_CQ questions of one topic. The UI talks to this interface only (never to a DAO).
 *
 * [saveGroup] is all-or-nothing: the stimulus, every sub-question, their FTS rows and the removal of the draft happen in
 * ONE database transaction, and the result is [SaveResult.Saved] only after the rows were read back and matched.
 * Drafts survive the app being killed; they live in `app_metadata` under the key `draft:type_cq:<topicId>`.
 */
interface TypeCqQuestionRepository {
    fun observeTopicName(topicId: String): Flow<String?>
    fun observeGroups(topicId: String): Flow<List<SavedGroup>>

    suspend fun saveGroup(input: QuestionGroupInput): SaveResult

    suspend fun loadDraft(topicId: String): DraftText?
    /** A blank draft removes the stored draft. Failures are swallowed on purpose: a draft must never break typing. */
    suspend fun saveDraft(topicId: String, draft: DraftText)
}
