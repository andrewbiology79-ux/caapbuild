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

    /**
     * Searches ONE topic (v0.2.27, ADR-011). Words are matched with FTS5 in the question text and short answer (the last word
     * as a prefix) and as plain text in the stimulus. All words must match. Read-only: nothing is written.
     */
    suspend fun search(topicId: String, rawQuery: String): SearchOutcome

    /** One card as saved now, for the edit screen (v0.2.28). Null when it no longer exists. [groupKey] comes from [QuestionGroupKey]. */
    suspend fun loadGroup(topicId: String, groupKey: String): SavedGroup?

    /**
     * Saves changes to an EXISTING group (v0.2.28) in ONE transaction: stimulus text, texts and short answers of stored
     * sub-questions (the FTS update trigger replaces their FTS rows), new rows for labels that were empty, `updated_at`. Reported
     * as [UpdateResult.Updated] only after the rows were read back. Refusals (see [QuestionEditRules]) write nothing.
     */
    suspend fun updateGroup(input: GroupEditInput): UpdateResult

    suspend fun loadDraft(topicId: String): DraftText?
    /** A blank draft removes the stored draft. Failures are swallowed on purpose: a draft must never break typing. */
    suspend fun saveDraft(topicId: String, draft: DraftText)
}
