package com.questionbank.app

import com.questionbank.app.ui.question.EditorTextAreaRules
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class EditorTextAreaRulesTest {
    @Test fun minimumHeightFitsOneLineAndResizeGrip() {
        assertEquals(56f, EditorTextAreaRules.minimumOneLineHeightDp(12), 0.01f)
        assertEquals(56f, EditorTextAreaRules.minimumOneLineHeightDp(16), 0.01f)
        assertEquals(74f, EditorTextAreaRules.minimumOneLineHeightDp(28), 0.01f)
    }

    @Test fun minimumHeightHonorsSystemFontScale() {
        assertEquals(68f, EditorTextAreaRules.minimumOneLineHeightDp(16, 1.5f), 0.01f)
    }

    @Test fun resizeCannotGoBelowOneLineOrAboveMaximum() {
        assertEquals(56f, EditorTextAreaRules.clampHeightDp(20f, 16), 0.01f)
        assertEquals(74f, EditorTextAreaRules.clampHeightDp(20f, 28), 0.01f)
        assertEquals(620f, EditorTextAreaRules.clampHeightDp(900f, 16), 0.01f)
        assertTrue(EditorTextAreaRules.clampHeightDp(Float.NaN, 16).isNaN().not())
    }
}
