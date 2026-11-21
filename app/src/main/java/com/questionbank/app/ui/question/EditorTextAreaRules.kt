package com.questionbank.app.ui.question

/** Shared resize constraints for all stimulus, question, answer and solution text areas. */
object EditorTextAreaRules {
    const val ABSOLUTE_MIN_HEIGHT_DP = 56f
    const val MAX_HEIGHT_DP = 620f

    /** Keeps one full line visible after reserving top padding and the bottom-right resize grip. */
    fun minimumOneLineHeightDp(fontSizeSp: Int, systemFontScale: Float = 1f): Float {
        val safeScale = systemFontScale.takeIf { it.isFinite() && it > 0f } ?: 1f
        val oneLineHeight = fontSizeSp.coerceAtLeast(1) * safeScale * 1.5f
        return maxOf(ABSOLUTE_MIN_HEIGHT_DP, oneLineHeight + 32f)
    }

    fun clampHeightDp(requestedHeightDp: Float, fontSizeSp: Int, systemFontScale: Float = 1f): Float {
        val minimum = minimumOneLineHeightDp(fontSizeSp, systemFontScale)
        if (!requestedHeightDp.isFinite()) return minimum
        return requestedHeightDp.coerceIn(minimum, maxOf(minimum, MAX_HEIGHT_DP))
    }
}
