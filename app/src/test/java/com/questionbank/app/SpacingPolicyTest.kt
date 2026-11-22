package com.questionbank.app

import com.questionbank.app.ui.settings.SpacingPolicy
import org.junit.Assert.assertEquals
import org.junit.Test

/** Settings reading-text spacing: line spacing 100-200 percent, "<br>" gap and display-formula gap 0-24 dp. */
class SpacingPolicyTest {
    @Test
    fun defaultsKeepTheOldLookAndLieInsideTheRanges() {
        assertEquals(118, SpacingPolicy.LINE_DEFAULT)
        assertEquals(2, SpacingPolicy.BLOCK_GAP_DEFAULT)
        assertEquals(4, SpacingPolicy.BREAK_GAP_DEFAULT)
        assertEquals(SpacingPolicy.LINE_DEFAULT, SpacingPolicy.clampLine(SpacingPolicy.LINE_DEFAULT))
        assertEquals(SpacingPolicy.BREAK_GAP_DEFAULT, SpacingPolicy.clampBreakGap(SpacingPolicy.BREAK_GAP_DEFAULT))
        assertEquals(SpacingPolicy.BLOCK_GAP_DEFAULT, SpacingPolicy.clampBlockGap(SpacingPolicy.BLOCK_GAP_DEFAULT))
    }

    @Test
    fun lineSpacingIsClampedToRange() {
        assertEquals(100, SpacingPolicy.clampLine(99))
        assertEquals(100, SpacingPolicy.clampLine(-5))
        assertEquals(150, SpacingPolicy.clampLine(150))
        assertEquals(200, SpacingPolicy.clampLine(201))
    }

    @Test
    fun lineSpacingStepsToTheNextMultipleOfFive() {
        assertEquals(120, SpacingPolicy.stepLine(118, 1))
        assertEquals(115, SpacingPolicy.stepLine(118, -1))
        assertEquals(125, SpacingPolicy.stepLine(120, 1))
        assertEquals(115, SpacingPolicy.stepLine(120, -1))
        assertEquals(100, SpacingPolicy.stepLine(101, -1))
    }

    @Test
    fun lineSpacingStepsStopAtBothEnds() {
        assertEquals(200, SpacingPolicy.stepLine(199, 1))
        assertEquals(200, SpacingPolicy.stepLine(200, 1))
        assertEquals(100, SpacingPolicy.stepLine(100, -1))
    }

    @Test
    fun multiplierIsPercentDividedByHundred() {
        assertEquals(1.18f, SpacingPolicy.lineMultiplier(118), 0.0001f)
        assertEquals(1.0f, SpacingPolicy.lineMultiplier(0), 0.0001f)
        assertEquals(2.0f, SpacingPolicy.lineMultiplier(500), 0.0001f)
    }

    @Test
    fun gapsAreClampedAndStepByOneDp() {
        assertEquals(0, SpacingPolicy.clampBreakGap(-1))
        assertEquals(24, SpacingPolicy.clampBreakGap(25))
        assertEquals(5, SpacingPolicy.stepBreakGap(4, 1))
        assertEquals(3, SpacingPolicy.stepBreakGap(4, -1))
        assertEquals(0, SpacingPolicy.stepBreakGap(0, -1))
        assertEquals(24, SpacingPolicy.stepBreakGap(24, 1))

        assertEquals(0, SpacingPolicy.clampBlockGap(-7))
        assertEquals(24, SpacingPolicy.clampBlockGap(99))
        assertEquals(3, SpacingPolicy.stepBlockGap(2, 1))
        assertEquals(1, SpacingPolicy.stepBlockGap(2, -1))
        assertEquals(0, SpacingPolicy.stepBlockGap(0, -1))
        assertEquals(24, SpacingPolicy.stepBlockGap(24, 1))
    }
}
