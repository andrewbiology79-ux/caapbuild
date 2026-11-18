package com.questionbank.app.domain.hierarchy

/** One row of the Type_CQ hierarchy as the UI sees it (subject, chapter or topic). */
data class HierarchyItem(val id: String, val name: String)

/**
 * One list row with its counts (plan 39.3, UI-02).
 * [childCount]: chapters of a subject, topics of a chapter, always 0 for a topic.
 * [questionCount]: every question row (sub-question) below this item, the same unit as the question list's "মোট N টি প্রশ্ন".
 */
data class HierarchyRow(val id: String, val name: String, val childCount: Int, val questionCount: Int) {
    val isEmpty: Boolean get() = childCount == 0 && questionCount == 0
}

/** The two ancestors of a topic list, for the breadcrumb. */
data class ChapterPath(val subject: HierarchyItem, val chapter: HierarchyItem)

sealed interface AddResult {
    data class Added(val id: String) : AddResult
    data object Blank : AddResult
    data object TooLong : AddResult
    data object Duplicate : AddResult
    data object ParentMissing : AddResult
    data class Failed(val reason: String) : AddResult
}

/** Result of rename, delete and reorder (v0.2.26). */
sealed interface EditResult {
    data object Done : EditResult
    data object Blank : EditResult
    data object TooLong : EditResult
    data object Duplicate : EditResult
    /** The item (or, for reorder, the list) is no longer what the screen showed. */
    data object NotFound : EditResult
    /** Delete refused: the item still holds chapters/topics or questions. Nothing is deleted. */
    data class NotEmpty(val childCount: Int, val questionCount: Int) : EditResult
    data class Failed(val reason: String) : EditResult
}
