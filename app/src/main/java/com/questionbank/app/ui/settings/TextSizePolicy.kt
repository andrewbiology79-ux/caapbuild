package com.questionbank.app.ui.settings

/**
 * Text size chosen by the owner in Settings (design 39.4): a whole number from 12 to 28, default 16.
 * The whole app is scaled from it: size 16 changes nothing, size 24 makes every text 1.5 times larger.
 * Pure logic, so it is unit-tested on the JVM.
 */
object TextSizePolicy {
    const val MIN = 12
    const val MAX = 28
    const val DEFAULT = 16

    fun clamp(size: Int): Int = size.coerceIn(MIN, MAX)

    fun scale(size: Int): Float = clamp(size) / DEFAULT.toFloat()

    fun step(size: Int, delta: Int): Int = clamp(size + delta)
}
