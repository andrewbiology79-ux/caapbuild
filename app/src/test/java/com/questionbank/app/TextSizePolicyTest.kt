package com.questionbank.app

import com.questionbank.app.ui.settings.TextSizePolicy
import org.junit.Assert.assertEquals
import org.junit.Test

/** Settings body-text size is 12–28 sp, default 16; UI controls are not scaled by this policy. */
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
    fun contentFontSizeUsesTheSelectedSettingValue() {
        assertEquals(12, TextSizePolicy.contentFontSizeSp(-3))
        assertEquals(16, TextSizePolicy.contentFontSizeSp(16))
        assertEquals(24, TextSizePolicy.contentFontSizeSp(24))
        assertEquals(28, TextSizePolicy.contentFontSizeSp(99))
    }

    @Test
    fun stepsStopAtBothEnds() {
        assertEquals(17, TextSizePolicy.step(16, 1))
        assertEquals(15, TextSizePolicy.step(16, -1))
        assertEquals(28, TextSizePolicy.step(28, 1))
        assertEquals(12, TextSizePolicy.step(12, -1))
    }
}
