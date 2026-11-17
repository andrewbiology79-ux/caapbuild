package com.questionbank.app.domain.hierarchy

/** One row of the Type_CQ hierarchy as the UI sees it (subject, chapter or topic). */
data class HierarchyItem(val id: String, val name: String)

sealed interface AddResult {
    data class Added(val id: String) : AddResult
    data object Blank : AddResult
    data object TooLong : AddResult
    data object Duplicate : AddResult
    data object ParentMissing : AddResult
    data class Failed(val reason: String) : AddResult
}
