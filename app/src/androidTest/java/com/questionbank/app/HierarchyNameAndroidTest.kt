package com.questionbank.app

import androidx.test.ext.junit.runners.AndroidJUnit4
import com.questionbank.app.domain.hierarchy.HierarchyName
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Same rules as HierarchyNameTest, but on the Android runtime (ICU), where the v0.2.21 regex failed. */
@RunWith(AndroidJUnit4::class)
class HierarchyNameAndroidTest {
    @Test
    fun cleansWhiteSpaceOnAndroid() {
        assertEquals("পদার্থবিজ্ঞান প্রথম পত্র", HierarchyName.clean("  পদার্থবিজ্ঞান \t প্রথম   পত্র \n"))
        assertEquals("ক খ", HierarchyName.clean("\u00A0ক\u00A0\u00A0খ\u00A0"))
        assertTrue(HierarchyName.clean(" \t\n ").isEmpty())
    }

    @Test
    fun normalizesNuktaLettersAndKeepsJoinersOnAndroid() {
        assertEquals(HierarchyName.clean("সম\u09AF\u09BC"), HierarchyName.clean("সম\u09DF"))
        val withZwnj = "র\u200Cে"
        assertEquals(withZwnj, HierarchyName.clean(withZwnj))
    }
}
