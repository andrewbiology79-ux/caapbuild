package com.questionbank.app

import org.junit.Assert.assertTrue
import org.junit.Test

class EditorLogTest {
    @Test
    fun describeFlagsBlankAndWhitespaceAndNull() {
        assertTrue(EditorLog.describe(null) == "null")
        val blank = EditorLog.describe("")
        assertTrue("len=0" in blank && "blank=true" in blank)
        val padded = EditorLog.describe("  আ\n")
        assertTrue("lead=2" in padded && "trail=1" in padded && "nl=1" in padded && "blank=false" in padded)
    }

    @Test
    fun describeShowsInvisibleJoinersAndNfcChange() {
        assertTrue("zwj=1" in EditorLog.describe("র\u200D"))
        assertTrue("nfcChanges=true" in EditorLog.describe("e\u0301"))
    }

    @Test
    fun partLineDistinguishesTextAndImage() {
        assertTrue(EditorLog.LogPart("p1", "IMAGE", 0, null, "img1").line().contains("image=img1"))
        assertTrue(EditorLog.LogPart("p2", "TEXT", 1, "x", null).line().contains("text{"))
    }

    @Test
    fun loggingBeforeInitNeverThrows() {
        EditorLog.begin("EDIT", "unit-test")
        EditorLog.event("INPUT", "x")
        EditorLog.verify("check", false) { "detail" }
        EditorLog.end("done")
    }
}
