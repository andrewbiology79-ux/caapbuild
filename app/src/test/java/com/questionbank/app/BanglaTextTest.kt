package com.questionbank.app

import com.questionbank.app.data.local.BanglaText
import com.questionbank.app.data.local.FtsIdAllocator
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class BanglaTextTest {
    @Test
    fun precomposedAndDecomposedNuktaLettersBecomeIdentical() {
        val pairs = listOf(
            "\u09DF" to "\u09AF\u09BC", // য়
            "\u09DC" to "\u09A1\u09BC", // ড়
            "\u09DD" to "\u09A2\u09BC"  // ঢ়
        )
        for ((pre, dec) in pairs) {
            assertNotEquals("raw spellings differ", pre, dec)
            assertEquals(BanglaText.normalize(dec), BanglaText.normalize(pre))
        }
    }

    @Test
    fun splitAndComposedVowelSignsBecomeIdentical() {
        assertEquals(BanglaText.normalize("\u09C7\u09BE"), BanglaText.normalize("\u09CB"))
    }

    @Test
    fun normalizationIsIdempotentAndLeavesPlainTextAlone() {
        val text = "বিদ্যুৎ প্রবাহ কী? দ\u09DFা করে"
        val once = BanglaText.normalize(text)
        assertEquals(once, BanglaText.normalize(once))
        assertEquals("Acid reaction 123", BanglaText.normalize("Acid reaction 123"))
    }

    @Test
    fun allocatorIsStrictlyIncreasingFromTheGivenMaximum() {
        val a = FtsIdAllocator(41)
        assertEquals(42L, a.next())
        assertEquals(43L, a.next())
        assertEquals(1L, FtsIdAllocator(0).next())
    }
}
