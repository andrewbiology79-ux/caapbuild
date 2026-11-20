package com.questionbank.app.domain.question

/** Pure rules for adding/removing blocks in the legacy one-row-per-label Type_CQ editor. */
object QuestionEditBlockRules {
    /**
     * Labels that can safely be added as new rows in the current edit transaction.
     * A persisted label remains occupied even after it is marked for deletion because
     * the row is still present until the transactional save commits.
     */
    fun addableLabels(
        allLabels: List<CqLabel>,
        persistedLabels: Set<CqLabel>,
        visibleLabels: Set<CqLabel>,
    ): List<CqLabel> = allLabels.filterNot { it in persistedLabels || it in visibleLabels }

    /**
     * A persisted row can be removed only if at least one other visible/persisted
     * question block will remain after the removal.
     */
    fun canDeletePersistedBlock(remainingPersistedCount: Int, pendingNewBlockCount: Int): Boolean =
        remainingPersistedCount.coerceAtLeast(0) + pendingNewBlockCount.coerceAtLeast(0) > 1
}
