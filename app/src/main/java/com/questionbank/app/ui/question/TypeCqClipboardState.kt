package com.questionbank.app.ui.question

import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class TypeCqClipboardEntry(
    val sourceTopicId: String,
    val groupKey: String,
    val cut: Boolean,
    /** Unique clipboard identity prevents an older in-flight paste from consuming a newly copied same card. */
    val clipboardId: String = UUID.randomUUID().toString(),
)

/** Process-wide in-app clipboard: remains available while moving between Type-CQ topics. */
object TypeCqClipboardState {
    private val mutableEntries = MutableStateFlow<List<TypeCqClipboardEntry>>(emptyList())
    val entries: StateFlow<List<TypeCqClipboardEntry>> = mutableEntries.asStateFlow()
    private val mutablePasteActive = MutableStateFlow(false)
    val pasteInProgress: StateFlow<Boolean> = mutablePasteActive.asStateFlow()

    private val lock = Any()
    private var pasteActive = false
    /** Copy entries completed by an earlier partial paste; skipped only for the retry of that batch. */
    private val completedCopyIdsForRetry = linkedSetOf<String>()

    fun set(entries: List<TypeCqClipboardEntry>) = synchronized(lock) {
        mutableEntries.value = entries.distinctBy { it.sourceTopicId to it.groupKey }
        completedCopyIdsForRetry.clear()
    }

    fun clear() = synchronized(lock) {
        mutableEntries.value = emptyList()
        completedCopyIdsForRetry.clear()
        pasteActive = false
        mutablePasteActive.value = false
    }

    fun isPasteActive(): Boolean = synchronized(lock) { pasteActive }

    fun beginPaste(): Boolean = synchronized(lock) {
        if (pasteActive) false else {
            pasteActive = true
            mutablePasteActive.value = true
            true
        }
    }

    fun endPaste() = synchronized(lock) {
        pasteActive = false
        mutablePasteActive.value = false
    }

    /** On retry, previously successful Copy entries are skipped; completed Cut entries are removed. */
    fun entriesForPaste(): List<TypeCqClipboardEntry> = synchronized(lock) {
        mutableEntries.value.filterNot { it.clipboardId in completedCopyIdsForRetry }
    }

    /** Resolves a stale retry ledger when every clipboard entry had already committed before cancellation. */
    fun finishEmptyRetry() = synchronized(lock) { completedCopyIdsForRetry.clear() }

    /**
     * Successful Cut entries are consumed. Successful Copy entries remain repeatable after a fully successful batch.
     * If a batch partially fails/is cancelled, successful Copy entries are temporarily skipped on retry so they are
     * not duplicated; after the pending entries succeed, the full Copy clipboard becomes repeatable again.
     */
    fun recordPasteResult(
        successfulCopyIds: Set<String>,
        successfulCutIds: Set<String>,
        hasFailures: Boolean,
    ) = synchronized(lock) {
        if (successfulCutIds.isNotEmpty()) {
            mutableEntries.value = mutableEntries.value.filterNot { it.clipboardId in successfulCutIds }
            completedCopyIdsForRetry.removeAll(successfulCutIds)
        }
        if (hasFailures) completedCopyIdsForRetry.addAll(successfulCopyIds)
        else completedCopyIdsForRetry.clear()
    }
}
