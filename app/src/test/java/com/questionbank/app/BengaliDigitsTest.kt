package com.questionbank.app

import com.questionbank.app.ui.format.bengaliSerial
import com.questionbank.app.ui.format.toBengali
import com.questionbank.app.ui.format.toBengaliDigits
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

/** Requirement U-2 / decision D-11: numbers on screen are written with Bengali digits through one formatter. */
class BengaliDigitsTest {
    @Test
    fun allTenDigitsAreConverted() {
        assertEquals("\u09E6\u09E7\u09E8\u09E9\u09EA\u09EB\u09EC\u09ED\u09EE\u09EF", "0123456789".toBengaliDigits())
    }

    @Test
    fun onlyDigitsChangeInsideASentence() {
        assertEquals("মোট \u09E7\u09E8 টি প্রশ্ন, নম্বর \u09E7.\u09EB", "মোট 12 টি প্রশ্ন, নম্বর 1.5".toBengaliDigits())
    }

    @Test
    fun textWithoutLatinDigitsIsReturnedUnchanged() {
        val text = "প্রশ্নব্যাংক Question Bank \u09E7\u09E8"
        assertSame(text, text.toBengaliDigits())
    }

    @Test
    fun numbersOfAnyTypeAreFormatted() {
        assertEquals("\u09E8\u09E6\u09E8\u09EC", 2026.toBengali())
        assertEquals("\u09E7\u09E6\u09E6\u09E6\u09E6\u09E6\u09E6\u09E6\u09E6\u09E6\u09E6", 10000000000L.toBengali())
        assertEquals("\u09E7\u09EB.\u09EB", 15.5.toBengali())
    }

    @Test
    fun serialIsPaddedToTwoDigits() {
        assertEquals("\u09E6\u09EB", bengaliSerial(5))
        assertEquals("\u09E7\u09E8", bengaliSerial(12))
        assertEquals("\u09E7\u09E8\u09E9", bengaliSerial(123))
    }

    @Test
    fun emptyTextStaysEmpty() {
        assertEquals("", "".toBengaliDigits())
    }
}
