package com.questionbank.app.ui.settings

/**
 * Body-text size chosen by the owner in Settings: a whole number from 12 to 28, default 16.
 * It is applied to question, stimulus, short-answer and solution content, not to UI controls or labels.
 * Pure logic, so it is unit-tested on the JVM.
 */
object TextSizePolicy {
    const val MIN = 12
    const val MAX = 28
    const val DEFAULT = 16

    fun clamp(size: Int): Int = size.coerceIn(MIN, MAX)

    fun contentFontSizeSp(size: Int): Int = clamp(size)

    fun step(size: Int, delta: Int): Int = clamp(size + delta)
}
