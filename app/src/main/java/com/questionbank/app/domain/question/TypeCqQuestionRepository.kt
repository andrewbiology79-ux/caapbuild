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
     * Searches ONE topic (v0.2.27, ADR-011; hashtag words v0.2.29). Words are matched with FTS5 in the question text and short answer (the last word
     * as a prefix) and as plain text in the stimulus. A word that starts with "#" is matched as plain text (with the "#") in the question,
     * the short answer and the stimulus. All words must match. Read-only: nothing is written.
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

    /**
     * Edit drafts (v0.2.29, part B-2). The typed text of an edit that is not saved yet, one per card, stored in `app_metadata`
     * under `draft:type_cq:edit:<groupKey>`. A successful [updateGroup] removes it in the same transaction. Failures are
     * swallowed on purpose (a draft must never break typing), like the new-question draft.
     */
    suspend fun loadEditDraft(groupKey: String): DraftText?
    /** Unlike a new-question draft, a blank text is stored too: emptying every block is a real (refused-on-save) edit state. */
    suspend fun saveEditDraft(groupKey: String, draft: DraftText)
    /** Removes the edit draft of one card (the person chose "discard", or the typed text equals the stored text). */
    suspend fun discardEditDraft(groupKey: String)

    /**
     * The board catalog (v0.2.30c): the built-in boards (seeded on every open) and the custom boards the person added, active
     * ones first. Boards are never deleted here: a board that questions use cannot be removed (foreign key RESTRICT).
     */
    fun observeBoards(): Flow<List<BoardItem>>

    /** Adds a custom board (code A-Z, 0-9, "_"; name any text). Nothing is written when the code or the name is bad or already taken. */
    suspend fun addCustomBoard(rawCode: String, rawName: String): AddBoardResult

    suspend fun loadDraft(topicId: String): DraftText?
    /** A blank draft removes the stored draft. Failures are swallowed on purpose: a draft must never break typing. */
    suspend fun saveDraft(topicId: String, draft: DraftText)
}
