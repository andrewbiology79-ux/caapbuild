package com.questionbank.app

import com.questionbank.app.domain.hierarchy.HierarchyName
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HierarchyNameTest {
    @Test
    fun trimsAndCollapsesWhiteSpace() {
        assertEquals("পদার্থবিজ্ঞান প্রথম পত্র", HierarchyName.clean("  পদার্থবিজ্ঞান \t প্রথম   পত্র \n"))
    }

    @Test
    fun noBreakSpaceCountsAsWhiteSpace() {
        assertEquals("ক খ", HierarchyName.clean("\u00A0ক\u00A0\u00A0খ\u00A0"))
    }

    @Test
    fun blankInputBecomesEmpty() {
        assertTrue(HierarchyName.clean("").isEmpty())
        assertTrue(HierarchyName.clean("   \t\n ").isEmpty())
    }

    @Test
    fun bothSpellingsOfNuktaLettersGiveTheSameName() {
        val precomposed = "সম\u09DF"      // য় as one code point
        val decomposed = "সম\u09AF\u09BC" // য + nukta
        assertEquals(HierarchyName.clean(decomposed), HierarchyName.clean(precomposed))
    }

    @Test
    fun zeroWidthJoinersInsideWordsAreKept() {
        val withZwnj = "র\u200Cে"
        assertEquals(withZwnj, HierarchyName.clean(withZwnj))
        val withZwj = "ক্ষ\u200D"
        assertEquals(withZwj, HierarchyName.clean(withZwj))
    }

    @Test
    fun maxLengthIsTwoHundred() {
        assertEquals(200, HierarchyName.MAX_LENGTH)
    }
}
