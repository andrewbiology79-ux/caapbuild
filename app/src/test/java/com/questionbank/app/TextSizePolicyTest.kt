package com.questionbank.app

import com.questionbank.app.ui.settings.TextSizePolicy
import org.junit.Assert.assertEquals
import org.junit.Test

/** Text size from Settings (design 39.4): 12 to 28, default 16, size 16 must not change anything. */
class TextSizePolicyTest {
    @Test
    fun valuesOutsideTheRangeAreClamped() {
        assertEquals(12, TextSizePolicy.clamp(0))
        assertEquals(12, TextSizePolicy.clamp(11))
        assertEquals(28, TextSizePolicy.clamp(29))
        assertEquals(28, TextSizePolicy.clamp(1000))
        assertEquals(20, TextSizePolicy.clamp(20))
    }

    @Test
    fun defaultSizeChangesNothing() {
        assertEquals(1f, TextSizePolicy.scale(TextSizePolicy.DEFAULT), 0.0001f)
    }

    @Test
    fun scaleIsProportionalToTheDefault() {
        assertEquals(1.5f, TextSizePolicy.scale(24), 0.0001f)
        assertEquals(0.75f, TextSizePolicy.scale(12), 0.0001f)
        assertEquals(1.75f, TextSizePolicy.scale(28), 0.0001f)
    }

    @Test
    fun scaleOfAnOutOfRangeSizeUsesTheLimit() {
        assertEquals(0.75f, TextSizePolicy.scale(3), 0.0001f)
        assertEquals(1.75f, TextSizePolicy.scale(99), 0.0001f)
    }

    @Test
    fun stepsStopAtBothEnds() {
        assertEquals(17, TextSizePolicy.step(16, 1))
        assertEquals(15, TextSizePolicy.step(16, -1))
        assertEquals(28, TextSizePolicy.step(28, 1))
        assertEquals(12, TextSizePolicy.step(12, -1))
    }
}
