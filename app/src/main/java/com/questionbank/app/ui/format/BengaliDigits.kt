package com.questionbank.app.ui.format

private const val BENGALI_ZERO = '\u09E6'

/**
 * Replaces every Latin digit 0-9 with the Bengali digit (requirement U-2, decision D-11). All other characters stay as they are,
 * so it is safe to call on a whole sentence. Use it only for text shown on screen: file names, database values and
 * search text keep Latin digits.
 */
fun String.toBengaliDigits(): String {
    if (none { it in '0'..'9' }) return this
    val out = StringBuilder(length)
    for (c in this) out.append(if (c in '0'..'9') BENGALI_ZERO + (c - '0') else c)
    return out.toString()
}

/** Any number as Bengali digits: 2026 becomes ২০২৬. */
fun Number.toBengali(): String = toString().toBengaliDigits()

/** Two-digit padded serial used on list cards: 7 becomes ০৭, 12 becomes ১২, 123 stays three digits. */
fun bengaliSerial(n: Int): String = n.toString().padStart(2, '0').toBengaliDigits()
