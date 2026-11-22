package com.questionbank.app.ui.settings

/**
 * Reading-text spacing chosen in Settings. Every value is a whole number so it is stored exactly.
 *
 * - Line spacing: height of one line of ordinary text as a percent of the font size (100..200, default 118 = the old fixed 1.18x).
 * - "<br>" gap: extra vertical gap between lines that were split with the manual "<br>" marker (0..24 dp, default 4).
 * - Block gap: vertical gap above and below a display formula written with double dollar signs (0..24 dp, default 2 = the old fixed value).
 *
 * Pure logic, so it is unit-tested on the JVM. UI controls and labels are not affected by these values.
 */
object SpacingPolicy {
    const val LINE_MIN = 100
    const val LINE_MAX = 200
    const val LINE_DEFAULT = 118
    private const val LINE_STEP = 5

    const val BREAK_GAP_MIN = 0
    const val BREAK_GAP_MAX = 24
    const val BREAK_GAP_DEFAULT = 4

    const val BLOCK_GAP_MIN = 0
    const val BLOCK_GAP_MAX = 24
    const val BLOCK_GAP_DEFAULT = 2

    fun clampLine(percent: Int): Int = percent.coerceIn(LINE_MIN, LINE_MAX)

    /** Moves to the next multiple of 5 in the given direction (118 -> 120 up, 115 down), then clamps. */
    fun stepLine(percent: Int, direction: Int): Int {
        val next = if (direction > 0) (percent / LINE_STEP + 1) * LINE_STEP else ((percent + LINE_STEP - 1) / LINE_STEP - 1) * LINE_STEP
        return clampLine(next)
    }

    /** Multiplier handed to the text renderer, e.g. 118 -> 1.18f. */
    fun lineMultiplier(percent: Int): Float = clampLine(percent) / 100f

    fun clampBreakGap(dp: Int): Int = dp.coerceIn(BREAK_GAP_MIN, BREAK_GAP_MAX)
    fun stepBreakGap(dp: Int, direction: Int): Int = clampBreakGap(dp + if (direction > 0) 1 else -1)

    fun clampBlockGap(dp: Int): Int = dp.coerceIn(BLOCK_GAP_MIN, BLOCK_GAP_MAX)
    fun stepBlockGap(dp: Int, direction: Int): Int = clampBlockGap(dp + if (direction > 0) 1 else -1)
}
