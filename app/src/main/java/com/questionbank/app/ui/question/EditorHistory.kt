package com.questionbank.app.ui.question

/** UI mode is deliberately not part of the stored question model. Every newly opened editor starts in MINIMUM. */
enum class EditorMode { MINIMUM, FULL }

/**
 * Bounded undo/redo history for an editor session. Repeated updates to the same field within [groupWindowMs]
 * are coalesced into one step; switching fields creates a new step. Recording after undo truncates the redo branch.
 */
class EditorHistory<T>(initial: T, private val capacity: Int = 80, private val groupWindowMs: Long = 700L) {
    private val entries = ArrayList<T>().apply { add(initial) }
    private var cursor = 0
    private var lastGroup: String? = null
    private var lastAt = 0L

    val canUndo: Boolean get() = cursor > 0
    val canRedo: Boolean get() = cursor < entries.lastIndex

    fun reset(value: T) {
        entries.clear()
        entries.add(value)
        cursor = 0
        lastGroup = null
        lastAt = 0L
    }

    fun record(value: T, group: String, now: Long = System.currentTimeMillis()) {
        if (entries[cursor] == value) return
        val coalesce = canUndo && lastGroup == group && now - lastAt in 0..groupWindowMs
        if (coalesce) {
            entries[cursor] = value
        } else {
            while (entries.lastIndex > cursor) entries.removeAt(entries.lastIndex)
            entries.add(value)
            cursor = entries.lastIndex
            while (entries.size > capacity) {
                entries.removeAt(0)
                cursor = (cursor - 1).coerceAtLeast(0)
            }
        }
        lastGroup = group
        lastAt = now
    }

    fun undo(): T? {
        if (!canUndo) return null
        cursor--
        lastGroup = null
        return entries[cursor]
    }

    fun redo(): T? {
        if (!canRedo) return null
        cursor++
        lastGroup = null
        return entries[cursor]
    }
}
