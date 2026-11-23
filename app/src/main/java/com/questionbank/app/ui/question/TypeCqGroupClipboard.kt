package com.questionbank.app.ui.question

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.questionbank.app.domain.question.SavedGroup

/** Process-wide Type CQ group clipboard. A clip always stores whole cards, never partial search-result rows. */
internal object TypeCqGroupClipboard {
    enum class Mode { COPY, CUT }

    data class Payload(
        val sourceTopicId: String,
        val mode: Mode,
        val sourceGroupKeys: List<String>,
        val groups: List<SavedGroup>,
    )

    // Compose-observable process-wide state keeps Paste counts correct when another Type's ViewModel changes it.
    var payload: Payload? by mutableStateOf(null)
        private set

    fun put(value: Payload) { payload = value }
    fun clear() { payload = null }
}
